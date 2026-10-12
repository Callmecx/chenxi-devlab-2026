export type Category = '创作工作坊' | '城市漫游' | '灵感对谈';
export interface Session {
  id: string;
  number: string;
  title: string;
  english: string;
  category: Category;
  start: string;
  end: string;
  capacity: number;
  location: string;
  description: string;
  takeaway: string;
  color: string;
  art: 'print' | 'walk' | 'talk' | 'sound';
}

/** Entire catalog is fictional, authored for this portfolio. No external event API. */
export const sessions: Session[] = [
  {
    id: 'print',
    number: '01',
    title: '把城市，印在纸上',
    english: 'CITY IN PRINT',
    category: '创作工作坊',
    start: '10:00',
    end: '11:30',
    capacity: 12,
    location: 'A 区 · 印刷工坊',
    description:
      '从一片树影、一段街角纹理开始，用几何形状与两种颜色，制作属于你的城市视觉海报。无需设计基础，带着好奇心就好。',
    takeaway: '一张属于你的双色城市海报',
    color: 'orange',
    art: 'print',
  },
  {
    id: 'walk',
    number: '02',
    title: '换个角度，读成都',
    english: 'A DIFFERENT WALK',
    category: '城市漫游',
    start: '10:30',
    end: '12:00',
    capacity: 18,
    location: 'B 区 · 城市观察站',
    description:
      '跟随一张不寻常的观察清单，在虚构的街区路线里寻找城市的配色、字形与生活细节。把熟悉的日常变成新的灵感。',
    takeaway: '一份个人城市观察笔记',
    color: 'blue',
    art: 'walk',
  },
  {
    id: 'talk',
    number: '03',
    title: '灵感，不必等天亮',
    english: 'IDEAS AFTER HOURS',
    category: '灵感对谈',
    start: '14:00',
    end: '15:00',
    capacity: 24,
    location: 'C 区 · 开放会客厅',
    description:
      '从“我有一个想法”到“我做出了一个作品”，一场关于创意习惯、开始行动与持续创作的小型对谈。',
    takeaway: '一份可以马上开始的创意行动清单',
    color: 'lilac',
    art: 'talk',
  },
  {
    id: 'sound',
    number: '04',
    title: '听见日常的另一面',
    english: 'SOUND OF EVERYDAY',
    category: '创作工作坊',
    start: '15:30',
    end: '17:00',
    capacity: 8,
    location: 'D 区 · 声音实验室',
    description: '把雨滴、脚步与街边的细碎声音重新编排，用简单的节奏练习，探索日常声音的创造力。',
    takeaway: '一段 30 秒的城市声音草稿',
    color: 'lime',
    art: 'sound',
  },
];

export interface Draft {
  selectedIds: string[];
  nickname: string;
  tickets: number;
  note: string;
  consent: boolean;
}
export interface Booking {
  id: string;
  selectedIds: string[];
  nickname: string;
  tickets: number;
  createdAt: string;
  status: 'confirmed' | 'cancelled';
}
export const emptyDraft = (): Draft => ({
  selectedIds: [],
  nickname: '',
  tickets: 1,
  note: '',
  consent: false,
});
const minutes = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
};
export const overlaps = (a: Session, b: Session): boolean =>
  minutes(a.start) < minutes(b.end) && minutes(b.start) < minutes(a.end);
export const remaining = (session: Session, bookings: Booking[]): number =>
  Math.max(
    0,
    session.capacity -
      bookings
        .filter((b) => b.status === 'confirmed' && b.selectedIds.includes(session.id))
        .reduce((n, b) => n + b.tickets, 0),
  );

export function validateSelection(
  ids: string[],
  tickets: number,
  bookings: Booking[],
): string | null {
  if (!Number.isInteger(tickets) || tickets < 1 || tickets > 3)
    return '每次预约请选择 1–3 个演示名额。';
  if (ids.length === 0) return '请先选择至少一场体验。';
  if (ids.length > 3) return '一天最多选择 3 场体验，给灵感留一点空白。';
  if (new Set(ids).size !== ids.length) return '体验选择重复，请重新选择。';
  const chosen = ids.map((id) => sessions.find((s) => s.id === id));
  if (chosen.some((s) => !s)) return '体验已不存在，请重新选择。';
  const valid = chosen as Session[];
  for (let i = 0; i < valid.length; i++) {
    if (remaining(valid[i], bookings) < tickets)
      return `「${valid[i].title}」剩余名额不足，请减少人数或选择其他体验。`;
    for (let j = i + 1; j < valid.length; j++)
      if (overlaps(valid[i], valid[j])) return '这两场体验的时间有重叠，请选择其他时段。';
  }
  return null;
}

export function validateProfile(draft: Draft): string | null {
  if (!/^[\p{L}\p{N}_ -]{2,16}$/u.test(draft.nickname.trim()))
    return '请填写 2–16 位虚构昵称，仅使用文字、数字、空格或短横线。';
  if (draft.note.length > 80) return '灵感备注请保持在 80 字以内。';
  if (!draft.consent) return '请确认你了解这是本地模拟预约。';
  return null;
}

export function validateBooking(draft: Draft, bookings: Booking[]): string | null {
  const error =
    validateSelection(draft.selectedIds, draft.tickets, bookings) || validateProfile(draft);
  if (error) return error;
  if (
    bookings.some(
      (b) =>
        b.status === 'confirmed' &&
        b.nickname.toLocaleLowerCase() === draft.nickname.trim().toLocaleLowerCase() &&
        b.selectedIds.some((id) => draft.selectedIds.includes(id)),
    )
  )
    return '这个昵称已经预约过所选体验，请在「我的行程」查看，或先取消原预约。';
  return null;
}

export function parseDraft(value: unknown): Draft {
  if (!value || typeof value !== 'object') return emptyDraft();
  const input = value as Record<string, unknown>;
  return {
    selectedIds: Array.isArray(input.selectedIds)
      ? [
          ...new Set(
            input.selectedIds.filter(
              (id): id is string => typeof id === 'string' && sessions.some((s) => s.id === id),
            ),
          ),
        ].slice(0, 3)
      : [],
    nickname: typeof input.nickname === 'string' ? input.nickname.slice(0, 16) : '',
    tickets:
      typeof input.tickets === 'number' &&
      Number.isInteger(input.tickets) &&
      input.tickets >= 1 &&
      input.tickets <= 3
        ? input.tickets
        : 1,
    note: typeof input.note === 'string' ? input.note.slice(0, 80) : '',
    consent: input.consent === true,
  };
}

export function parseBookings(value: unknown): Booking[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  const accepted: Booking[] = [];
  for (const item of value) {
    if (accepted.length === 200) break;
    if (!item || typeof item !== 'object') continue;
    const b = item as Partial<Booking>;
    if (
      typeof b.id !== 'string' ||
      !/^PL-[a-zA-Z0-9-]{6,80}$/.test(b.id) ||
      ids.has(b.id) ||
      typeof b.nickname !== 'string' ||
      !/^[\p{L}\p{N}_ -]{2,16}$/u.test(b.nickname.trim()) ||
      (b.status !== 'confirmed' && b.status !== 'cancelled') ||
      typeof b.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(b.createdAt)) ||
      typeof b.tickets !== 'number' ||
      !Array.isArray(b.selectedIds) ||
      !b.selectedIds.every((id) => typeof id === 'string')
    )
      continue;
    const draft: Draft = {
      selectedIds: [...b.selectedIds],
      nickname: b.nickname.trim(),
      tickets: b.tickets,
      note: '',
      consent: true,
    };
    // Restore newest valid records first. Cumulative capacity and duplicate reservations
    // obey the same rules as a live submission; cancelled records consume no capacity.
    const error =
      b.status === 'confirmed'
        ? validateBooking(draft, accepted)
        : validateSelection(draft.selectedIds, draft.tickets, []);
    if (error) continue;
    ids.add(b.id);
    accepted.push({
      id: b.id,
      selectedIds: draft.selectedIds,
      nickname: draft.nickname,
      tickets: draft.tickets,
      createdAt: b.createdAt,
      status: b.status,
    });
  }
  return accepted;
}
