// Photo upload with the match gate.
// HARD RULES enforced here:
//  - nothing before consent, nothing without a valid live check
//  - a photo is saved ONLY after the face service says it matches
//  - a rejected photo is never written anywhere
//  - at most 5 photos per account

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import type { FaceClient } from "@/lib/face-client";
import { currentPassedCheck } from "@/lib/liveness";
import { type PhotoStorage, selfieKey } from "@/lib/storage";

export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const PHOTO_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export type UploadOutcome =
  | { ok: true; photoId: string }
  | { ok: false; reason: string };

interface AccountLike {
  id: string;
  consentedAt: Date | null;
}

export interface PhotoDeps {
  face: FaceClient;
  storage: PhotoStorage;
  selfieStore: string;
  now?: () => Date;
}

export const photoKey = (accountId: string, photoId: string) => `accounts/${accountId}/photos/${photoId}`;

/** Work out the image type from the first bytes, not from what the browser claims. */
export function sniffImageType(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") {
    return "image/webp";
  }
  return null;
}

async function activePhotoCount(accountId: string): Promise<number> {
  return db.photo.count({ where: { accountId, fileDeletedAt: null } });
}

/** A photo past its 30 days is treated as gone even if the timer has not run yet. */
const alive = (now: Date) => ({ fileDeletedAt: null, expiresAt: { gt: now } });

export async function uploadPhoto(account: AccountLike, bytes: Buffer, deps: PhotoDeps): Promise<UploadOutcome> {
  const now = (deps.now ?? (() => new Date()))();
  if (!account.consentedAt) return { ok: false, reason: "consent_required" };
  if (!(await currentPassedCheck(account.id, now))) return { ok: false, reason: "live_check_required" };
  if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, reason: "too_big" };
  const mimeType = sniffImageType(bytes);
  if (!mimeType) return { ok: false, reason: "not_an_image" };
  if ((await activePhotoCount(account.id)) >= MAX_PHOTOS) return { ok: false, reason: "photo_limit" };

  // The gate. The bytes are only in memory at this point.
  const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
  let verdict = await deps.face.matchPhoto(account.id, blob);
  if (verdict.result === "no_live_check" && deps.selfieStore === "disk") {
    // Testing only: the face service restarted and lost its memory.
    const reference = await deps.storage.get(selfieKey(account.id));
    if (reference && (await deps.face.restoreReference(account.id, reference))) {
      verdict = await deps.face.matchPhoto(account.id, blob);
    }
  }
  if (verdict.result === "no_live_check") return { ok: false, reason: "live_check_required" };
  if (verdict.result !== "match") return { ok: false, reason: verdict.reason };

  // Passed: now, and only now, the photo is saved (encrypted).
  const photoId = `ph_${randomBytes(12).toString("hex")}`;
  const storageKey = photoKey(account.id, photoId);
  await deps.storage.put(storageKey, bytes);
  try {
    const saved = await db.$transaction(async (tx) => {
      // One upload at a time per account, so two parallel requests cannot both slip under the limit.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${account.id}))`;
      const count = await tx.photo.count({ where: { accountId: account.id, fileDeletedAt: null } });
      if (count >= MAX_PHOTOS) return false;
      await tx.photo.create({
        data: {
          id: photoId,
          accountId: account.id,
          storageKey,
          mimeType,
          verifiedAt: now,
          expiresAt: new Date(now.getTime() + PHOTO_LIFETIME_MS),
        },
      });
      return true;
    });
    if (!saved) {
      await deps.storage.delete(storageKey);
      return { ok: false, reason: "photo_limit" };
    }
  } catch (error) {
    await deps.storage.delete(storageKey);
    throw error;
  }
  return { ok: true, photoId };
}

export async function listPhotos(accountId: string, now: Date = new Date()) {
  return db.photo.findMany({
    where: { accountId, ...alive(now) },
    orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true, expiresAt: true },
  });
}

/** The decrypted photo, for its owner only. */
export async function readPhoto(accountId: string, photoId: string, storage: PhotoStorage, now: Date = new Date()) {
  const photo = await db.photo.findFirst({ where: { id: photoId, accountId, ...alive(now) } });
  if (!photo) return null;
  const bytes = await storage.get(photo.storageKey);
  return bytes ? { bytes, mimeType: photo.mimeType } : null;
}

export async function deletePhoto(accountId: string, photoId: string, storage: PhotoStorage): Promise<boolean> {
  const photo = await db.photo.findFirst({ where: { id: photoId, accountId } });
  if (!photo) return false;
  await storage.delete(photo.storageKey);
  await db.photo.delete({ where: { id: photo.id } });
  return true;
}
