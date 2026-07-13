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

/** Connected/unknown calls are complete interactions; only missed calls still need a reply. */
export function shouldRemindForLastMessage(message: ReminderLastMessage | undefined): boolean {
  if (!message || message.contentType !== 'call') return true;
  const callMeta = parseCallMeta(parseStoredContent(message.content), false);
  return callMeta?.isMissed === true;
}
