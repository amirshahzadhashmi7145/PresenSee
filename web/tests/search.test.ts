import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createAccount } from "@/lib/account";
import { db } from "@/lib/db";
import { recordConsent } from "@/lib/liveness";
import { MockProvider } from "@/lib/search/mock-provider";
import type { ImageMatchResult, ReverseImageSearchProvider, SearchImage } from "@/lib/search/provider";
import { MAX_SEARCHES_PER_DAY, type SearchDeps, runSearch, searchesUsedToday, tagMatch } from "@/lib/search/service";
import type { PhotoStorage } from "@/lib/storage";

const root = path.resolve(__dirname, "../..");
const created: string[] = [];
afterAll(async () => {
  await db.account.deleteMany({ where: { id: { in: created } } });
  await db.$disconnect();
});

class SpyProvider implements ReverseImageSearchProvider {
  readonly name = "spy";
  calls: SearchImage[] = [];
  fail = false;
  results: ImageMatchResult[] = [
    { pageUrl: "https://example.test/a", siteName: "example.test", foundDate: new Date("2026-01-01") },
    { pageUrl: "https://example.test/b", siteName: "example.test" },
  ];
  async search(image: SearchImage): Promise<ImageMatchResult[]> {
    this.calls.push(image);
    if (this.fail) throw new Error("provider down");
    return this.results;
  }
}

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
  async deletePrefix() {}
}

let provider: SpyProvider;
let store: MemoryStorage;
const deps = (now?: Date): SearchDeps => ({ provider, storage: store, now: now ? () => now : undefined });
const BYTES = Buffer.from("pretend photo bytes");

let n = 0;
async function newAccount(consent = true) {
  const { account } = await createAccount();
  created.push(account.id);
  return consent ? recordConsent(account.id) : account;
}

/** A photo record exists only for photos that passed the match. */
async function passedPhoto(accountId: string, expiresAt = new Date(Date.now() + 86_400_000)) {
  n += 1;
  const id = `ph_test_${Date.now()}_${n}`;
  const storageKey = `accounts/${accountId}/photos/${id}`;
  store.files.set(storageKey, BYTES);
  await db.photo.create({
    data: { id, accountId, storageKey, mimeType: "image/jpeg", verifiedAt: new Date(), expiresAt },
  });
  return id;
}

beforeEach(() => {
  provider = new SpyProvider();
  store = new MemoryStorage();
});

describe("hard rule: no search for a photo that has not passed the match", () => {
  it("a passed photo is searched and its results are saved", async () => {
    const account = await newAccount();
    const photoId = await passedPhoto(account.id);
    const outcome = await runSearch(account, photoId, deps());
    expect(outcome).toMatchObject({ ok: true, matches: 2 });
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0].bytes.equals(BYTES)).toBe(true);
    expect(await db.imageMatch.count({ where: { accountId: account.id } })).toBe(2);
  });

  it("an unknown photo id is refused and the provider is never called", async () => {
    const account = await newAccount();
    expect(await runSearch(account, "ph_made_up", deps())).toEqual({ ok: false, reason: "photo_not_found" });
    expect(provider.calls).toHaveLength(0);
  });

  it("a rejected upload has no record, so there is nothing that could be searched", async () => {
    const account = await newAccount();
    // A rejected photo's bytes sitting in storage (which never happens) still cannot be searched.
    store.files.set(`accounts/${account.id}/photos/ph_rejected`, BYTES);
    expect(await runSearch(account, "ph_rejected", deps())).toEqual({ ok: false, reason: "photo_not_found" });
    expect(provider.calls).toHaveLength(0);
  });

  it("another account's photo is refused and the provider is never called", async () => {
    const owner = await newAccount();
    const other = await newAccount();
    const photoId = await passedPhoto(owner.id);
    expect(await runSearch(other, photoId, deps())).toEqual({ ok: false, reason: "photo_not_found" });
    expect(provider.calls).toHaveLength(0);
  });

  it("an expired photo is refused and the provider is never called", async () => {
    const account = await newAccount();
    const photoId = await passedPhoto(account.id, new Date(Date.now() - 1000));
    expect(await runSearch(account, photoId, deps())).toEqual({ ok: false, reason: "photo_not_found" });
    expect(provider.calls).toHaveLength(0);
  });

  it("before consent: refused and the provider is never called", async () => {
    const account = await newAccount(false);
    const photoId = await passedPhoto(account.id);
    expect(await runSearch(account, photoId, deps())).toEqual({ ok: false, reason: "consent_required" });
    expect(provider.calls).toHaveLength(0);
  });

  it("the provider can only be reached through the search service", () => {
    const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "web/src"], { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter((f) => /\.(ts|tsx)$/.test(f));
    const callers = files.filter((f) => /\.search\(\s*\{/.test(readFileSync(path.join(root, f), "utf8")));
    expect(callers).toEqual(["web/src/lib/search/service.ts"]);
  });
});

describe("hard rule: search results never meet the face service", () => {
  it("no search code imports the face client or the liveness code", () => {
    const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "web/src/lib/search"], { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const f of files) {
      const text = readFileSync(path.join(root, f), "utf8");
      expect(text, f).not.toMatch(/face-client|liveness|photos"/);
      // The server never downloads result images: the only outside call is the provider's own API.
      if (!f.endsWith("tineye-provider.ts")) expect(text, f).not.toMatch(/\bfetch\(/);
    }
  });

  it("only links and text are stored for a result", async () => {
    const account = await newAccount();
    const photoId = await passedPhoto(account.id);
    await runSearch(account, photoId, deps());
    const row = await db.imageMatch.findFirstOrThrow({ where: { accountId: account.id } });
    expect(Object.keys(row).sort()).toEqual(
      ["accountId", "foundDate", "id", "pageUrl", "searchRunId", "siteName", "tag", "thumbnailUrl"].sort(),
    );
  });

  it("results with unsafe links are dropped", async () => {
    const account = await newAccount();
    const photoId = await passedPhoto(account.id);
    provider.results = [
      { pageUrl: "javascript:alert(1)", siteName: "bad" },
      { pageUrl: "not a url", siteName: "bad" },
      { pageUrl: "https://ok.test/page", siteName: "ok.test" },
    ];
    expect(await runSearch(account, photoId, deps())).toMatchObject({ ok: true, matches: 1 });
  });
});

describe("hard rule: at most 20 searches per account per day", () => {
  it("the 21st search is refused and the provider is not called for it", async () => {
    const account = await newAccount();
    const photoId = await passedPhoto(account.id);
    for (let i = 0; i < MAX_SEARCHES_PER_DAY; i++) expect((await runSearch(account, photoId, deps())).ok).toBe(true);
    expect(await runSearch(account, photoId, deps())).toEqual({ ok: false, reason: "daily_limit" });
    expect(provider.calls).toHaveLength(20);
    expect(await searchesUsedToday(account.id)).toBe(20);
  });

  it("many searches at the same moment still cannot go past 20", async () => {
    const account = await newAccount();
    const photoId = await passedPhoto(account.id);
    const outcomes = await Promise.all(Array.from({ length: 30 }, () => runSearch(account, photoId, deps())));
    expect(outcomes.filter((o) => o.ok)).toHaveLength(20);
    expect(provider.calls).toHaveLength(20);
  });

  it("the count starts again the next day", async () => {
    const account = await newAccount();
    const today = new Date(Date.UTC(2026, 5, 10, 12));
    const tomorrow = new Date(Date.UTC(2026, 5, 11, 0, 0, 1));
    const photoId = await passedPhoto(account.id, new Date(Date.UTC(2026, 6, 1)));
    for (let i = 0; i < 20; i++) await runSearch(account, photoId, deps(today));
    expect((await runSearch(account, photoId, deps(today))).ok).toBe(false);
    expect((await runSearch(account, photoId, deps(tomorrow))).ok).toBe(true);
  });

  it("the limit is per account", async () => {
    const first = await newAccount();
    const second = await newAccount();
    const firstPhoto = await passedPhoto(first.id);
    const secondPhoto = await passedPhoto(second.id);
    for (let i = 0; i < 20; i++) await runSearch(first, firstPhoto, deps());
    expect((await runSearch(second, secondPhoto, deps())).ok).toBe(true);
  });

  it("a search that failed at the provider does not use up a place", async () => {
    const account = await newAccount();
    const photoId = await passedPhoto(account.id);
    provider.fail = true;
    expect(await runSearch(account, photoId, deps())).toEqual({ ok: false, reason: "provider_error" });
    expect(await searchesUsedToday(account.id)).toBe(0);
  });
});

describe("tagging results", () => {
  it("the owner can tag a result; another account cannot", async () => {
    const owner = await newAccount();
    const other = await newAccount();
    const photoId = await passedPhoto(owner.id);
    await runSearch(owner, photoId, deps());
    const match = await db.imageMatch.findFirstOrThrow({ where: { accountId: owner.id } });
    expect(match.tag).toBe("UNTAGGED");
    expect(await tagMatch(other.id, match.id, "FAKE")).toBe(false);
    expect(await tagMatch(owner.id, match.id, "FAKE")).toBe(true);
    expect((await db.imageMatch.findUniqueOrThrow({ where: { id: match.id } })).tag).toBe("FAKE");
  });
});

describe("mock provider", () => {
  it("gives the same results for the same photo and needs no key", async () => {
    const mock = new MockProvider();
    const a = await mock.search({ bytes: BYTES, mimeType: "image/jpeg" });
    const b = await mock.search({ bytes: BYTES, mimeType: "image/jpeg" });
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(3);
    for (const result of a) {
      expect(result.pageUrl).toMatch(/^https:\/\//);
      expect(result.pageUrl).toContain("presensee_mock_");
      expect(result.siteName).toBeTruthy();
    }
    expect(a.some((r) => r.foundDate)).toBe(true);
  });
});
