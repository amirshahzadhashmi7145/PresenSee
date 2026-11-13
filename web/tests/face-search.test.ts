import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createAccount } from "@/lib/account";
import { db } from "@/lib/db";
import { FACECHECK_BASE, FaceCheckProvider } from "@/lib/face-search/facecheck-provider";
import { MockFaceProvider } from "@/lib/face-search/mock-face-provider";
import type { FaceHit, FaceSearchProvider } from "@/lib/face-search/provider";
import {
  type FaceSearchDeps,
  MAX_FACE_SEARCHES_PER_DAY,
  MIN_FACE_SCORE,
  readFaceThumb,
  recordFaceSearchConsent,
  runFaceSearch,
} from "@/lib/face-search/service";
import { recordConsent } from "@/lib/liveness";
import { purgeOldFaceResults } from "@/lib/retention";
import type { PhotoStorage } from "@/lib/storage";

const root = path.resolve(__dirname, "../..");
const created: string[] = [];
afterAll(async () => {
  await db.account.deleteMany({ where: { id: { in: created } } });
  await db.$disconnect();
});

class SpyFace implements FaceSearchProvider {
  readonly name = "spy-face";
  sent: Buffer[] = [];
  fail = false;
  hits: FaceHit[] = [
    { pageUrl: "https://x.com/someone/status/1", score: 95, thumbnail: Buffer.from([0xff, 0xd8, 0xff, 1]) },
    { pageUrl: "https://blog.test/post", score: 80 },
    { pageUrl: "https://other.test/stranger", score: 60 }, // weak: most likely another person
    { pageUrl: "javascript:alert(1)", score: 99 },
  ];
  async search(selfie: Buffer) {
    this.sent.push(selfie);
    if (this.fail) throw new Error("down");
    return this.hits;
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
  async deletePrefix(prefix: string) {
    for (const key of [...this.files.keys()]) if (key.startsWith(`${prefix}/`)) this.files.delete(key);
  }
}

let provider: SpyFace;
let store: MemoryStorage;
const deps = (now?: Date): FaceSearchDeps => ({ provider, storage: store, now: now ? () => now : undefined });
beforeEach(() => {
  provider = new SpyFace();
  store = new MemoryStorage();
});

let n = 0;
async function newAccount({ consent = true, faceConsent = true, liveCheck = true, selfie = true } = {}) {
  const { account } = await createAccount();
  created.push(account.id);
  if (consent) await recordConsent(account.id);
  if (faceConsent) await recordFaceSearchConsent(account.id);
  if (liveCheck) {
    n += 1;
    await db.livenessSession.create({
      data: {
        id: `face-test-${Date.now()}-${n}`,
        accountId: account.id,
        status: "PASSED",
        passedAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
  }
  if (selfie) store.files.set(`accounts/${account.id}/selfie`, Buffer.from(`selfie of ${account.id}`));
  return db.account.findUniqueOrThrow({ where: { id: account.id } });
}

describe("hard rule: only the live-verified person's own face can be searched", () => {
  it("sends exactly the selfie the server saved for THIS account", async () => {
    const mine = await newAccount();
    await newAccount(); // another account with its own selfie
    expect((await runFaceSearch(mine, deps())).ok).toBe(true);
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0].toString()).toBe(`selfie of ${mine.id}`);
  });

  it("the search takes no picture from the caller: there is nothing to swap in", () => {
    const service = readFileSync(path.join(root, "web/src/lib/face-search/service.ts"), "utf8");
    expect(service).toMatch(/export async function runFaceSearch\(account: AccountLike, deps: FaceSearchDeps\)/);
    const route = readFileSync(path.join(root, "web/src/app/api/face-search/route.ts"), "utf8");
    expect(route).not.toMatch(/formData|arrayBuffer|photo/i);
    // Only the face-search service may call a face-search provider.
    const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "web/src"], { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter((f) => /\.(ts|tsx)$/.test(f));
    const callers = files.filter((f) => /provider\.search\(selfie\)/.test(readFileSync(path.join(root, f), "utf8")));
    expect(callers).toEqual(["web/src/lib/face-search/service.ts"]);
  });

  it("without a valid live check nothing is sent", async () => {
    const account = await newAccount({ liveCheck: false });
    expect(await runFaceSearch(account, deps())).toEqual({ ok: false, reason: "live_check_required" });
    expect(provider.sent).toHaveLength(0);
  });

  it("a live check older than 15 minutes no longer counts", async () => {
    const account = await newAccount();
    const later = new Date(Date.now() + 16 * 60 * 1000);
    expect(await runFaceSearch(account, deps(later))).toEqual({ ok: false, reason: "live_check_required" });
    expect(provider.sent).toHaveLength(0);
  });

  it("without the separate face-search consent nothing is sent", async () => {
    const account = await newAccount({ faceConsent: false });
    expect(await runFaceSearch(account, deps())).toEqual({ ok: false, reason: "face_consent_required" });
    expect(provider.sent).toHaveLength(0);
  });

  it("without the general consent nothing is sent", async () => {
    const account = await newAccount({ consent: false, faceConsent: false, liveCheck: false });
    expect(await runFaceSearch(account, deps())).toEqual({ ok: false, reason: "consent_required" });
    expect(provider.sent).toHaveLength(0);
  });

  it("without a saved selfie nothing is sent", async () => {
    const account = await newAccount({ selfie: false });
    expect(await runFaceSearch(account, deps())).toEqual({ ok: false, reason: "selfie_not_available" });
    expect(provider.sent).toHaveLength(0);
  });
});

describe("face search results", () => {
  it("weak matches (likely other people) and unsafe links are dropped", async () => {
    const account = await newAccount();
    expect(await runFaceSearch(account, deps())).toMatchObject({ ok: true, matches: 2 });
    const rows = await db.imageMatch.findMany({ where: { accountId: account.id }, orderBy: { matchScore: "desc" } });
    expect(rows.map((r) => [r.pageUrl, r.matchScore])).toEqual([
      ["https://x.com/someone/status/1", 95],
      ["https://blog.test/post", 80],
    ]);
    expect(rows.every((r) => (r.matchScore ?? 0) >= MIN_FACE_SCORE)).toBe(true);
  });

  it("no face data is stored: only links, scores and an encrypted-store thumbnail", async () => {
    const account = await newAccount();
    await runFaceSearch(account, deps());
    const row = await db.imageMatch.findFirstOrThrow({ where: { accountId: account.id, matchScore: 95 } });
    expect(row.thumbnailUrl).toBe(`/api/matches/${row.id}/thumb`);
    expect(store.files.has(`accounts/${account.id}/face-results/${row.id}`)).toBe(true);
    const run = await db.searchRun.findFirstOrThrow({ where: { accountId: account.id } });
    expect(run.kind).toBe("face");
    expect(run.photoId).toBeNull();
  });

  it("a result thumbnail can be read by its owner only", async () => {
    const mine = await newAccount();
    const other = await newAccount();
    await runFaceSearch(mine, deps());
    const row = await db.imageMatch.findFirstOrThrow({ where: { accountId: mine.id, matchScore: 95 } });
    expect(await readFaceThumb(other.id, row.id, store)).toBeNull();
    expect(await readFaceThumb(mine.id, row.id, store)).not.toBeNull();
  });

  it(`at most ${MAX_FACE_SEARCHES_PER_DAY} face searches a day, also when asked all at once`, async () => {
    const account = await newAccount();
    const outcomes = await Promise.all(Array.from({ length: 8 }, () => runFaceSearch(account, deps())));
    expect(outcomes.filter((o) => o.ok)).toHaveLength(MAX_FACE_SEARCHES_PER_DAY);
    expect(provider.sent).toHaveLength(MAX_FACE_SEARCHES_PER_DAY);
    expect(await runFaceSearch(account, deps())).toEqual({ ok: false, reason: "daily_limit" });
  });

  it("a failed search uses up no place and stores nothing", async () => {
    const account = await newAccount();
    provider.fail = true;
    expect(await runFaceSearch(account, deps())).toEqual({ ok: false, reason: "provider_error" });
    expect(await db.searchRun.count({ where: { accountId: account.id } })).toBe(0);
  });

  it("face-search results are deleted after 30 days", async () => {
    const account = await newAccount();
    const old = new Date(Date.now() - 31 * 86_400_000);
    await db.livenessSession.updateMany({ where: { accountId: account.id }, data: { expiresAt: new Date(old.getTime() + 600_000) } });
    await runFaceSearch(account, deps(old));
    expect(await db.imageMatch.count({ where: { accountId: account.id } })).toBe(2);
    await purgeOldFaceResults(store, new Date());
    expect(await db.imageMatch.count({ where: { accountId: account.id } })).toBe(0);
    expect([...store.files.keys()].filter((k) => k.includes("face-results"))).toEqual([]);
  });
});

describe("FaceCheck provider", () => {
  function fakeFetch(replies: unknown[]) {
    const calls: { url: string; init: RequestInit }[] = [];
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return new Response(JSON.stringify(replies[Math.min(calls.length - 1, replies.length - 1)]), { status: 200 });
    }) as typeof fetch;
    return { calls, impl };
  }
  const SELFIE = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 5]);

  it("uploads the selfie, polls until done, and maps the hits", async () => {
    const thumb = Buffer.from("thumb-bytes").toString("base64");
    const { calls, impl } = fakeFetch([
      { id_search: "abc", error: null },
      { progress: 40, output: null },
      { output: { items: [{ score: 91, url: "https://site.test/p", base64: `data:image/webp;base64,${thumb}` }, { score: 50 }] } },
    ]);
    const hits = await new FaceCheckProvider("tok-not-real", true, impl, async () => undefined).search(SELFIE);
    expect(hits).toEqual([{ pageUrl: "https://site.test/p", score: 91, thumbnail: Buffer.from("thumb-bytes") }]);
    expect(calls.map((c) => c.url)).toEqual([
      `${FACECHECK_BASE}/api/upload_pic`,
      `${FACECHECK_BASE}/api/search`,
      `${FACECHECK_BASE}/api/search`,
    ]);
    expect(FACECHECK_BASE).toBe("https://facecheck.id");
    expect(new Headers(calls[0].init.headers).get("authorization")).toBe("tok-not-real");
    expect(calls.every((c) => !c.url.includes("tok-not-real"))).toBe(true);
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ id_search: "abc", with_progress: true, status_only: false, demo: true });
    const sent = (calls[0].init.body as FormData).get("images") as File;
    expect(Buffer.from(await sent.arrayBuffer()).equals(SELFIE)).toBe(true);
  });

  it("errors never leak the token or the reply", async () => {
    const { impl } = fakeFetch([{ id_search: null, error: "token secret-detail invalid" }]);
    const error = await new FaceCheckProvider("super-secret", true, impl).search(SELFIE).catch((e: Error) => e);
    expect((error as Error).message).toBe("FaceCheck did not accept the picture");
  });

  it("refuses to start without a token", () => {
    expect(() => new FaceCheckProvider("", true)).toThrow(/FACECHECK_API_TOKEN/);
  });

  it("the mock provider returns a spread of scores so the cut-off is exercised", async () => {
    const hits = await new MockFaceProvider().search(SELFIE);
    expect(hits.some((h) => h.score >= MIN_FACE_SCORE)).toBe(true);
    expect(hits.some((h) => h.score < MIN_FACE_SCORE)).toBe(true);
  });
});
