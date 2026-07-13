// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { buildUnansweredReminderMessage } from '../src/modules/notifications/unanswered-reminder-cron.js';

describe('unanswered reminder message', () => {
  it('formats a link reminder in friendly Vietnamese', () => {
    const now = Date.parse('2026-07-13T08:15:00.000Z');
    const message = buildUnansweredReminderMessage([
      {
        id: 'f785bf49-5896-41e9-8a21-0a2a91093699',
        orgId: 'org-1',
        lastMessageAt: new Date(now - 15 * 60_000),
        contact: { fullName: 'Chăm Sóc Kh Ct Southpro' },
        zaloAccount: { displayName: 'Nhà Thuốc Kiểm Nghiệm' },
        messages: [{ content: 'https://example.com', contentType: 'link' }],
      },
    ], now);

    expect(message).toContain('NHẮC KHÁCH HÀNG ĐANG CHỜ PHẢN HỒI');
    expect(message).toContain('Có 1 hội thoại đã chờ quá 15 phút.');
    expect(message).toContain('1. Chăm Sóc Kh Ct Southpro');
    expect(message).toContain('- Đã chờ: 15 phút');
    expect(message).toContain('- Tin nhắn cuối: Khách đã gửi một liên kết');
    expect(message).toContain('- Tài khoản Zalo: Nhà Thuốc Kiểm Nghiệm');
    expect(message).not.toContain('[link]');
  });

  it('labels split digest parts and keeps global numbering', () => {
    const now = Date.parse('2026-07-13T08:15:00.000Z');
    const candidate = {
      id: 'conversation-3',
      orgId: 'org-1',
      lastMessageAt: new Date(now - 20 * 60_000),
      contact: { fullName: 'Khách thứ ba' },
      zaloAccount: { displayName: 'Nhà Thuốc Trường Thọ' },
      messages: [{ content: null, contentType: 'image' }],
    };
    const message = buildUnansweredReminderMessage([candidate], now, {
      totalCandidates: 4,
      partNumber: 2,
      totalParts: 2,
      itemOffset: 2,
    });

    expect(message).toContain('Có 4 hội thoại đã chờ quá 15 phút (phần 2/2).');
    expect(message).toContain('3. Khách thứ ba');
  });
});
