// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { shouldRemindForLastMessage } from '../src/modules/notifications/unanswered-reminder-filter.js';

function call(action: string, duration: number): { contentType: string; content: string } {
  return {
    contentType: 'call',
    content: JSON.stringify({
      action,
      params: JSON.stringify({ duration, isCaller: 0, calltype: 0 }),
    }),
  };
}

describe('unanswered reminder call filter', () => {
  it('keeps normal inbound messages', () => {
    expect(shouldRemindForLastMessage({ contentType: 'text', content: 'Tư vấn giúp mình' })).toBe(true);
  });

  it('skips a connected call', () => {
    expect(shouldRemindForLastMessage(call('recommened.calltime', 28))).toBe(false);
  });

  it('keeps an explicit missed call', () => {
    expect(shouldRemindForLastMessage(call('recommened.misscall', 0))).toBe(true);
  });

  it('treats zero-duration calltime as missed', () => {
    expect(shouldRemindForLastMessage(call('recommened.calltime', 0))).toBe(true);
  });

  it('skips malformed call payloads instead of sending a false reminder', () => {
    expect(shouldRemindForLastMessage({ contentType: 'call', content: '{bad-json' })).toBe(false);
  });

  it('skips Zalo birthday contact cards', () => {
    expect(shouldRemindForLastMessage({
      contentType: 'contact_card',
      content: JSON.stringify({
        title: '14/07 Sinh nhật của Hoàng Anh',
        description: 'Hãy gửi lời chúc tốt đẹp!',
        action: 'show.profile',
        params: JSON.stringify({ notifyTxt: 'Hôm nay (14/07) là sinh nhật của Hoàng Anh' }),
      }),
    })).toBe(false);
  });

  it('keeps regular contact cards', () => {
    expect(shouldRemindForLastMessage({
      contentType: 'contact_card',
      content: JSON.stringify({ title: 'Nguyễn Văn A', action: 'show.profile' }),
    })).toBe(true);
  });
});
