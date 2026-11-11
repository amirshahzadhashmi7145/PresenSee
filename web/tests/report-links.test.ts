import { describe, expect, it } from "vitest";
import { GENERIC_REPORT_LINKS, REPORT_LINKS, reportLinkFor } from "@/lib/report-links";

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

describe("hard rule: this server makes no requests to outside websites", () => {
  it("the only outbound calls in the web code go to our own face service", async () => {
    const { execFileSync } = await import("node:child_process");
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(__dirname, "../..");
    const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "web/src/lib", "web/src/app/api"], {
      cwd: root,
      encoding: "utf8",
    })
      .split("\n")
      .filter((f) => /\.(ts|tsx)$/.test(f));
    const withFetch = files.filter((f) => /\bfetch\(/.test(readFileSync(path.join(root, f), "utf8")));
    expect(withFetch).toEqual(["web/src/lib/face-client.ts"]);
  });
});
