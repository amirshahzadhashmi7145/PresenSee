import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createAccount } from "@/lib/account";
import { db } from "@/lib/db";
import { recordConsent } from "@/lib/liveness";
import { GENERIC_REPORT_LINKS, REPORT_LINKS, reportLinkFor } from "@/lib/report-links";
import { ALLOWED_HOSTS, HOST_GAP_MS, type OutboundDeps, PoliteClient, USER_AGENT } from "@/lib/usernames/outbound";
import { isAllowedByRobots } from "@/lib/usernames/robots";
import { addUsername, checkSite, recheckUsername, tagProfileCheck } from "@/lib/usernames/service";
import { type AutoSite, MAX_USERNAMES, RESERVED_HANDLES, SITES, normalizeHandle } from "@/lib/usernames/sites";

const created: string[] = [];
afterAll(async () => {
  await db.account.deleteMany({ where: { id: { in: created } } });
  await db.$disconnect();
});

async function newAccount(consent = true) {
  const { account } = await createAccount();
  created.push(account.id);
  return consent ? recordConsent(account.id) : account;
}

/** A pretend internet: records every request, answers from a table. */
class FakeNet {
  requests: { url: string; method: string; redirect: string; ua: string; at: number }[] = [];
  robots = new Map<string, { status: number; text: string }>();
  pages = new Map<string, { status: number; location?: string; body?: string }>();
  time = 1_000_000;
  slept: number[] = [];

  deps(): OutboundDeps {
    return {
      now: () => this.time,
      sleep: async (ms) => {
        this.slept.push(ms);
        this.time += ms;
      },
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const headers = new Headers(init?.headers);
        this.requests.push({
          url,
          method: init?.method ?? "GET",
          redirect: init?.redirect ?? "follow",
          ua: headers.get("user-agent") ?? "",
          at: this.time,
        });
        const u = new URL(url);
        if (u.pathname === "/robots.txt") {
          const robots = this.robots.get(u.host) ?? { status: 404, text: "" };
          return new Response(robots.text, { status: robots.status });
        }
        const page = this.pages.get(url) ?? { status: 404 };
        return new Response(page.body ?? "page content that must never be read", {
          status: page.status,
          headers: page.location ? { location: page.location } : {},
        });
      }) as typeof fetch,
    };
  }
  profileRequests() {
    return this.requests.filter((r) => !r.url.endsWith("/robots.txt"));
  }
}

let net: FakeNet;
let client: PoliteClient;
beforeEach(() => {
  net = new FakeNet();
  client = new PoliteClient(net.deps());
});

const site = (id: string) => SITES.find((s) => s.id === id) as AutoSite;

describe("hard rule: only the fixed list of addresses is ever requested", () => {
  it("refuses a host that is not on the list", async () => {
    expect(await client.get("https://evil.example/profile")).toEqual({ ok: false, reason: "host_not_listed" });
    expect(await client.get("http://github.com/someone")).toEqual({ ok: false, reason: "host_not_listed" });
    expect(net.requests).toHaveLength(0);
  });

  it("manual sites have no check address and are never requested", async () => {
    const manual = SITES.filter((s) => s.kind === "manual");
    expect(manual.length).toBeGreaterThanOrEqual(10);
    for (const s of manual) {
      expect("checkUrl" in s).toBe(false);
      expect(ALLOWED_HOSTS.has(new URL(s.profileUrl("someone")).host)).toBe(false);
      expect(await checkSite(s, "someone", client)).toBe("MANUAL");
    }
    expect(net.requests).toHaveLength(0);
  });

  it("the big social sites are link-only", () => {
    for (const id of ["instagram", "facebook", "x", "tiktok", "linkedin", "reddit"]) {
      expect(SITES.find((s) => s.id === id)?.kind).toBe("manual");
    }
  });

  it("uses GET, never follows redirects, and says who it is", async () => {
    await client.get(site("github").checkUrl("someone"));
    const request = net.profileRequests()[0];
    expect(request.method).toBe("GET");
    expect(request.redirect).toBe("manual");
    expect(request.ua).toBe(USER_AGENT);
    expect(USER_AGENT).toMatch(/^PresenSeeBot\//);
  });

  it("the list has about 30 sites, each with one https address", () => {
    expect(SITES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(SITES.map((s) => s.id)).size).toBe(SITES.length);
    for (const s of SITES) expect(s.profileUrl("name")).toMatch(/^https:\/\//);
  });
});

describe("hard rule: never touch signup, login or password-reset pages", () => {
  const BAD = /(sign[_-]?up|sign[_-]?in|log[_-]?in|register|password|reset|recover|forgot)/i;

  it("no address on the list is such a page", () => {
    for (const s of SITES) {
      expect(s.profileUrl("name"), s.id).not.toMatch(BAD);
      if (s.kind === "auto") expect(s.checkUrl("name"), s.id).not.toMatch(BAD);
    }
  });

  it("a username can never be one of those page names", () => {
    for (const word of ["login", "signup", "register", "password", "reset", "recover", "Sign_In"]) {
      expect(normalizeHandle(word), word).toBeNull();
    }
    expect(RESERVED_HANDLES.has("login")).toBe(true);
  });

  it("the request module itself refuses such a path", async () => {
    expect(await client.get("https://gitlab.com/users/sign_in")).toEqual({ ok: false, reason: "forbidden_path" });
    expect(await client.get("https://api.github.com/password_reset")).toEqual({ ok: false, reason: "forbidden_path" });
    expect(net.requests).toHaveLength(0);
  });

  it("the username check takes a name only, never an email address", () => {
    expect(normalizeHandle("someone@example.com")).toBeNull();
    expect(normalizeHandle("a b")).toBeNull();
    expect(normalizeHandle("../../etc")).toBeNull();
    expect(normalizeHandle("@good_name")).toBe("good_name");
  });
});

describe("hard rule: robots.txt is respected", () => {
  it("a disallowed address is not requested", async () => {
    net.robots.set("dribbble.com", { status: 200, text: "User-agent: *\nDisallow: /" });
    expect(await client.get(site("dribbble").checkUrl("someone"))).toEqual({ ok: false, reason: "robots" });
    expect(net.profileRequests()).toHaveLength(0);
    expect(await checkSite(site("dribbble"), "someone", client)).toBe("UNKNOWN");
  });

  it("rules written for our bot by name win over the general rules", async () => {
    net.robots.set("dribbble.com", { status: 200, text: "User-agent: *\nAllow: /\n\nUser-agent: PresenSeeBot\nDisallow: /" });
    expect((await client.get(site("dribbble").checkUrl("someone"))).ok).toBe(false);
  });

  it("if robots.txt cannot be read (error or blocked), nothing is requested", async () => {
    net.robots.set("vimeo.com", { status: 503, text: "" });
    net.robots.set("kick.com", { status: 403, text: "" });
    expect(await client.get(site("vimeo").checkUrl("someone"))).toEqual({ ok: false, reason: "robots" });
    expect(await client.get(site("kick").checkUrl("someone"))).toEqual({ ok: false, reason: "robots" });
    expect(net.profileRequests()).toHaveLength(0);
  });

  it("no robots.txt at all means no rules", async () => {
    expect((await client.get(site("vimeo").checkUrl("someone"))).ok).toBe(true);
  });

  it("robots.txt is fetched once per site and remembered", async () => {
    await client.get(site("github").checkUrl("one"));
    await client.get(site("github").checkUrl("two"));
    expect(net.requests.filter((r) => r.url.endsWith("/robots.txt"))).toHaveLength(1);
  });

  it("reads the rules the standard way", () => {
    const txt = "User-agent: *\nDisallow: /private\nAllow: /private/open\nDisallow: /*.json$\nDisallow:\n";
    expect(isAllowedByRobots(txt, "PresenSeeBot", "/someone")).toBe(true);
    expect(isAllowedByRobots(txt, "PresenSeeBot", "/private/x")).toBe(false);
    expect(isAllowedByRobots(txt, "PresenSeeBot", "/private/open/x")).toBe(true);
    expect(isAllowedByRobots(txt, "PresenSeeBot", "/data.json")).toBe(false);
    expect(isAllowedByRobots(txt, "PresenSeeBot", "/data.json?x=1")).toBe(true);
    expect(isAllowedByRobots("", "PresenSeeBot", "/anything")).toBe(true);
  });
});

describe("hard rule: rate limited", () => {
  it("waits between two requests to the same site", async () => {
    await client.get(site("github").checkUrl("one"));
    await client.get(site("github").checkUrl("two"));
    const [first, second] = net.profileRequests();
    expect(second.at - first.at).toBeGreaterThanOrEqual(HOST_GAP_MS);
  });

  it("requests to the same site never overlap, even when asked at once", async () => {
    await Promise.all(["a1", "b2", "c3", "d4"].map((h) => client.get(site("vimeo").checkUrl(h))));
    const times = net.profileRequests().map((r) => r.at);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(HOST_GAP_MS);
  });

  it("a username can be checked again only after an hour", async () => {
    const account = await newAccount();
    const now = new Date("2026-06-01T10:00:00Z");
    const added = await addUsername(account, "some_name", client, now);
    if (!added.ok) throw new Error("add failed");
    const soon = new Date(now.getTime() + 30 * 60 * 1000);
    expect(await recheckUsername(account.id, added.usernameId, client, soon)).toEqual({ ok: false, reason: "too_soon" });
    const later = new Date(now.getTime() + 61 * 60 * 1000);
    expect(await recheckUsername(account.id, added.usernameId, client, later)).toEqual({ ok: true });
  });
});

describe("reading the answer", () => {
  it("found, not found and unclear answers are told apart", async () => {
    net.pages.set(site("github").checkUrl("real"), { status: 200 });
    expect(await checkSite(site("github"), "real", client)).toBe("FOUND");
    expect(await checkSite(site("github"), "missing", client)).toBe("NOT_FOUND");
    net.pages.set(site("github").checkUrl("limited"), { status: 429 });
    expect(await checkSite(site("github"), "limited", client)).toBe("UNKNOWN");
  });

  it("sites that answer with a redirect are read from the redirect target, without following it", async () => {
    net.pages.set(site("gitlab").checkUrl("missing"), { status: 302, location: "https://gitlab.com/users/sign_in" });
    expect(await checkSite(site("gitlab"), "missing", client)).toBe("NOT_FOUND");
    expect(net.requests.some((r) => r.url.includes("sign_in"))).toBe(false);
    net.pages.set(site("patreon").checkUrl("maker"), { status: 308, location: "/cw/maker" });
    expect(await checkSite(site("patreon"), "maker", client)).toBe("FOUND");
    net.pages.set(site("substack").checkUrl("nobody1"), { status: 302, location: "https://substack.com/search/nobody1?searching=profile" });
    expect(await checkSite(site("substack"), "nobody1", client)).toBe("NOT_FOUND");
  });

  it("official API answers are read from their small JSON reply", async () => {
    net.pages.set(site("hackernews").checkUrl("ghost"), { status: 200, body: "null" });
    expect(await checkSite(site("hackernews"), "ghost", client)).toBe("NOT_FOUND");
    net.pages.set(site("hackernews").checkUrl("real"), { status: 200, body: '{"id":"real"}' });
    expect(await checkSite(site("hackernews"), "real", client)).toBe("FOUND");
    net.pages.set(site("bluesky").checkUrl("ghost"), { status: 400, body: '{"error":"InvalidRequest","message":"Profile not found"}' });
    expect(await checkSite(site("bluesky"), "ghost", client)).toBe("NOT_FOUND");
  });

  it("page content is not read for profile-page sites", async () => {
    net.pages.set(site("vimeo").checkUrl("real"), { status: 200, body: "SECRET PAGE CONTENT" });
    const res = await client.get(site("vimeo").checkUrl("real"));
    expect(res.ok && res.body).toBe("");
  });

  it("a name that cannot exist on a site is not requested there", async () => {
    expect(await checkSite(site("venmo"), "abc", client)).toBe("NOT_FOUND"); // Venmo names are 5+ characters
    expect(net.requests).toHaveLength(0);
  });
});

describe("hard rule: at most 5 usernames per account", () => {
  it("the 6th username is refused and nothing is requested for it", async () => {
    const account = await newAccount();
    for (let i = 0; i < MAX_USERNAMES; i++) expect((await addUsername(account, `name_${i}`, client)).ok).toBe(true);
    const before = net.requests.length;
    expect(await addUsername(account, "name_six", client)).toEqual({ ok: false, reason: "username_limit" });
    expect(net.requests.length).toBe(before);
    expect(await db.username.count({ where: { accountId: account.id } })).toBe(5);
  });

  it("adding many at the same moment still cannot go past 5", async () => {
    const account = await newAccount();
    const outcomes = await Promise.all(Array.from({ length: 9 }, (_, i) => addUsername(account, `burst_${i}`, client)));
    expect(outcomes.filter((o) => o.ok)).toHaveLength(5);
  });

  it("before consent nothing is added and nothing is requested", async () => {
    const account = await newAccount(false);
    expect(await addUsername(account, "some_name", client)).toEqual({ ok: false, reason: "consent_required" });
    expect(net.requests).toHaveLength(0);
  });

  it("one row is saved per site, and only the owner can tag it", async () => {
    const owner = await newAccount();
    const other = await newAccount();
    net.pages.set(site("github").checkUrl("somename1"), { status: 200 });
    const added = await addUsername(owner, "somename1", client);
    if (!added.ok) throw new Error("add failed");
    const rows = await db.profileCheck.findMany({ where: { usernameId: added.usernameId } });
    expect(rows).toHaveLength(SITES.length);
    const github = rows.find((r) => r.siteId === "github");
    expect(github?.status).toBe("FOUND");
    expect(rows.find((r) => r.siteId === "instagram")?.status).toBe("MANUAL");
    expect(await tagProfileCheck(other.id, github!.id, "FAKE")).toBe(false);
    expect(await tagProfileCheck(owner.id, github!.id, "FAKE")).toBe(true);
  });
});

describe("official report links", () => {
  it("finds the platform from a result address, including subdomains", () => {
    expect(reportLinkFor("https://www.instagram.com/fake_me/")?.platform).toBe("Instagram");
    expect(reportLinkFor("https://m.facebook.com/fake.me")?.platform).toBe("Facebook");
    expect(reportLinkFor("https://x.com/fake_me")?.platform).toBe("X (Twitter)");
    expect(reportLinkFor("https://www.tiktok.com/@fake")?.platform).toBe("TikTok");
  });

  it("does not confuse look-alike domains", () => {
    expect(reportLinkFor("https://notinstagram.com/x")).toBeNull();
    expect(reportLinkFor("https://instagram.com.evil.test/x")).toBeNull();
    expect(reportLinkFor("not a url")).toBeNull();
  });

  it("every report link is https and on the platform's own or its parent company's domain", () => {
    const OWN: Record<string, string[]> = {
      Threads: ["instagram.com"],
      YouTube: ["google.com"],
      Mastodon: ["joinmastodon.org"],
    };
    for (const link of REPORT_LINKS) {
      const host = new URL(link.url).hostname;
      expect(link.url).toMatch(/^https:\/\//);
      const ok = [...link.domains, ...(OWN[link.platform] ?? [])].some((d) => host === d || host.endsWith(`.${d}`));
      expect(ok, link.platform).toBe(true);
    }
    expect(GENERIC_REPORT_LINKS.length).toBeGreaterThan(0);
  });
});
