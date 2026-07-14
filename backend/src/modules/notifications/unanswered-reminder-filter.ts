// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { parseCallMeta } from '../engagement/engagement-service.js';

export type ReminderLastMessage = {
  content: string | null;
  contentType: string;
};

function parseStoredContent(content: string | null): unknown {
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

function isBirthdayCard(message: ReminderLastMessage, parsedContent: unknown): boolean {
  if (message.contentType !== 'contact_card' || !parsedContent || typeof parsedContent !== 'object') return false;
  const payload = parsedContent as Record<string, unknown>;
  if (payload.action !== 'show.profile') return false;
  const birthdayText = [payload.title, payload.description, payload.params]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return birthdayText.includes('sinh nhat') || birthdayText.includes('birthday');
}

/** Skip Zalo birthday notices and completed calls; only missed calls still need a reply. */
export function shouldRemindForLastMessage(message: ReminderLastMessage | undefined): boolean {
  if (!message) return true;
  const parsedContent = parseStoredContent(message.content);
  if (isBirthdayCard(message, parsedContent)) return false;
  if (message.contentType !== 'call') return true;
  const callMeta = parseCallMeta(parsedContent, false);
  return callMeta?.isMissed === true;
}
