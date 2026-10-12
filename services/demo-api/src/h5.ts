import type {
  Booking,
  CreateBookingInput,
} from "../../../packages/shared/src/api.ts";
import { RULE_VERSION } from "../../../packages/shared/src/api.ts";
import { campaignRoutes } from "./catalog.ts";
import { DomainError, newId } from "./database.ts";
import type { SessionState } from "./database.ts";
export function refreshH5(state: SessionState, now: number) {
  for (const slot of state.slots) {
    if (slot.status !== "CANCELLED" && Date.parse(slot.endsAt) <= now)
      slot.status = "ENDED";
    else if (slot.status === "OPEN" && Date.parse(slot.deadline) <= now)
      slot.status = "CLOSED";
    slot.available = slot.capacity - slot.reserved;
  }
  for (const booking of state.bookings) {
    if (booking.status !== "CONFIRMED") continue;
    const slot = state.slots.find((s) => s.id === booking.slotId)!;
    if (slot.status === "CANCELLED") {
      booking.status = "ACTIVITY_CANCELLED";
      slot.reserved -= booking.participantCount;
      slot.available = slot.capacity - slot.reserved;
    } else if (slot.status === "ENDED") booking.status = "EXPIRED";
  }
}
export function createBooking(
  state: SessionState,
  input: CreateBookingInput,
  now: number,
): Booking {
  if (!input.rulesAccepted)
    throw new DomainError(
      "VALIDATION_ERROR",
      "请先阅读并接受模拟预约规则。",
      400,
    );
  if (input.rulesVersion !== RULE_VERSION)
    throw new DomainError("RULES_CHANGED", "规则已更新，请重新阅读并确认。");
  const slot = state.slots.find((s) => s.id === input.slotId);
  if (!slot) throw new DomainError("NOT_FOUND", "场次不存在。", 404);
  if (slot.status !== "OPEN" || now >= Date.parse(slot.deadline))
    throw new DomainError("SLOT_CLOSED", "该场次当前不可预约。");
  if (
    state.bookings.some(
      (b) => b.campaignId === "weekend" && b.status === "CONFIRMED",
    )
  )
    throw new DomainError(
      "BOOKING_EXISTS",
      "当前活动已有有效预约，请查询或先取消。",
    );
  if (slot.capacity - slot.reserved < input.participantCount)
    throw new DomainError("SOLD_OUT", "剩余名额不足，本次预约未创建。");
  if (state.bookings.length >= 100)
    throw new DomainError("RATE_LIMITED", "本会话预约数量已达上限。", 429);
  const route = campaignRoutes.find((r) => r.id === slot.routeId)!;
  const booking: Booking = {
    id: newId("booking"),
    campaignId: "weekend",
    routeId: route.id,
    routeTitle: route.title,
    slotId: slot.id,
    startsAt: slot.startsAt,
    participantCount: input.participantCount,
    alias: input.alias || "",
    status: "CONFIRMED",
    createdAt: new Date(now).toISOString(),
    rulesVersion: RULE_VERSION,
  };
  slot.reserved += input.participantCount;
  slot.available = slot.capacity - slot.reserved;
  state.bookings.unshift(booking);
  return booking;
}
export function cancelBooking(state: SessionState, id: string): Booking {
  const booking = state.bookings.find((b) => b.id === id);
  if (!booking)
    throw new DomainError("NOT_FOUND", "当前会话没有这个预约。", 404);
  if (booking.status === "USER_CANCELLED") return booking;
  if (booking.status !== "CONFIRMED")
    throw new DomainError("BOOKING_STATE", "该预约已结束或已由活动方取消。");
  const slot = state.slots.find((s) => s.id === booking.slotId)!;
  slot.reserved -= booking.participantCount;
  slot.available = slot.capacity - slot.reserved;
  booking.status = "USER_CANCELLED";
  return booking;
}
