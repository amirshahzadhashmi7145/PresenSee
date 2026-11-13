// Face search of the live-verified person's OWN face.
//
// HARD RULES enforced here (owner's decision of 2026-11-13 replaced "1-to-1 only"):
//  - The only image ever sent to the provider is the reference selfie that the
//    account's own live check produced. This function takes NO image argument,
//    so an uploaded picture or another person's face cannot be searched.
//  - The live check must have passed within the last 15 minutes.
//  - A separate, explicit consent is required, because the selfie leaves this server.
//  - At most 3 face searches per account per day (and they count toward the 20 a day).
//  - Weak hits are dropped: they are most likely other people.
//  - PresenSee stores no face data. It keeps result links, scores and small
//    encrypted thumbnails, all deleted with the account and after 30 days.

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { currentPassedCheck } from "@/lib/liveness";
import { MAX_SEARCHES_PER_DAY, startOfUtcDay } from "@/lib/search/service";
import { type PhotoStorage, selfieKey } from "@/lib/storage";
import type { FaceSearchProvider } from "./provider";

export const MAX_FACE_SEARCHES_PER_DAY = 3;
/** FaceCheck's own guide: 90+ certain, 83-89 confident, 70-82 uncertain, below 70 weak. */
export const MIN_FACE_SCORE = 75;
const MAX_HITS = 50;

export type FaceSearchOutcome = { ok: true; runId: string; matches: number } | { ok: false; reason: string };

interface AccountLike {
  id: string;
  consentedAt: Date | null;
  faceSearchConsentedAt: Date | null;
}

export interface FaceSearchDeps {
  provider: FaceSearchProvider;
  storage: PhotoStorage;
  now?: () => Date;
}

export const faceThumbKey = (accountId: string, matchId: string) => `accounts/${accountId}/face-results/${matchId}`;

export async function recordFaceSearchConsent(accountId: string, now: Date = new Date()) {
  return db.account.update({ where: { id: accountId }, data: { faceSearchConsentedAt: now } });
}

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function runFaceSearch(account: AccountLike, deps: FaceSearchDeps): Promise<FaceSearchOutcome> {
  const now = (deps.now ?? (() => new Date()))();
  if (!account.consentedAt) return { ok: false, reason: "consent_required" };
  if (!account.faceSearchConsentedAt) return { ok: false, reason: "face_consent_required" };
  if (!(await currentPassedCheck(account.id, now))) return { ok: false, reason: "live_check_required" };

  // The selfie of THIS account, saved by the server when the live check passed.
  const selfie = await deps.storage.get(selfieKey(account.id));
  if (!selfie) return { ok: false, reason: "selfie_not_available" };

  const run = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${account.id}))`;
    const today = { accountId: account.id, createdAt: { gte: startOfUtcDay(now) } };
    if ((await tx.searchRun.count({ where: { ...today, kind: "face" } })) >= MAX_FACE_SEARCHES_PER_DAY) return null;
    if ((await tx.searchRun.count({ where: today })) >= MAX_SEARCHES_PER_DAY) return null;
    return tx.searchRun.create({
      data: { accountId: account.id, kind: "face", provider: deps.provider.name, createdAt: now },
    });
  });
  if (!run) return { ok: false, reason: "daily_limit" };

  let hits;
  try {
    hits = await deps.provider.search(selfie);
  } catch {
    await db.searchRun.delete({ where: { id: run.id } });
    return { ok: false, reason: "provider_error" };
  }

  let saved = 0;
  const strong = hits
    .filter((hit) => Number.isFinite(hit.score) && hit.score >= MIN_FACE_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_HITS);
  for (const hit of strong) {
    const pageUrl = safeHttpUrl(hit.pageUrl);
    if (!pageUrl) continue;
    const id = `fm_${randomBytes(12).toString("hex")}`;
    if (hit.thumbnail) await deps.storage.put(faceThumbKey(account.id, id), hit.thumbnail);
    await db.imageMatch.create({
      data: {
        id,
        accountId: account.id,
        searchRunId: run.id,
        pageUrl,
        siteName: new URL(pageUrl).hostname.replace(/^www\./, ""),
        thumbnailUrl: hit.thumbnail ? `/api/matches/${id}/thumb` : null,
        matchScore: Math.max(0, Math.min(100, Math.round(hit.score))),
      },
    });
    saved += 1;
  }
  return { ok: true, runId: run.id, matches: saved };
}

/** A face-result thumbnail, for its owner only. */
export async function readFaceThumb(accountId: string, matchId: string, storage: PhotoStorage) {
  const match = await db.imageMatch.findFirst({ where: { id: matchId, accountId } });
  if (!match) return null;
  return storage.get(faceThumbKey(accountId, matchId));
}

export async function faceSearchesUsedToday(accountId: string, now: Date = new Date()) {
  return db.searchRun.count({ where: { accountId, kind: "face", createdAt: { gte: startOfUtcDay(now) } } });
}
