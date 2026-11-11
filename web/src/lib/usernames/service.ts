// Username check: is there a public profile at the user's own handle on each
// site of the fixed list? Limit: 5 handles per account.

import { db } from "@/lib/db";
import type { TagName } from "@/lib/search/service";
import type { PoliteClient } from "./outbound";
import { MAX_USERNAMES, SITES, type Site, normalizeHandle } from "./sites";

export type AddOutcome = { ok: true; usernameId: string } | { ok: false; reason: string };
export const RECHECK_AFTER_MS = 60 * 60 * 1000;

interface AccountLike {
  id: string;
  consentedAt: Date | null;
}

type Status = "FOUND" | "NOT_FOUND" | "UNKNOWN" | "MANUAL";

/** Check one handle on one site. Manual sites are never requested. */
export async function checkSite(site: Site, handle: string, client: PoliteClient): Promise<Status> {
  if (site.handlePattern && !site.handlePattern.test(handle)) return "NOT_FOUND"; // cannot exist there
  if (site.kind === "manual") return "MANUAL";
  const res = await client.get(site.checkUrl(handle), site.readBody ?? false);
  if (!res.ok) return "UNKNOWN";
  return site.classify(res, handle);
}

async function runChecks(accountId: string, usernameId: string, handle: string, client: PoliteClient, now: Date) {
  const results = await Promise.all(
    SITES.map(async (site) => ({ site, status: await checkSite(site, handle, client).catch(() => "UNKNOWN" as Status) })),
  );
  for (const { site, status } of results) {
    await db.profileCheck.upsert({
      where: { usernameId_siteId: { usernameId, siteId: site.id } },
      create: { accountId, usernameId, siteId: site.id, profileUrl: site.profileUrl(handle), status, checkedAt: now },
      update: { status, checkedAt: now },
    });
  }
}

export async function addUsername(
  account: AccountLike,
  raw: string,
  client: PoliteClient,
  now: Date = new Date(),
): Promise<AddOutcome> {
  if (!account.consentedAt) return { ok: false, reason: "consent_required" };
  const handle = normalizeHandle(raw);
  if (!handle) return { ok: false, reason: "bad_handle" };

  const created = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${account.id}))`;
    const existing = await tx.username.findMany({ where: { accountId: account.id } });
    if (existing.some((u) => u.handle.toLowerCase() === handle.toLowerCase())) return "duplicate" as const;
    if (existing.length >= MAX_USERNAMES) return "limit" as const;
    return tx.username.create({ data: { accountId: account.id, handle } });
  });
  if (created === "duplicate") return { ok: false, reason: "already_added" };
  if (created === "limit") return { ok: false, reason: "username_limit" };

  await runChecks(account.id, created.id, handle, client, now);
  return { ok: true, usernameId: created.id };
}

/** Check a handle again, at most once an hour. */
export async function recheckUsername(accountId: string, usernameId: string, client: PoliteClient, now: Date = new Date()) {
  const username = await db.username.findFirst({ where: { id: usernameId, accountId }, include: { checks: true } });
  if (!username) return { ok: false as const, reason: "not_found" };
  const latest = Math.max(0, ...username.checks.map((c) => c.checkedAt.getTime()));
  if (now.getTime() - latest < RECHECK_AFTER_MS) return { ok: false as const, reason: "too_soon" };
  await runChecks(accountId, username.id, username.handle, client, now);
  return { ok: true as const };
}

export async function removeUsername(accountId: string, usernameId: string): Promise<boolean> {
  const removed = await db.username.deleteMany({ where: { id: usernameId, accountId } });
  return removed.count === 1;
}

export async function tagProfileCheck(accountId: string, checkId: string, tag: TagName): Promise<boolean> {
  const changed = await db.profileCheck.updateMany({ where: { id: checkId, accountId }, data: { tag } });
  return changed.count === 1;
}

export async function usernamesForAccount(accountId: string) {
  return db.username.findMany({
    where: { accountId },
    orderBy: { createdAt: "asc" },
    include: { checks: true },
  });
}
