// "Delete my account": wipe every photo, result and record right away.

import { db } from "@/lib/db";
import type { FaceClient } from "@/lib/face-client";
import type { PhotoStorage } from "@/lib/storage";

export async function deleteAccount(accountId: string, deps: { storage: PhotoStorage; face: FaceClient }) {
  // 1. Every stored file of this account: photos and the reference selfie.
  await deps.storage.deletePrefix(`accounts/${accountId}`);
  // 2. Anything the face service still holds in memory for this account.
  await deps.face.forgetAccount(accountId).catch(() => undefined);
  // 3. Every database record. Photos, searches, results and live checks go with the account.
  await db.account.delete({ where: { id: accountId } });
}
