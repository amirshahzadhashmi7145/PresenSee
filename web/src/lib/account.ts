import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "ps_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only this hash is stored, so a database leak cannot be used to log in. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAccount() {
  const token = newToken();
  const account = await db.account.create({ data: { tokenHash: hashToken(token) } });
  return { account, token };
}

export async function findAccountByToken(token: string | undefined) {
  if (!token) return null;
  return db.account.findUnique({ where: { tokenHash: hashToken(token) } });
}
