import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createAccount } from "@/lib/account";
import { db } from "@/lib/db";
import { deleteAccount } from "@/lib/delete-account";
import type { FaceClient } from "@/lib/face-client";
import { recordConsent } from "@/lib/liveness";
import { listPhotos, readPhoto } from "@/lib/photos";
import { purgeExpiredPhotos, purgeExpiredSelfies } from "@/lib/retention";
import type { PhotoStorage } from "@/lib/storage";

const created: string[] = [];
afterAll(async () => {
  await db.account.deleteMany({ where: { id: { in: created } } });
  await db.$disconnect();
});

class MemoryStorage implements PhotoStorage {
  files = new Map<string, Buffer>();
  async put(key: string, plain: Buffer) {
    this.files.set(key, plain);
  }
  async get(key: string) {
    return this.files.get(key) ?? null;
  }
  async delete(key: string) {
    this.files.delete(key);
  }
  async deletePrefix(prefix: string) {
    for (const key of [...this.files.keys()]) if (key.startsWith(`${prefix}/`)) this.files.delete(key);
  }
}

const DAY = 86_400_000;
const NOW = new Date("2026-08-01T12:00:00Z");
let store: MemoryStorage;
let n = 0;
beforeEach(() => {
  store = new MemoryStorage();
});

async function newAccount() {
  const { account } = await createAccount();
  created.push(account.id);
  return recordConsent(account.id);
}

async function photoAgedDays(accountId: string, days: number) {
  n += 1;
  const id = `ph_ret_${Date.now()}_${n}`;
  const storageKey = `accounts/${accountId}/photos/${id}`;
  store.files.set(storageKey, Buffer.from("photo"));
  const uploaded = new Date(NOW.getTime() - days * DAY);
  await db.photo.create({
    data: {
      id,
      accountId,
      storageKey,
      mimeType: "image/jpeg",
      verifiedAt: uploaded,
      createdAt: uploaded,
      expiresAt: new Date(uploaded.getTime() + 30 * DAY),
    },
  });
  return { id, storageKey };
}

describe("hard rule: photos are deleted automatically after 30 days", () => {
  it("a 30-day-old photo's file is deleted; a 29-day-old one is kept", async () => {
    const account = await newAccount();
    const old = await photoAgedDays(account.id, 30);
    const older = await photoAgedDays(account.id, 45);
    const fresh = await photoAgedDays(account.id, 29);
    await purgeExpiredPhotos(store, NOW);
    expect(store.files.has(old.storageKey)).toBe(false);
    expect(store.files.has(older.storageKey)).toBe(false);
    expect(store.files.has(fresh.storageKey)).toBe(true);
    expect((await listPhotos(account.id, NOW)).map((p) => p.id)).toEqual([fresh.id]);
  });

  it("an expired photo is treated as gone even before the timer runs", async () => {
    const account = await newAccount();
    const old = await photoAgedDays(account.id, 31);
    expect(await listPhotos(account.id, NOW)).toHaveLength(0);
    expect(await readPhoto(account.id, old.id, store, NOW)).toBeNull();
  });

  it("running it twice is safe, and a file that is already missing is not an error", async () => {
    const account = await newAccount();
    const old = await photoAgedDays(account.id, 40);
    store.files.delete(old.storageKey);
    await purgeExpiredPhotos(store, NOW);
    await purgeExpiredPhotos(store, NOW);
    const row = await db.photo.findUniqueOrThrow({ where: { id: old.id } });
    expect(row.fileDeletedAt).toEqual(NOW);
  });

  it("the saved reference selfie (testing mode) gets the same 30-day limit", async () => {
    const oldAccount = await newAccount();
    const freshAccount = await newAccount();
    for (const [account, days] of [[oldAccount, 31], [freshAccount, 5]] as const) {
      n += 1;
      store.files.set(`accounts/${account.id}/selfie`, Buffer.from("selfie"));
      await db.livenessSession.create({
        data: {
          id: `ret-live-${Date.now()}-${n}`,
          accountId: account.id,
          status: "PASSED",
          passedAt: new Date(NOW.getTime() - days * DAY),
          expiresAt: new Date(NOW.getTime() - days * DAY + 900_000),
        },
      });
    }
    await purgeExpiredSelfies(store, NOW);
    expect(store.files.has(`accounts/${oldAccount.id}/selfie`)).toBe(false);
    expect(store.files.has(`accounts/${freshAccount.id}/selfie`)).toBe(true);
  });
});

describe("hard rule: delete my account wipes everything right away", () => {
  it("no file, no record and no live session is left; other accounts are untouched", async () => {
    const mine = await newAccount();
    const other = await newAccount();
    const forgotten: string[] = [];
    const face = { forgetAccount: async (id: string) => void forgotten.push(id) } as unknown as FaceClient;

    for (const account of [mine, other]) {
      const photo = await photoAgedDays(account.id, 1);
      store.files.set(`accounts/${account.id}/selfie`, Buffer.from("selfie"));
      n += 1;
      await db.livenessSession.create({
        data: { id: `del-live-${Date.now()}-${n}`, accountId: account.id, status: "PASSED", passedAt: NOW, expiresAt: NOW },
      });
      const run = await db.searchRun.create({ data: { accountId: account.id, photoId: photo.id, provider: "mock" } });
      await db.imageMatch.create({
        data: { accountId: account.id, searchRunId: run.id, pageUrl: "https://example.test/x", siteName: "example.test", tag: "FAKE" },
      });
    }

    await deleteAccount(mine.id, { storage: store, face });

    expect([...store.files.keys()].filter((key) => key.includes(mine.id))).toEqual([]);
    expect(forgotten).toEqual([mine.id]);
    const where = { where: { accountId: mine.id } };
    expect(await db.account.count({ where: { id: mine.id } })).toBe(0);
    expect(await db.photo.count(where)).toBe(0);
    expect(await db.searchRun.count(where)).toBe(0);
    expect(await db.imageMatch.count(where)).toBe(0);
    expect(await db.livenessSession.count(where)).toBe(0);

    expect([...store.files.keys()].filter((key) => key.includes(other.id))).toHaveLength(2);
    expect(await db.photo.count({ where: { accountId: other.id } })).toBe(1);
    expect(await db.imageMatch.count({ where: { accountId: other.id } })).toBe(1);
  });

  it("every table that holds account data is deleted together with the account", async () => {
    const tables = await db.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'accountId'`;
    const cascades = await db.$queryRaw<{ table_name: string }[]>`
      SELECT tc.table_name FROM information_schema.table_constraints tc
      JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'accountId' AND rc.delete_rule = 'CASCADE'`;
    expect(tables.length).toBeGreaterThanOrEqual(4);
    expect(new Set(cascades.map((r) => r.table_name))).toEqual(new Set(tables.map((r) => r.table_name)));
  });
});
