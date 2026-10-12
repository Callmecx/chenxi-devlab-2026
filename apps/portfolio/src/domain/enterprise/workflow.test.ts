import { describe, expect, it } from 'vitest';
import { createEnterpriseState, invoiceCents, parseYuan, transition, type Command } from './workflow';

function shippedState() {
  let state = createEnterpriseState();
  for (const type of ['approve', 'purchase', 'receive', 'ship'] as const) state = transition(state, { id: type, type }).state;
  return state;
}
describe('independent enterprise simulation', () => {
  it('keeps inventory conserved from partial reservation through procurement and shipment', () => {
    let state = createEnterpriseState();
    state = transition(state, { id: 'a', type: 'approve' }).state;
    expect([state.stock, state.reserved, state.purchased]).toEqual([30, 30, 0]);
    state = transition(state, { id: 'p', type: 'purchase' }).state;
    expect([state.stock, state.purchased]).toEqual([30, 20]);
    state = transition(state, { id: 'r', type: 'receive' }).state;
    expect([state.stock, state.reserved]).toEqual([50, 50]);
    state = transition(state, { id: 's', type: 'ship' }).state;
    expect([state.stock, state.reserved, state.shipped]).toEqual([0, 0, 50]);
    expect(invoiceCents(state)).toBe(25000000);
  });
  it('rejects premature operations without changing the original state', () => {
    const state = createEnterpriseState();
    for (const command of [{ id: 'p', type: 'purchase' }, { id: 'r', type: 'receive' }, { id: 's', type: 'ship' }, { id: 'm', type: 'pay', cents: 10 }] as Command[]) {
      const result = transition(state, command);
      expect(result.ok).toBe(false);
      expect(result.state).toBe(state);
      expect(state.journal).toEqual([]);
    }
  });
  it('supports exact partial settlement and rejects overpayment', () => {
    let state = shippedState();
    state = transition(state, { id: 'pay1', type: 'pay', cents: 10000000 }).state;
    expect(state.phase).toBe('shipped');
    expect(invoiceCents(state) - state.paidCents).toBe(15000000);
    expect(transition(state, { id: 'over', type: 'pay', cents: 15000001 }).ok).toBe(false);
    state = transition(state, { id: 'pay2', type: 'pay', cents: 15000000 }).state;
    expect(state.phase).toBe('settled');
    expect(state.paidCents).toBe(invoiceCents(state));
  });
  it('replays the same payment once and refuses the same key with another amount', () => {
    const payment: Command = { id: 'payment', type: 'pay', cents: 10000000 };
    const paid = transition(shippedState(), payment).state;
    const repeated = transition(paid, payment);
    expect(repeated.replayed).toBe(true);
    expect(repeated.state).toBe(paid);
    expect(transition(paid, { ...payment, cents: 20000000 }).ok).toBe(false);
    expect(paid.journal).toHaveLength(5);
  });
  it('prevents double receiving with a different request key', () => {
    let state = createEnterpriseState();
    for (const type of ['approve', 'purchase', 'receive'] as const) state = transition(state, { id: type, type }).state;
    expect(transition(state, { id: 'receive-again', type: 'receive' }).ok).toBe(false);
    expect(state.stock).toBe(50);
  });
  it('parses currency as integer cents and rejects rounding or alternate numeric syntax', () => {
    expect(parseYuan('100.01')).toBe(10001);
    for (const invalid of ['1.001', '1e3', '-1', 'Infinity', '', '1,000']) expect(parseYuan(invalid)).toBeNull();
    expect(transition(shippedState(), { id: 'fraction', type: 'pay', cents: 0.1 }).ok).toBe(false);
  });
  it('resets to a clean independent simulation without retained receipts', () => {
    const played = shippedState();
    const reset = createEnterpriseState();
    expect(played.journal).toHaveLength(4);
    expect(reset.phase).toBe('draft');
    expect(reset.requests).toEqual({});
    expect(reset.stock).toBe(30);
  });
});
