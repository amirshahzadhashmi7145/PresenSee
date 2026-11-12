import { describe, expect, it } from "vitest";
import { profileFromUrl, summarizePresence } from "@/lib/presence";

describe("profiles from result links", () => {
  it.each([
    ["https://www.instagram.com/some.one/", "Instagram", "some.one"],
    ["https://www.instagram.com/stories/some_one/123/", "Instagram", "some_one"],
    ["https://m.facebook.com/jane.doe.5", "Facebook", "jane.doe.5"],
    ["https://www.facebook.com/profile.php?id=1000123", "Facebook", "1000123"],
    ["https://x.com/someone/status/123", "X (Twitter)", "someone"],
    ["https://twitter.com/someone", "X (Twitter)", "someone"],
    ["https://www.tiktok.com/@some.one/video/99", "TikTok", "some.one"],
    ["https://www.linkedin.com/in/jane-doe-12ab/", "LinkedIn", "jane-doe-12ab"],
    ["https://www.reddit.com/user/someone/comments/x", "Reddit", "someone"],
    ["https://www.youtube.com/@someone/videos", "YouTube", "someone"],
    ["https://someone.tumblr.com/post/1", "Tumblr", "someone"],
    ["https://t.me/someone", "Telegram", "someone"],
  ])("%s", (url, platform, handle) => {
    expect(profileFromUrl(url)).toMatchObject({ platform, handle });
  });

  it("gives nothing for pages that are not a profile", () => {
    for (const url of [
      "https://www.instagram.com/p/Cabc123/",
      "https://www.instagram.com/explore/tags/x/",
      "https://x.com/search?q=me",
      "https://www.facebook.com/groups/123",
      "https://www.tiktok.com/discover",
      "https://some-blog.test/post/1",
      "https://instagram.com.evil.test/someone",
      "not a url",
    ]) {
      expect(profileFromUrl(url), url).toBeNull();
    }
  });

  it("builds a clean link to the profile itself", () => {
    expect(profileFromUrl("https://x.com/someone/status/1")?.profileUrl).toBe("https://x.com/someone");
    expect(profileFromUrl("https://www.tiktok.com/@a.b/video/1")?.profileUrl).toBe("https://www.tiktok.com/@a.b");
  });
});

describe("presence summary", () => {
  it("rolls results up into profiles and sites, counting each page once", () => {
    const summary = summarizePresence([
      { pageUrl: "https://x.com/fake_me/status/1", siteName: "x.com", tag: "FAKE" },
      { pageUrl: "https://x.com/fake_me/status/2", siteName: "x.com", tag: "FAKE" },
      { pageUrl: "https://x.com/fake_me/status/2", siteName: "x.com", tag: "FAKE" }, // same page, from another photo
      { pageUrl: "https://www.instagram.com/real_me/", siteName: "www.instagram.com", tag: "MINE" },
      { pageUrl: "https://blog.test/post", siteName: "blog.test", tag: "UNTAGGED" },
    ]);
    expect(summary.pages).toBe(4);
    expect(summary.sites).toEqual([
      { site: "x.com", pages: 2 },
      { site: "blog.test", pages: 1 },
      { site: "instagram.com", pages: 1 },
    ]);
    expect(summary.profiles.map((p) => [p.platform, p.handle, p.pages, p.fake, p.mine])).toEqual([
      ["X (Twitter)", "fake_me", 2, 2, 0],
      ["Instagram", "real_me", 1, 0, 1],
    ]);
    expect([summary.fake, summary.mine, summary.untagged]).toEqual([2, 1, 1]);
  });

  it("this code only reads link text: it has no way to visit a page", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const text = readFileSync(path.resolve(__dirname, "../src/lib/presence.ts"), "utf8");
    expect(text).not.toMatch(/\bfetch\(|face-client|node:http/);
  });
});
