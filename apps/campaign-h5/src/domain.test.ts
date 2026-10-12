import { describe, expect, it } from 'vitest';
import {
  emptyDraft,
  overlaps,
  parseBookings,
  parseDraft,
  remaining,
  sessions,
  validateBooking,
  validateProfile,
  validateSelection,
  type Booking,
} from './domain';

const booking: Booking = {
  id: 'PL-demo-123456',
  selectedIds: ['sound'],
  nickname: '橘子星人',
  tickets: 3,
  createdAt: '2026-10-12T04:00:00Z',
  status: 'confirmed',
};
describe('Pulse booking rules', () => {
  it('detects partial time overlaps and allows separate slots', () => {
    expect(overlaps(sessions[0], sessions[1])).toBe(true);
    expect(overlaps(sessions[2], sessions[3])).toBe(false);
    expect(validateSelection(['print', 'walk'], 1, [])).toContain('重叠');
  });
  it('requires known, unique sessions and 1–3 integer tickets', () => {
    expect(validateSelection([], 1, [])).toContain('至少');
    expect(validateSelection(['missing'], 1, [])).toContain('不存在');
    expect(validateSelection(['print', 'print'], 1, [])).toContain('重复');
    for (const count of [0, -1, 1.5, 4, NaN])
      expect(validateSelection(['print'], count, [])).not.toBeNull();
  });
  it('prevents over-capacity booking but accepts exact capacity', () => {
    const records = [booking, { ...booking, id: 'PL-demo-234567' }];
    expect(remaining(sessions[3], records)).toBe(2);
    expect(validateSelection(['sound'], 3, records)).toContain('不足');
    expect(validateSelection(['sound'], 2, records)).toBeNull();
  });
  it('releases capacity when a booking is cancelled', () => {
    expect(remaining(sessions[3], [{ ...booking, status: 'cancelled' }])).toBe(8);
  });
  it('validates nickname, remark length and demonstration consent', () => {
    const draft = { ...emptyDraft(), nickname: '橘子星人', consent: true };
    expect(validateProfile(draft)).toBeNull();
    expect(validateProfile({ ...draft, nickname: 'x' })).toContain('2–16');
    expect(validateProfile({ ...draft, nickname: '<script>' })).not.toBeNull();
    expect(validateProfile({ ...draft, note: 'a'.repeat(81) })).toContain('80');
    expect(validateProfile({ ...draft, consent: false })).toContain('确认');
  });
  it('prevents duplicate reservations for the same nickname and experience', () => {
    const draft = {
      ...emptyDraft(),
      nickname: ' 橘子星人 ',
      consent: true,
      selectedIds: ['sound'],
    };
    expect(validateBooking(draft, [booking])).toContain('已经预约');
    expect(validateBooking(draft, [{ ...booking, status: 'cancelled' }])).toBeNull();
    expect(validateBooking({ ...draft, selectedIds: ['talk'] }, [booking])).toBeNull();
  });
  it('normalizes unsafe or incompatible persisted drafts', () => {
    expect(parseDraft(null)).toEqual(emptyDraft());
    expect(
      parseDraft({
        selectedIds: ['print', 'print', 'missing', 42],
        tickets: -8,
        nickname: 'a'.repeat(50),
        note: 'b'.repeat(100),
        consent: 'true',
      }),
    ).toEqual({
      selectedIds: ['print'],
      tickets: 1,
      nickname: 'a'.repeat(16),
      note: 'b'.repeat(80),
      consent: false,
    });
  });
  it('drops corrupt, duplicate and impossible persisted booking records', () => {
    expect(
      parseBookings([
        booking,
        booking,
        null,
        {},
        { ...booking, id: 'wrong' },
        { ...booking, id: 'PL-demo-334567', tickets: 0 },
        { ...booking, id: 'PL-demo-434567', selectedIds: ['print', 'walk'] },
        { ...booking, id: 'PL-demo-534567', createdAt: 'invalid' },
      ]),
    ).toEqual([booking]);
  });
  it('restores only records that fit cumulative capacity, retaining other valid records', () => {
    const records = Array.from({ length: 5 }, (_, index) => ({
      ...booking,
      id: `PL-print-${index}`,
      selectedIds: ['print'],
      nickname: `演示用户${index}`,
    }));
    const restored = parseBookings([
      ...records,
      { ...booking, id: 'PL-later-123', selectedIds: ['talk'] },
    ]);
    expect(restored).toHaveLength(5);
    expect(restored.some((record) => record.id === 'PL-print-4')).toBe(false);
    expect(remaining(sessions[0], restored)).toBe(0);
    expect(restored.at(-1)?.selectedIds).toEqual(['talk']);
  });
  it('rejects duplicate restored nickname/session pairs, including case and space variants', () => {
    const original = { ...booking, nickname: 'TestUser' };
    expect(
      parseBookings([original, { ...original, id: 'PL-next-1234', nickname: ' testuser ' }]),
    ).toEqual([original]);
  });
  it('restores cancelled history without consuming seats, but rejects reused cancelled IDs', () => {
    const cancelled: Booking = { ...booking, status: 'cancelled' };
    const valid = { ...booking, id: 'PL-next-1234' };
    expect(
      parseBookings([cancelled, cancelled, { ...booking, nickname: '其他昵称' }, valid]),
    ).toEqual([cancelled, valid]);
    expect(remaining(sessions[3], parseBookings([cancelled, valid]))).toBe(5);
  });
});
