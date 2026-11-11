// The ONLY code that sends requests to sites on the username list.
// It is deliberately narrow:
//  - only hosts that appear in the fixed site list
//  - GET only, redirects never followed
//  - robots.txt is fetched, cached and obeyed before every request
//  - one request at a time per site, with a pause between them
//  - only the status line (and, for official APIs, a tiny JSON answer) is read

import { isAllowedByRobots } from "./robots";
import { SITES, type SiteResponse } from "./sites";

export const BOT_TOKEN = "PresenSeeBot";
export const USER_AGENT =
  "PresenSeeBot/0.1 (+https://github.com/amirshahzadhashmi7145/PresenSee; checks a user's own handle)";
export const HOST_GAP_MS = 2000;
const TIMEOUT_MS = 8000;
const ROBOTS_TTL_MS = 24 * 60 * 60 * 1000;
const ROBOTS_RETRY_MS = 15 * 60 * 1000;
const MAX_BODY_BYTES = 64 * 1024;

const FORBIDDEN_PATH = /(sign[_-]?up|sign[_-]?in|log[_-]?in|register|password|reset|recover|forgot)/i;

export const ALLOWED_HOSTS: ReadonlySet<string> = new Set(
  SITES.filter((site) => site.kind === "auto").map((site) => new URL(site.checkUrl("probe")).host),
);

export type OutboundResult =
  | ({ ok: true } & SiteResponse)
  | { ok: false; reason: "host_not_listed" | "forbidden_path" | "robots" | "network" };

export interface OutboundDeps {
  fetch: typeof fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const realDeps: OutboundDeps = {
  fetch: (...args) => fetch(...args),
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

interface RobotsEntry {
  /** null = everything disallowed (could not read robots.txt). */
  text: string | null;
  until: number;
}

export class PoliteClient {
  private robots = new Map<string, RobotsEntry>();
  private nextSlot = new Map<string, number>();
  private queue = new Map<string, Promise<unknown>>();

  constructor(private readonly deps: OutboundDeps = realDeps) {}

  /** Wait for this host's turn: one request at a time, spaced apart. */
  private async turn<T>(host: string, work: () => Promise<T>): Promise<T> {
    const previous = this.queue.get(host) ?? Promise.resolve();
    const mine = previous.then(async () => {
      const wait = (this.nextSlot.get(host) ?? 0) - this.deps.now();
      if (wait > 0) await this.deps.sleep(wait);
      try {
        return await work();
      } finally {
        this.nextSlot.set(host, this.deps.now() + HOST_GAP_MS);
      }
    });
    this.queue.set(host, mine.catch(() => undefined));
    return mine;
  }

  private async robotsFor(url: URL): Promise<string | null> {
    const cached = this.robots.get(url.host);
    if (cached && cached.until > this.deps.now()) return cached.text;
    let entry: RobotsEntry;
    try {
      const res = await this.deps.fetch(`${url.protocol}//${url.host}/robots.txt`, {
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        entry = { text: (await res.text()).slice(0, 500_000), until: this.deps.now() + ROBOTS_TTL_MS };
      } else if ([401, 403, 429].includes(res.status) || res.status >= 500) {
        // Cannot read the rules: treat everything as disallowed, look again later.
        entry = { text: null, until: this.deps.now() + ROBOTS_RETRY_MS };
      } else {
        entry = { text: "", until: this.deps.now() + ROBOTS_TTL_MS }; // no robots.txt = no rules
      }
    } catch {
      entry = { text: null, until: this.deps.now() + ROBOTS_RETRY_MS };
    }
    this.robots.set(url.host, entry);
    return entry.text;
  }

  async get(address: string, readBody = false): Promise<OutboundResult> {
    const url = new URL(address);
    if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.host)) return { ok: false, reason: "host_not_listed" };
    if (FORBIDDEN_PATH.test(url.pathname)) return { ok: false, reason: "forbidden_path" };

    return this.turn(url.host, async (): Promise<OutboundResult> => {
      const rules = await this.robotsFor(url);
      if (rules === null || !isAllowedByRobots(rules, BOT_TOKEN, url.pathname + url.search)) {
        return { ok: false, reason: "robots" };
      }
      try {
        const res = await this.deps.fetch(url, {
          method: "GET",
          redirect: "manual",
          headers: { "user-agent": USER_AGENT, accept: readBody ? "application/json" : "*/*" },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        let body = "";
        if (readBody) body = (await res.text()).slice(0, MAX_BODY_BYTES);
        else await res.body?.cancel().catch(() => undefined); // page content is never read
        return { ok: true, status: res.status, location: res.headers.get("location"), body };
      } catch {
        return { ok: false, reason: "network" };
      }
    });
  }
}

let shared: PoliteClient | undefined;
export function politeClient(): PoliteClient {
  shared ??= new PoliteClient();
  return shared;
}
