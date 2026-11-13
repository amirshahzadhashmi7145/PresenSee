// HARD RULE: stored photos are deleted automatically after 30 days.

import { db } from "@/lib/db";
import { PHOTO_LIFETIME_MS } from "@/lib/photos";
import { type PhotoStorage, selfieKey } from "@/lib/storage";

/** Delete the file of every photo whose 30 days are over. Result links stay
 *  until the account is deleted; the image itself is gone. */
export async function purgeExpiredPhotos(storage: PhotoStorage, now: Date = new Date()): Promise<number> {
  let purged = 0;
  for (;;) {
    const batch = await db.photo.findMany({
      where: { expiresAt: { lte: now }, fileDeletedAt: null },
      take: 100,
      select: { id: true, storageKey: true },
    });
    if (!batch.length) break;
    for (const photo of batch) {
      await storage.delete(photo.storageKey); // a missing file counts as deleted
      await db.photo.update({ where: { id: photo.id }, data: { fileDeletedAt: now } });
      purged += 1;
    }
  }
  return purged;
}

/** Testing mode keeps one reference selfie per account on disk. It gets the
 *  same 30-day limit, counted from the live check that produced it. */
export async function purgeExpiredSelfies(storage: PhotoStorage, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - PHOTO_LIFETIME_MS);
  const old = await db.livenessSession.groupBy({
    by: ["accountId"],
    where: { status: "PASSED" },
    _max: { passedAt: true },
    having: { passedAt: { _max: { lte: cutoff } } },
  });
  for (const row of old) await storage.delete(selfieKey(row.accountId));
  return old.length;
}

/** Face-search results (links, scores, thumbnails) also go after 30 days. */
export async function purgeOldFaceResults(storage: PhotoStorage, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - PHOTO_LIFETIME_MS);
  const runs = await db.searchRun.findMany({
    where: { kind: "face", createdAt: { lte: cutoff } },
    include: { matches: { select: { id: true } } },
  });
  for (const run of runs) {
    for (const match of run.matches) await storage.delete(`accounts/${run.accountId}/face-results/${match.id}`);
    await db.searchRun.delete({ where: { id: run.id } }); // its results go with it
  }
  return runs.length;
}

export async function runRetention(storage: PhotoStorage, now: Date = new Date()) {
  return {
    photos: await purgeExpiredPhotos(storage, now),
    selfies: await purgeExpiredSelfies(storage, now),
    faceResults: await purgeOldFaceResults(storage, now),
  };
}
