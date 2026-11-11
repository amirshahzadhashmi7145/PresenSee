import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createAccount } from "@/lib/account";
import { db } from "@/lib/db";
import type { ChallengeView, FaceClient, MatchResult, StepResult } from "@/lib/face-client";
import { recordConsent } from "@/lib/liveness";
import { type PhotoDeps, deletePhoto, listPhotos, readPhoto, sniffImageType, uploadPhoto } from "@/lib/photos";
import type { PhotoStorage } from "@/lib/storage";

const created: string[] = [];
afterAll(async () => {
  await db.account.deleteMany({ where: { id: { in: created } } });
  await db.$disconnect();
});

class FakeFace implements FaceClient {
  matchCalls = 0;
  restoreCalls = 0;
  verdict: MatchResult = { result: "match" };
  verdictAfterRestore: MatchResult | null = null;
  async matchPhoto(): Promise<MatchResult> {
    this.matchCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return this.verdict;
  }
  async restoreReference(): Promise<boolean> {
    this.restoreCalls += 1;
    if (this.verdictAfterRestore) this.verdict = this.verdictAfterRestore;
    return true;
  }
  async startLiveness(): Promise<ChallengeView> {
    throw new Error("not used");
  }
  async stepLiveness(): Promise<StepResult | null> {
    throw new Error("not used");
  }
  async fetchReference(): Promise<Buffer | null> {
    return null;
  }
  async forgetAccount(): Promise<void> {}
}

class FakeStorage implements PhotoStorage {
  files = new Map<string, Buffer>();
  puts = 0;
  async put(key: string, plain: Buffer) {
    this.puts += 1;
    this.files.set(key, plain);
  }
  async get(key: string) {
    return this.files.get(key) ?? null;
  }
  async delete(key: string) {
    this.files.delete(key);
  }
  async deletePrefix(prefix: string) {
    for (const key of this.files.keys()) if (key.startsWith(prefix)) this.files.delete(key);
  }
}

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("pretend photo")]);
let face: FakeFace;
let store: FakeStorage;
const deps = (selfieStore = "memory"): PhotoDeps => ({ face, storage: store, selfieStore });

let n = 0;
async function newAccount({ consent = true, liveCheck = true } = {}) {
  const { account } = await createAccount();
  created.push(account.id);
  const current = consent ? await recordConsent(account.id) : account;
  if (liveCheck) {
    n += 1;
    await db.livenessSession.create({
      data: {
        id: `photo-test-${Date.now()}-${n}`,
        accountId: account.id,
        status: "PASSED",
        passedAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
  }
  return current;
}

beforeEach(() => {
  face = new FakeFace();
  store = new FakeStorage();
});

describe("hard rule: the match gate", () => {
  it("a photo that matches is saved and gets a record", async () => {
    const account = await newAccount();
    const outcome = await uploadPhoto(account, JPEG, deps());
    expect(outcome.ok).toBe(true);
    expect(await listPhotos(account.id)).toHaveLength(1);
    expect(store.files.size).toBe(1);
    expect([...store.files.keys()][0]).toContain(`accounts/${account.id}/photos/`);
  });

  it.each(["no_face", "more_than_one_face", "not_same_person"])(
    "a photo rejected for %s leaves no file and no record",
    async (reason) => {
      const account = await newAccount();
      face.verdict = { result: "rejected", reason };
      expect(await uploadPhoto(account, JPEG, deps())).toEqual({ ok: false, reason });
      expect(store.puts).toBe(0);
      expect(await db.photo.count({ where: { accountId: account.id } })).toBe(0);
    },
  );

  it("every photo record has passed the match (there is no unverified state)", async () => {
    const account = await newAccount();
    await uploadPhoto(account, JPEG, deps());
    const rows = await db.photo.findMany({ where: { accountId: account.id } });
    expect(rows.every((row) => row.verifiedAt instanceof Date)).toBe(true);
  });

  it("before consent: refused, and the face service is never called", async () => {
    const account = await newAccount({ consent: false, liveCheck: false });
    expect(await uploadPhoto(account, JPEG, deps())).toEqual({ ok: false, reason: "consent_required" });
    expect(face.matchCalls).toBe(0);
    expect(store.puts).toBe(0);
  });

  it("without a valid live check: refused, and the face service is never called", async () => {
    const account = await newAccount({ liveCheck: false });
    expect(await uploadPhoto(account, JPEG, deps())).toEqual({ ok: false, reason: "live_check_required" });
    expect(face.matchCalls).toBe(0);
  });

  it("a file that is not an image is refused before the face service", async () => {
    const account = await newAccount();
    expect(await uploadPhoto(account, Buffer.from("<html>not a photo</html>"), deps())).toEqual({
      ok: false,
      reason: "not_an_image",
    });
    expect(face.matchCalls).toBe(0);
  });

  it("if the face service has no live selfie, nothing is saved (memory mode)", async () => {
    const account = await newAccount();
    face.verdict = { result: "no_live_check" };
    expect(await uploadPhoto(account, JPEG, deps("memory"))).toEqual({ ok: false, reason: "live_check_required" });
    expect(face.restoreCalls).toBe(0);
    expect(store.puts).toBe(0);
  });

  it("disk mode (testing): the saved selfie of THIS account is given back, then matched", async () => {
    const account = await newAccount();
    store.files.set(`accounts/${account.id}/selfie`, Buffer.from("pretend selfie"));
    face.verdict = { result: "no_live_check" };
    face.verdictAfterRestore = { result: "match" };
    expect((await uploadPhoto(account, JPEG, deps("disk"))).ok).toBe(true);
    expect(face.restoreCalls).toBe(1);
  });
});

describe("hard rule: at most 5 photos per account", () => {
  it("the 6th photo is refused and not saved", async () => {
    const account = await newAccount();
    for (let i = 0; i < 5; i++) expect((await uploadPhoto(account, JPEG, deps())).ok).toBe(true);
    expect(await uploadPhoto(account, JPEG, deps())).toEqual({ ok: false, reason: "photo_limit" });
    expect(await db.photo.count({ where: { accountId: account.id } })).toBe(5);
    expect(store.files.size).toBe(5);
  });

  it("many uploads at the same moment still cannot go past 5", async () => {
    const account = await newAccount();
    const outcomes = await Promise.all(Array.from({ length: 12 }, () => uploadPhoto(account, JPEG, deps())));
    expect(outcomes.filter((o) => o.ok)).toHaveLength(5);
    expect(await db.photo.count({ where: { accountId: account.id } })).toBe(5);
    expect(store.files.size).toBe(5);
  });

  it("deleting a photo frees a place", async () => {
    const account = await newAccount();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const outcome = await uploadPhoto(account, JPEG, deps());
      if (outcome.ok) ids.push(outcome.photoId);
    }
    expect(await deletePhoto(account.id, ids[0], store)).toBe(true);
    expect(store.files.size).toBe(4);
    expect((await uploadPhoto(account, JPEG, deps())).ok).toBe(true);
  });
});

describe("photos belong to one account", () => {
  it("another account cannot read or delete my photo", async () => {
    const mine = await newAccount();
    const other = await newAccount();
    const outcome = await uploadPhoto(mine, JPEG, deps());
    if (!outcome.ok) throw new Error("upload failed");
    expect(await readPhoto(other.id, outcome.photoId, store)).toBeNull();
    expect(await deletePhoto(other.id, outcome.photoId, store)).toBe(false);
    expect((await readPhoto(mine.id, outcome.photoId, store))?.bytes.equals(JPEG)).toBe(true);
  });

  it("photos expire 30 days after upload", async () => {
    const account = await newAccount();
    await uploadPhoto(account, JPEG, deps());
    const row = await db.photo.findFirstOrThrow({ where: { accountId: account.id } });
    const days = (row.expiresAt.getTime() - row.verifiedAt.getTime()) / 86_400_000;
    expect(days).toBe(30);
  });
});

describe("image type is read from the file itself", () => {
  it("knows JPEG, PNG and WebP and nothing else", () => {
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(sniffImageType(Buffer.from("RIFF0000WEBPVP8 "))).toBe("image/webp");
    expect(sniffImageType(Buffer.from("GIF89a"))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });
});
