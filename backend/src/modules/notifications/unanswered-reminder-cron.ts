// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Remind the internal Zalo work group when a customer has waited more than 15 minutes.
 * One inbound state is notified once; a newer customer message creates a new dedup key.
 */
import cron from 'node-cron';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { runSystemQuery, withTenant } from '../../shared/tenant/tenant-context.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { config } from '../../config/index.js';

const CRON_SCHEDULE = '*/1 * * * *';
const UNANSWERED_THRESHOLD_MS = 15 * 60 * 1000;
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const DEDUP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SCAN_PER_ORG = 500;
const MAX_ITEMS_IN_MESSAGE = 12;
const EXCLUDED_CRM_LABEL = 'Đồng nghiệp';

let cronTask: ReturnType<typeof cron.schedule> | null = null;
let cronRunning = false;

type ReminderCandidate = {
  id: string;
  orgId: string;
  lastMessageAt: Date | null;
  contact: { fullName: string | null } | null;
  zaloAccount: { displayName: string | null };
  messages: Array<{ content: string | null; contentType: string }>;
};

type ClaimedCandidate = ReminderCandidate & { dedupId: string };

function reminderKey(candidate: ReminderCandidate): string {
  return `unanswered-15m:${candidate.id}:${candidate.lastMessageAt?.toISOString() || 'unknown'}`;
}

function waitLabel(lastMessageAt: Date | null, nowMs = Date.now()): string {
  if (!lastMessageAt) return 'trên 15 phút';
  const minutes = Math.max(15, Math.floor((nowMs - lastMessageAt.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;
  if (hours < 24) return remain ? `${hours} giờ ${remain} phút` : `${hours} giờ`;
  const days = Math.floor(hours / 24);
  return `${days} ngày ${hours % 24} giờ`;
}

function cleanPreview(candidate: ReminderCandidate): string {
  const message = candidate.messages[0];
  if (!message) return '';
  if (message.contentType !== 'text' || !message.content) return `[${message.contentType || 'tin nhắn'}]`;
  const compact = message.content.replace(/\s+/g, ' ').trim();
  return compact.length > 90 ? `${compact.slice(0, 87)}...` : compact;
}

export function buildUnansweredReminderMessage(
  candidates: ReminderCandidate[],
  nowMs = Date.now(),
): string {
  const shown = candidates.slice(0, MAX_ITEMS_IN_MESSAGE);
  const lines = shown.flatMap((candidate, index) => {
    const customer = candidate.contact?.fullName?.trim() || 'Khách hàng chưa đặt tên';
    const nick = candidate.zaloAccount.displayName?.trim() || 'Nick Zalo';
    const preview = cleanPreview(candidate);
    return [
      `${index + 1}. ${customer} - chờ ${waitLabel(candidate.lastMessageAt, nowMs)}`,
      `   Nick: ${nick}${preview ? ` | Tin cuối: ${preview}` : ''}`,
      `   ${config.appUrl.replace(/\/+$/, '')}/chat/${candidate.id}`,
    ];
  });
  const remaining = candidates.length - shown.length;
  if (remaining > 0) lines.push(`... và ${remaining} khách khác đang chờ trả lời.`);
  return [
    `NHẮC TRẢ LỜI KHÁCH > 15 PHÚT (${candidates.length})`,
    '',
    ...lines,
  ].join('\n');
}

async function loadCandidates(orgId: string, now: Date): Promise<ReminderCandidate[]> {
  return prisma.conversation.findMany({
    where: {
      orgId,
      threadType: 'user',
      isVirtual: false,
      deletedAt: null,
      isReplied: false,
      contactId: { not: null },
      lastMessageAt: {
        lte: new Date(now.getTime() - UNANSWERED_THRESHOLD_MS),
        gte: new Date(now.getTime() - LOOKBACK_MS),
      },
      contact: {
        is: {
          tagAssignments: {
            none: {
              removedAt: null,
              tag: {
                archivedAt: null,
                scope: 'crm',
                source: 'manual_crm',
                name: { equals: EXCLUDED_CRM_LABEL, mode: 'insensitive' },
              },
            },
          },
        },
      },
    },
    select: {
      id: true,
      orgId: true,
      lastMessageAt: true,
      contact: { select: { fullName: true } },
      zaloAccount: { select: { displayName: true } },
      messages: {
        where: { senderType: { not: 'self' }, isDeleted: false },
        orderBy: { sentAt: 'desc' },
        take: 1,
        select: { content: true, contentType: true },
      },
    },
    orderBy: { lastMessageAt: 'desc' },
    take: MAX_SCAN_PER_ORG,
  });
}

async function claimCandidates(orgId: string, candidates: ReminderCandidate[], now: Date): Promise<ClaimedCandidate[]> {
  if (!candidates.length) return [];
  const keys = candidates.map(reminderKey);
  const existing = await prisma.notifyDedupState.findMany({
    where: { orgId, notifyKey: { in: keys }, expiresAt: { gt: now } },
    select: { notifyKey: true },
  });
  const existingKeys = new Set(existing.map(row => row.notifyKey));
  const claimed: ClaimedCandidate[] = [];
  for (const candidate of candidates) {
    const notifyKey = reminderKey(candidate);
    if (existingKeys.has(notifyKey)) continue;
    try {
      const row = await prisma.notifyDedupState.create({
        data: {
          orgId,
          notifyKey,
          counter: 1,
          firstSentAt: now,
          lastSeenAt: now,
          expiresAt: new Date(now.getTime() + DEDUP_RETENTION_MS),
        },
        select: { id: true },
      });
      claimed.push({ ...candidate, dedupId: row.id });
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err;
    }
  }
  return claimed;
}

async function processOrganization(org: {
  id: string;
  name: string;
  systemNotifyZaloAccountId: string | null;
  internalNotifyGroupThreadId: string | null;
}): Promise<{ scanned: number; notified: number; skipped: string | null }> {
  if (!org.systemNotifyZaloAccountId || !org.internalNotifyGroupThreadId) {
    return { scanned: 0, notified: 0, skipped: 'missing sender or group config' };
  }

  const api = zaloPool.getApi(org.systemNotifyZaloAccountId);
  if (!api) return { scanned: 0, notified: 0, skipped: 'system sender disconnected' };

  const now = new Date();
  const candidates = await loadCandidates(org.id, now);
  const claimed = await claimCandidates(org.id, candidates, now);
  if (!claimed.length) return { scanned: candidates.length, notified: 0, skipped: null };

  try {
    const message = buildUnansweredReminderMessage(claimed, now.getTime());
    await api.sendMessage({ msg: message, urgency: 1 }, org.internalNotifyGroupThreadId, 1);
    logger.info(
      `[unanswered-reminder] Sent org=${org.name} group=${org.internalNotifyGroupThreadId} count=${claimed.length}`,
    );
    return { scanned: candidates.length, notified: claimed.length, skipped: null };
  } catch (err) {
    // A failed external send must be retryable on the next minute.
    await prisma.notifyDedupState.deleteMany({ where: { id: { in: claimed.map(item => item.dedupId) } } });
    throw err;
  }
}

export async function runUnansweredReminderSweep(): Promise<{
  organizations: number;
  scanned: number;
  notified: number;
  errors: number;
}> {
  const organizations = await runSystemQuery(() =>
    prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        systemNotifyZaloAccountId: true,
        internalNotifyGroupThreadId: true,
      },
    }),
  );

  let scanned = 0;
  let notified = 0;
  let errors = 0;
  for (const org of organizations) {
    try {
      const result = await withTenant(org.id, () => processOrganization(org));
      scanned += result.scanned;
      notified += result.notified;
      if (result.skipped) logger.debug(`[unanswered-reminder] Skip org=${org.name}: ${result.skipped}`);
    } catch (err) {
      errors++;
      logger.error(`[unanswered-reminder] Org ${org.name} failed:`, err);
    }
  }
  return { organizations: organizations.length, scanned, notified, errors };
}

export function startUnansweredReminderCron(): void {
  if (cronTask) return;
  cronTask = cron.schedule(CRON_SCHEDULE, async () => {
    if (cronRunning) return;
    cronRunning = true;
    try {
      const stats = await runUnansweredReminderSweep();
      if (stats.notified || stats.errors) logger.info(`[unanswered-reminder] Cycle ${JSON.stringify(stats)}`);
    } finally {
      cronRunning = false;
    }
  });
  logger.info(`[unanswered-reminder] Started, threshold=15m schedule="${CRON_SCHEDULE}" exclude="${EXCLUDED_CRM_LABEL}"`);
}

export function stopUnansweredReminderCron(): void {
  cronTask?.stop();
  cronTask = null;
}
