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
import { getUnansweredExcludedCrmTagIds } from './unanswered-reminder-settings.js';
import { shouldRemindForLastMessage } from './unanswered-reminder-filter.js';

const CRON_SCHEDULE = '*/1 * * * *';
const UNANSWERED_THRESHOLD_MS = 15 * 60 * 1000;
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const DEDUP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SCAN_PER_ORG = 500;
// Keep each Zalo payload comfortably below the personal-message SDK limit.
const MAX_ITEMS_PER_MESSAGE = 2;

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

const FRIENDLY_CONTENT_TYPE: Record<string, string> = {
  image: 'Khách đã gửi một hình ảnh',
  video: 'Khách đã gửi một video',
  file: 'Khách đã gửi một tệp đính kèm',
  voice: 'Khách đã gửi một tin nhắn thoại',
  audio: 'Khách đã gửi một tin nhắn thoại',
  sticker: 'Khách đã gửi một sticker',
  gif: 'Khách đã gửi một ảnh GIF',
  link: 'Khách đã gửi một liên kết',
  location: 'Khách đã gửi vị trí',
  contact_card: 'Khách đã gửi một danh thiếp',
  qr_code: 'Khách đã gửi một mã QR',
  bank_transfer: 'Khách đã gửi thông tin chuyển khoản',
  call: 'Khách có một cuộc gọi nhỡ',
};

function friendlyPreview(candidate: ReminderCandidate): string {
  const message = candidate.messages[0];
  if (!message) return 'Không có nội dung xem trước';
  if (message.contentType !== 'text') {
    return FRIENDLY_CONTENT_TYPE[message.contentType] || 'Khách đã gửi một tin nhắn';
  }
  if (!message.content) return 'Khách đã gửi một tin nhắn';
  const compact = message.content.replace(/\s+/g, ' ').trim();
  const preview = compact.length > 90 ? `${compact.slice(0, 87)}...` : compact;
  return `"${preview}"`;
}

export function buildUnansweredReminderMessage(
  candidates: ReminderCandidate[],
  nowMs = Date.now(),
  context?: { totalCandidates: number; partNumber: number; totalParts: number; itemOffset: number },
): string {
  const lines = candidates.flatMap((candidate, index) => {
    const customer = candidate.contact?.fullName?.trim() || 'Khách hàng chưa đặt tên';
    const nick = candidate.zaloAccount.displayName?.trim() || 'Tài khoản chưa đặt tên';
    const preview = friendlyPreview(candidate);
    return [
      ...(index > 0 ? [''] : []),
      `${(context?.itemOffset ?? 0) + index + 1}. ${customer}`,
      `- Đã chờ: ${waitLabel(candidate.lastMessageAt, nowMs)}`,
      `- Tin nhắn cuối: ${preview}`,
      `- Tài khoản Zalo: ${nick}`,
      `- Mở hội thoại: ${config.appUrl.replace(/\/+$/, '')}/chat/${candidate.id}`,
    ];
  });
  const totalCandidates = context?.totalCandidates ?? candidates.length;
  const partLabel = context && context.totalParts > 1
    ? ` (phần ${context.partNumber}/${context.totalParts})`
    : '';
  return [
    'NHẮC KHÁCH HÀNG ĐANG CHỜ PHẢN HỒI',
    `Có ${totalCandidates} hội thoại đã chờ quá 15 phút${partLabel}.`,
    '',
    ...lines,
    '',
    'Vui lòng kiểm tra và phản hồi khách sớm.',
  ].join('\n');
}

async function loadCandidates(orgId: string, now: Date, excludedTagIds: string[]): Promise<ReminderCandidate[]> {
  const candidates = await prisma.conversation.findMany({
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
      ...(excludedTagIds.length
        ? {
            contact: {
              is: {
                tagAssignments: {
                  none: {
                    removedAt: null,
                    tagId: { in: excludedTagIds },
                    tag: {
                      archivedAt: null,
                      scope: 'crm' as const,
                      source: 'manual_crm' as const,
                    },
                  },
                },
              },
            },
          }
        : {}),
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
  return candidates.filter((candidate) => shouldRemindForLastMessage(candidate.messages[0]));
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
  const excluded = await getUnansweredExcludedCrmTagIds(org.id);
  const candidates = await loadCandidates(org.id, now, excluded.tagIds);
  const claimed = await claimCandidates(org.id, candidates, now);
  if (!claimed.length) return { scanned: candidates.length, notified: 0, skipped: null };

  const batches: ClaimedCandidate[][] = [];
  for (let index = 0; index < claimed.length; index += MAX_ITEMS_PER_MESSAGE) {
    batches.push(claimed.slice(index, index + MAX_ITEMS_PER_MESSAGE));
  }
  const sentDedupIds = new Set<string>();
  try {
    for (let index = 0; index < batches.length; index++) {
      const batch = batches[index];
      const message = buildUnansweredReminderMessage(batch, now.getTime(), {
        totalCandidates: claimed.length,
        partNumber: index + 1,
        totalParts: batches.length,
        itemOffset: index * MAX_ITEMS_PER_MESSAGE,
      });
      await api.sendMessage({ msg: message, urgency: 1 }, org.internalNotifyGroupThreadId, 1);
      batch.forEach((candidate) => sentDedupIds.add(candidate.dedupId));
      logger.info(
        `[unanswered-reminder] Sent org=${org.name} group=${org.internalNotifyGroupThreadId} part=${index + 1}/${batches.length} count=${batch.length} chars=${message.length}`,
      );
    }
    logger.info(
      `[unanswered-reminder] Sent org=${org.name} group=${org.internalNotifyGroupThreadId} count=${claimed.length}`,
    );
    return { scanned: candidates.length, notified: claimed.length, skipped: null };
  } catch (err) {
    // Keep successful-part claims; only unsent candidates should retry next minute.
    const unsentIds = claimed
      .filter((candidate) => !sentDedupIds.has(candidate.dedupId))
      .map((candidate) => candidate.dedupId);
    if (unsentIds.length) {
      await prisma.notifyDedupState.deleteMany({ where: { id: { in: unsentIds } } });
    }
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
  logger.info(`[unanswered-reminder] Started, threshold=15m schedule="${CRON_SCHEDULE}" exclusions=org-settings`);
}

export function stopUnansweredReminderCron(): void {
  cronTask?.stop();
  cronTask = null;
}
