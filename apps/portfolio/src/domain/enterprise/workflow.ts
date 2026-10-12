export type Phase = 'draft' | 'approved' | 'purchased' | 'received' | 'shipped' | 'settled';
export type Command = { id: string } & ({ type: 'approve' | 'purchase' | 'receive' | 'ship' } | { type: 'pay'; cents: number });
export interface EnterpriseState {
  phase: Phase; demand: number; stock: number; reserved: number; purchased: number;
  shipped: number; unitPriceCents: number; paidCents: number;
  requests: Record<string, string>; journal: { id: string; text: string }[];
}
export const phaseLabels: Record<Phase, string> = { draft: '销售草稿', approved: '已审批 · 待补货', purchased: '采购在途', received: '已收货 · 可出库', shipped: '已出库 · 待结清', settled: '已结清' };
export function createEnterpriseState(): EnterpriseState {
  return { phase: 'draft', demand: 50, stock: 30, reserved: 0, purchased: 0, shipped: 0, unitPriceCents: 500000, paidCents: 0, requests: {}, journal: [] };
}
export function parseYuan(value: string): number | null {
  if (!/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
export const invoiceCents = (state: EnterpriseState) => state.shipped * state.unitPriceCents;
export function transition(state: EnterpriseState, command: Command) {
  const fail = (message: string) => ({ ok: false as const, state, message, replayed: false });
  if (!command.id.trim()) return fail('请求标识不能为空。');
  const fingerprint = JSON.stringify(command.type === 'pay' ? { type: command.type, cents: command.cents } : { type: command.type });
  if (Object.hasOwn(state.requests, command.id)) {
    if (state.requests[command.id] !== fingerprint) return fail('同一请求标识不能用于不同内容。');
    return { ok: true as const, state, message: '已识别原请求，返回当前状态；没有重复记账。', replayed: true };
  }
  const next: EnterpriseState = { ...state, requests: { ...state.requests }, journal: [...state.journal] };
  let text = '';
  switch (command.type) {
    case 'approve':
      if (state.phase !== 'draft') return fail('仅销售草稿可以审批；已处理的单据不能再次预留库存。');
      next.reserved = Math.min(state.demand, state.stock); next.phase = 'approved';
      text = `审批需求 ${state.demand} 台，预留 ${next.reserved} 台，缺口 ${state.demand - next.reserved} 台。`; break;
    case 'purchase':
      if (state.phase !== 'approved') return fail('请先审批销售单，再按缺口生成关联采购。');
      next.purchased = state.demand - state.reserved; next.phase = 'purchased';
      text = `生成关联采购 ${next.purchased} 台，尚未增加现货。`; break;
    case 'receive':
      if (state.phase !== 'purchased') return fail('只有在途采购可以收货；不能重复增加库存。');
      next.stock += state.purchased; next.reserved += state.purchased; next.phase = 'received';
      text = `全量收货 ${state.purchased} 台，现货 ${next.stock} 台，销售预留补足至 ${next.reserved} 台。`; break;
    case 'ship':
      if (state.phase !== 'received' || state.reserved !== state.demand || state.stock < state.demand) return fail('必须先收货并补足全部预留，才能全量出库。');
      next.stock -= state.demand; next.reserved = 0; next.shipped = state.demand; next.phase = 'shipped';
      text = `全量出库 ${next.shipped} 台，生成模拟应收款；未发生真实交易。`; break;
    case 'pay':
      if (state.phase !== 'shipped') return fail('仅已出库且未结清的单据可以登记收款。');
      if (!Number.isSafeInteger(command.cents) || command.cents <= 0) return fail('收款金额必须为正数，并精确到分。');
      if (command.cents > invoiceCents(state) - state.paidCents) return fail('收款金额不能超过剩余应收。');
      next.paidCents += command.cents;
      if (next.paidCents === invoiceCents(state)) next.phase = 'settled';
      text = `登记模拟收款 ¥${(command.cents / 100).toFixed(2)}，${next.phase === 'settled' ? '已结清' : '仍有未收余额'}。`; break;
  }
  next.requests[command.id] = fingerprint;
  next.journal.push({ id: command.id, text });
  return { ok: true as const, state: next, message: text, replayed: false };
}
