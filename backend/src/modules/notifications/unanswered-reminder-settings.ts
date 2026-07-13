// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

export const UNANSWERED_REMINDER_EXCLUDED_TAGS_KEY = 'unanswered_reminder_excluded_crm_tag_ids';
export const DEFAULT_UNANSWERED_EXCLUDED_LABELS = ['Đồng nghiệp'];

function parseTagIds(value: string | null): string[] | null {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== 'string')) return null;
    return Array.from(new Set(parsed.map((id) => id.trim()).filter(Boolean)));
  } catch {
    return null;
  }
}

export async function getUnansweredExcludedCrmTagIds(orgId: string): Promise<{
  tagIds: string[];
  usesDefault: boolean;
}> {
  const setting = await prisma.appSetting.findUnique({
    where: {
      orgId_settingKey: {
        orgId,
        settingKey: UNANSWERED_REMINDER_EXCLUDED_TAGS_KEY,
      },
    },
    select: { valuePlain: true },
  });

  if (setting) {
    const configured = parseTagIds(setting.valuePlain);
    if (configured !== null) return { tagIds: configured, usesDefault: false };
    logger.warn(`[unanswered-reminder] Invalid excluded CRM tag setting for org=${orgId}; using default`);
  }

  const defaultTags = await prisma.tag.findMany({
    where: {
      orgId,
      scope: 'crm',
      source: 'manual_crm',
      archivedAt: null,
      name: { in: DEFAULT_UNANSWERED_EXCLUDED_LABELS, mode: 'insensitive' },
    },
    select: { id: true },
  });
  return { tagIds: defaultTags.map((tag) => tag.id), usesDefault: true };
}

export async function saveUnansweredExcludedCrmTagIds(orgId: string, tagIds: string[]): Promise<void> {
  await prisma.appSetting.upsert({
    where: {
      orgId_settingKey: {
        orgId,
        settingKey: UNANSWERED_REMINDER_EXCLUDED_TAGS_KEY,
      },
    },
    create: {
      orgId,
      settingKey: UNANSWERED_REMINDER_EXCLUDED_TAGS_KEY,
      valuePlain: JSON.stringify(tagIds),
    },
    update: { valuePlain: JSON.stringify(tagIds), valueEncrypted: null },
  });
}
