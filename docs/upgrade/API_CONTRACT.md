# V2 local service contract

TypeScript DTOs: `packages/shared/src/api.ts`. Domain errors are `{error:{code,message,details?},requestId,serverTime}`; successes `{data,requestId,serverTime}`. No silent offline fallback. Public Pages remains explicitly local demo until a backend is configured; local preview proxies `/api/v1` to port 4016. Clients select server-demo intentionally, display disconnected state and allow explicit return to legacy local demo. Keep both v1 cache keys and order snapshots intact.

## Shop

Prefix `/api/v1/shop`. `POST /demo/session` returns ShopSession; all following requests use Bearer token. JSON mutations use header `Idempotency-Key` (persist exact pending key+body before request). Same key/body replays, different body yields 409 IDEMPOTENCY_CONFLICT. `GET /operations/:key?operation=orders.create` supports ambiguity recovery. Never replace a key automatically after a network timeout.

- GET `/categories`, `/products?q=&category=`, `/products/:id`: Category[], Product[], Product.
- GET `/cart`: Cart. POST `/cart/items` `{skuId,quantity,cartVersion}`; POST `/cart/items/:id/update` `{quantity,cartVersion}`; POST `/cart/items/:id/remove` `{cartVersion}`; POST `/cart/selection` `{ids:string[],cartVersion}`. Returns Cart. Version conflicts 409 CART_CHANGED with latest version.
- GET `/coupon-templates`: CouponTemplate[]. POST `/coupon-templates/:id/claim` `{}`: Coupon. GET `/coupons`: Coupon[]. GET `/demo-addresses`: DemoAddress[].
- POST `/checkout/quotes` `{cartVersion,addressId,couponId?:string}`: Quote, expires in 120s, no reservation.
- POST `/orders` `{quoteId}`: Order, expires in 15min, stock/coupon held atomically, selected lines cleared. Operation name `orders.create`.
- GET `/orders`: Order[]. GET `/orders/:id`: Order.
- POST `/orders/:id/cancel` `{}`; `/demo-payment` `{outcome:'success'|'failure'}`; `/demo-ship` `{}`; `/confirm-receipt` `{}`: Order. Operation names `orders.cancel`, `orders.demo-payment`, `orders.demo-ship`, `orders.confirm-receipt`.
- POST `/demo/reset` `{}`: `{reset:true}`; scoped to this session, never global.

Rule version 2026-10-v2: shipping 600 cents, free at 12900; coupons C10 threshold10000/discount1000 and C20 threshold20000/discount2000. Prices are server authoritative. Sessions last24h; inventory isolated per visitor. No real payments. Every POST except session creation requires idempotency key; quote/cart operation names `checkout.quotes`, `cart.add/update/remove/selection`, `coupons.claim`, `demo.reset`.

## H5

Prefix `/api/v1/h5`. `POST /demo-sessions` `{}` establishes or resumes an HttpOnly SameSite=Lax cookie scoped to `/api/v1/h5`. If an unresolved mutation exists, send `{resumeOnly:true}`: missing/expired identity returns 401 and never creates a replacement identity. Client `credentials:'include'`; mutation headers Content-Type application/json, X-Chenxi-App:h5 and Idempotency-Key. Same-origin only. Never use shop token. Returns `{mode:'server-demo',expiresAt,rulesVersion}`.

- GET `/campaigns/weekend`: Campaign; `/campaigns/weekend/routes`: CampaignRoute[]; `/routes/:id`: CampaignRoute; `/routes/:id/slots`: Slot[].
- POST `/bookings`: CreateBookingInput → Booking, operation `bookings.create`.
- GET `/bookings`: Booking[]; GET `/bookings/:id`: Booking; POST `/bookings/:id/cancel` `{}` → Booking, operation `bookings.cancel`.
- GET `/operations/:key?operation=bookings.create`: Operation; POST `/demo/reset` `{}` → `{reset:true}`.

Routes slow/maker/explore each three slots relative to service session creation so demo does not go stale. Seeded examples include open/full/closed/cancelled/ended. 1–4 participants, optional alias max16, no real PII. One active booking per campaign/session. Server checks current time, rules consent/version, capacity and uniqueness transactionally. Cancel releases once, expiry preserves historical reserved counts. Preference helper is deterministic `recommendRoutes` in DTO module.

Unknown transport result means outcome unknown; retain exact body/key, show lookup/retry recovery and freeze edited submission until resolved. GET not found never proves an earlier request cannot still finish. Do not show raw stacks. UI should display server error message for known code only with generic fallback.
