import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  Booking,
  Cart,
  Coupon,
  Operation,
  Order,
  Product,
  Quote,
  Slot,
} from "../../../packages/shared/src/api.ts";
import { productSeed, slotSeed } from "./catalog.ts";
export class DomainError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;
  constructor(
    code: string,
    message: string,
    status = 409,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
export interface RaceRun {
  id: string;
  stock: number;
  winner: string | null;
  attempts: Array<{ actor: string; success: boolean; at: string }>;
}
export interface StoredOperation extends Operation {
  fingerprint: string;
}
export interface SessionState {
  domain: "shop" | "h5";
  createdAt: number;
  cart: Cart;
  products: Product[];
  coupons: Coupon[];
  quotes: Quote[];
  orders: Order[];
  slots: Slot[];
  bookings: Booking[];
  operations: StoredOperation[];
  races: RaceRun[];
}
export function seedState(
  domain: SessionState["domain"],
  now: number,
): SessionState {
  return {
    domain,
    createdAt: now,
    cart: { version: 0, items: [] },
    products: productSeed(),
    coupons: [],
    quotes: [],
    orders: [],
    slots: slotSeed(now),
    bookings: [],
    operations: [],
    races: [],
  };
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function fingerprint(operation: string, body: unknown): string {
  return hash(`${operation}:${stable(body)}`);
}
export function newId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}
export function openDatabase(filename: string) {
  if (filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, domain TEXT NOT NULL, expires_at INTEGER NOT NULL, state TEXT NOT NULL); CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at); PRAGMA user_version=1;",
  );
  return {
    close() {
      db.close();
    },
    resume(token: string, domain: SessionState["domain"], now: number) {
      const row = db
        .prepare(
          "SELECT expires_at FROM sessions WHERE token_hash=? AND domain=?",
        )
        .get(hash(token), domain) as { expires_at: number } | undefined;
      if (!row)
        throw new DomainError("UNAUTHORIZED", "当前演示会话无效。", 401);
      if (row.expires_at <= now)
        throw new DomainError("SESSION_EXPIRED", "演示会话已过期。", 401);
      return { expiresAt: new Date(row.expires_at).toISOString() };
    },
    create(domain: SessionState["domain"], now: number) {
      db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
      const count = db
        .prepare("SELECT COUNT(*) AS count FROM sessions")
        .get() as { count: number };
      if (count.count >= 500)
        throw new DomainError(
          "RATE_LIMITED",
          "演示会话容量已满，请稍后再试。",
          429,
        );
      const token = randomBytes(32).toString("base64url"),
        expiresAt = now + 86400000;
      db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(
        hash(token),
        domain,
        expiresAt,
        JSON.stringify(seedState(domain, now)),
      );
      return { token, expiresAt: new Date(expiresAt).toISOString() };
    },
    transaction<T>(
      token: string,
      domain: SessionState["domain"],
      now: number,
      action: (state: SessionState) => T,
    ): T {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token))
        throw new DomainError(
          "UNAUTHORIZED",
          "请先建立当前应用的演示会话。",
          401,
        );
      db.exec("BEGIN IMMEDIATE");
      try {
        const row = db
          .prepare("SELECT * FROM sessions WHERE token_hash=? AND domain=?")
          .get(hash(token), domain) as
          | { state: string; expires_at: number }
          | undefined;
        if (!row)
          throw new DomainError("UNAUTHORIZED", "当前演示会话无效。", 401);
        if (row.expires_at <= now)
          throw new DomainError(
            "SESSION_EXPIRED",
            "演示会话已过期，请重新连接。",
            401,
          );
        const state = JSON.parse(row.state) as SessionState;
        const result = action(state);
        db.prepare("UPDATE sessions SET state=? WHERE token_hash=?").run(
          JSON.stringify(state),
          hash(token),
        );
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
