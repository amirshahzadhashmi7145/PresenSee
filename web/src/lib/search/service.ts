// The ONLY code that may call a search provider.
// HARD RULES enforced here:
//  - no search for a photo that has not passed the face match
//    (only passed photos have a record, and only an owned record is accepted)
//  - at most 20 searches per account per day
//  - search results never go near the face service

import { db } from "@/lib/db";
import type { PhotoStorage } from "@/lib/storage";
import type { ReverseImageSearchProvider } from "./provider";

export const MAX_SEARCHES_PER_DAY = 20;

export type SearchOutcome =
  | { ok: true; runId: string; matches: number }
  | { ok: false; reason: string };

interface AccountLike {
  id: string;
  consentedAt: Date | null;
}

export interface SearchDeps {
  provider: ReverseImageSearchProvider;
  storage: PhotoStorage;
  now?: () => Date;
}

export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function searchesUsedToday(accountId: string, now: Date = new Date()): Promise<number> {
  return db.searchRun.count({ where: { accountId, createdAt: { gte: startOfUtcDay(now) } } });
}

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function runSearch(account: AccountLike, photoId: string, deps: SearchDeps): Promise<SearchOutcome> {
  const now = (deps.now ?? (() => new Date()))();
  if (!account.consentedAt) return { ok: false, reason: "consent_required" };

  // Only a saved photo of THIS account can be searched. Every saved photo passed the match.
  const photo = await db.photo.findFirst({
    where: { id: photoId, accountId: account.id, fileDeletedAt: null, expiresAt: { gt: now } },
  });
  if (!photo) return { ok: false, reason: "photo_not_found" };

  // Take one of today's 20 places first, one request at a time per account.
  const run = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${account.id}))`;
    const used = await tx.searchRun.count({
      where: { accountId: account.id, createdAt: { gte: startOfUtcDay(now) } },
    });
    if (used >= MAX_SEARCHES_PER_DAY) return null;
    return tx.searchRun.create({
      data: { accountId: account.id, photoId: photo.id, provider: deps.provider.name, createdAt: now },
    });
  });
  if (!run) return { ok: false, reason: "daily_limit" };

  const bytes = await deps.storage.get(photo.storageKey);
  if (!bytes) {
    await db.searchRun.delete({ where: { id: run.id } });
    return { ok: false, reason: "photo_not_found" };
  }

  let results;
  try {
    results = await deps.provider.search({ bytes, mimeType: photo.mimeType });
  } catch {
    await db.searchRun.delete({ where: { id: run.id } });
    return { ok: false, reason: "provider_error" };
  }

  // Keep links and text only. Result images are never downloaded by this server.
  const rows = results
    .map((result) => ({ result, pageUrl: safeHttpUrl(result.pageUrl) }))
    .filter((item): item is { result: (typeof results)[number]; pageUrl: string } => item.pageUrl !== null)
    .slice(0, 100)
    .map(({ result, pageUrl }) => ({
      accountId: account.id,
      searchRunId: run.id,
      pageUrl,
      siteName: result.siteName.slice(0, 200),
      thumbnailUrl: result.thumbnailUrl ?? null,
      foundDate: result.foundDate ?? null,
    }));
  if (rows.length) await db.imageMatch.createMany({ data: rows });
  return { ok: true, runId: run.id, matches: rows.length };
}

export const TAGS = ["UNTAGGED", "MINE", "FAKE", "IGNORE"] as const;
export type TagName = (typeof TAGS)[number];

/** Tag one result. Only the owning account can. */
export async function tagMatch(accountId: string, matchId: string, tag: TagName): Promise<boolean> {
  const changed = await db.imageMatch.updateMany({ where: { id: matchId, accountId }, data: { tag } });
  return changed.count === 1;
}

/** Everything the dashboard shows: each photo with its latest results. */
export async function resultsForAccount(accountId: string) {
  return db.searchRun.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    include: { matches: { orderBy: { siteName: "asc" } } },
  });
}
