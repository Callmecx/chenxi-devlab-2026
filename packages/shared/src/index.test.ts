import { describe, it, expect } from 'vitest';
import { formatMoney } from './index';
describe('integer money formatting', () => {
  it('preserves cents and zero', () => { expect(formatMoney(0)).toBe('¥0.00'); expect(formatMoney(12990)).toBe('¥129.90'); });
  it('rejects invalid money', () => { for (const n of [-1, NaN, Infinity, 1.2]) expect(() => formatMoney(n)).toThrow(); });
});
