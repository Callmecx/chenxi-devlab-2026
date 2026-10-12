/** V2 wire contracts. All money uses integer cents, timestamps use ISO-8601. */
export const RULE_VERSION = "2026-10-v2";
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
export interface Envelope<T> {
  data: T;
  requestId: string;
  serverTime: string;
}
export interface Category {
  id: string;
  name: string;
}
export interface Sku {
  id: string;
  label: string;
  price: number;
  stock: number;
  reserved: number;
  available: number;
}
export interface Product {
  id: string;
  name: string;
  category: string;
  description: string;
  art: "cup" | "bag" | "lamp" | "bottle" | "book" | "speaker";
  skus: Sku[];
}
export interface CartLine {
  id: string;
  productId: string;
  skuId: string;
  name: string;
  skuLabel: string;
  price: number;
  quantity: number;
  selected: boolean;
  version: number;
  available: number;
}
export interface Cart {
  version: number;
  items: CartLine[];
}
export interface CouponTemplate {
  id: string;
  name: string;
  minimum: number;
  discount: number;
}
export interface Coupon extends CouponTemplate {
  status: "AVAILABLE" | "HELD" | "USED";
  orderId?: string;
}
export interface DemoAddress {
  id: string;
  title: string;
  address: string;
}
export interface Quote {
  id: string;
  cartVersion: number;
  lines: CartLine[];
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  couponId: string | null;
  addressId: string;
  expiresAt: string;
  ruleVersion: string;
}
export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "SHIPPED"
  | "COMPLETED"
  | "CANCELLED"
  | "CLOSED";
export interface Order extends Quote {
  status: OrderStatus;
  createdAt: string;
  paymentAttempts: number;
  timeline: Array<{ status: string; at: string }>;
}
export interface Operation {
  operation: string;
  key: string;
  status: "SUCCEEDED";
  result: unknown;
}
export interface ShopSession {
  token: string;
  expiresAt: string;
  mode: "server-demo";
  ruleVersion: string;
}
export interface Preferences {
  theme: "quiet" | "creative" | "active";
  environment: "indoor" | "outdoor" | "any";
  minutes: 90 | 120 | 180;
}
export interface CampaignRoute {
  id: string;
  campaignId: string;
  title: string;
  description: string;
  theme: Preferences["theme"];
  environment: "indoor" | "outdoor";
  duration: number;
  intensity: "low" | "medium";
  highlights: string[];
}
export interface Slot {
  id: string;
  routeId: string;
  startsAt: string;
  deadline: string;
  endsAt: string;
  capacity: number;
  reserved: number;
  available: number;
  status: "OPEN" | "CLOSED" | "CANCELLED" | "ENDED";
}
export interface Campaign {
  id: string;
  title: string;
  description: string;
  simulated: true;
  rulesVersion: string;
}
export type BookingStatus =
  | "CONFIRMED"
  | "USER_CANCELLED"
  | "ACTIVITY_CANCELLED"
  | "EXPIRED";
export interface Booking {
  id: string;
  campaignId: string;
  routeId: string;
  routeTitle: string;
  slotId: string;
  startsAt: string;
  participantCount: number;
  alias: string;
  status: BookingStatus;
  createdAt: string;
  rulesVersion: string;
}
export interface CreateBookingInput {
  slotId: string;
  participantCount: number;
  alias?: string;
  rulesAccepted: boolean;
  rulesVersion: string;
  source: "recommendation" | "browse";
}
export interface BookingList {
  items: Booking[];
}
export interface Recommendation {
  route: CampaignRoute;
  score: number;
  reasons: string[];
  tradeoffs: string[];
}
export function recommendRoutes(
  routes: CampaignRoute[],
  preferences: Preferences,
): Recommendation[] {
  return routes
    .map((route) => {
      let score = 0;
      const reasons: string[] = [];
      const tradeoffs: string[] = [];
      if (route.theme === preferences.theme) {
        score += 4;
        reasons.push("主题符合偏好 +4");
      } else tradeoffs.push("主题与首选不同");
      if (
        preferences.environment !== "any" &&
        route.environment === preferences.environment
      ) {
        score += 2;
        reasons.push("环境符合偏好 +2");
      } else if (preferences.environment !== "any")
        tradeoffs.push("环境与首选不同");
      if (route.duration <= preferences.minutes) {
        score += 2;
        reasons.push("时长在预算内 +2");
      } else {
        score -= 3;
        tradeoffs.push("超过可用时长 −3");
      }
      return { route, score, reasons, tradeoffs };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.route.duration - b.route.duration ||
        a.route.id.localeCompare(b.route.id),
    );
}
