// Server-side rules around consent and the live selfie check.
// HARD RULE: no camera frame reaches the face service before consent.

import { db } from "@/lib/db";
import type { ChallengeView, FaceClient, StepResult } from "@/lib/face-client";
import { type PhotoStorage, selfieKey } from "@/lib/storage";

export class ConsentRequired extends Error {
  constructor() {
    super("Consent is required first");
  }
}

export class NotFound extends Error {
  constructor() {
    super("No such live check");
  }
}

export const LIVE_CHECK_VALID_MS = 15 * 60 * 1000;
const SESSION_MS = 2 * 60 * 1000;
export const MAX_FRAMES = 40;
export const MAX_FRAME_BYTES = 300_000;

interface AccountLike {
  id: string;
  consentedAt: Date | null;
}

export interface LivenessDeps {
  face: FaceClient;
  storage: PhotoStorage;
  /** "disk" keeps the reference selfie in encrypted local storage (testing only). */
  selfieStore: string;
  now?: () => Date;
}

export async function recordConsent(accountId: string, now: Date = new Date()) {
  return db.account.update({ where: { id: accountId }, data: { consentedAt: now } });
}

export async function startLiveCheck(account: AccountLike, deps: LivenessDeps): Promise<ChallengeView> {
  if (!account.consentedAt) throw new ConsentRequired();
  const now = (deps.now ?? (() => new Date()))();
  // Only one open check per account.
  await db.livenessSession.updateMany({
    where: { accountId: account.id, status: "PENDING" },
    data: { status: "EXPIRED" },
  });
  const view = await deps.face.startLiveness(account.id);
  await db.livenessSession.create({
    data: {
      id: view.session_id,
      accountId: account.id,
      expiresAt: new Date(now.getTime() + SESSION_MS),
    },
  });
  return view;
}

export async function submitLiveStep(
  account: AccountLike,
  sessionId: string,
  frames: Blob[],
  deps: LivenessDeps,
): Promise<StepResult> {
  if (!account.consentedAt) throw new ConsentRequired();
  const now = (deps.now ?? (() => new Date()))();

  // The session must belong to THIS account. Another account's id finds nothing.
  const session = await db.livenessSession.findFirst({
    where: { id: sessionId, accountId: account.id, status: "PENDING" },
  });
  if (!session) throw new NotFound();

  if (frames.length === 0 || frames.length > MAX_FRAMES) {
    return { result: "failed", reason: "too_many_frames" };
  }
  if (frames.some((frame) => frame.size > MAX_FRAME_BYTES)) {
    return { result: "failed", reason: "frame_too_big" };
  }

  const result = await deps.face.stepLiveness(session.id, account.id, frames);
  if (result === null) {
    await db.livenessSession.update({ where: { id: session.id }, data: { status: "EXPIRED" } });
    return { result: "failed", reason: "too_slow" };
  }
  if (result.result === "failed") {
    await db.livenessSession.update({ where: { id: session.id }, data: { status: "FAILED" } });
    return result;
  }
  if (result.result === "passed") {
    if (deps.selfieStore === "disk") {
      const reference = await deps.face.fetchReference(session.id, account.id);
      if (reference) await deps.storage.put(selfieKey(account.id), reference);
    }
    await db.livenessSession.update({
      where: { id: session.id },
      data: { status: "PASSED", passedAt: now, expiresAt: new Date(now.getTime() + LIVE_CHECK_VALID_MS) },
    });
  }
  return result;
}

/** The account's live check that is still valid, if any. */
export async function currentPassedCheck(accountId: string, now: Date = new Date()) {
  return db.livenessSession.findFirst({
    where: { accountId, status: "PASSED", expiresAt: { gt: now } },
    orderBy: { passedAt: "desc" },
  });
}
