// Fake search results so the whole app works without any API key.
// The same photo always gives the same results. All handles start with
// "presensee_mock_" so nobody mistakes them for real findings.

import { createHash } from "node:crypto";
import type { ImageMatchResult, ReverseImageSearchProvider, SearchImage } from "./provider";

const SITES: { siteName: string; url: (handle: string) => string }[] = [
  { siteName: "instagram.com", url: (h) => `https://www.instagram.com/${h}/` },
  { siteName: "instagram.com", url: (h) => `https://www.instagram.com/${h}/` },
  { siteName: "facebook.com", url: (h) => `https://www.facebook.com/${h}` },
  { siteName: "x.com", url: (h) => `https://x.com/${h}` },
  { siteName: "tiktok.com", url: (h) => `https://www.tiktok.com/@${h}` },
  { siteName: "linkedin.com", url: (h) => `https://www.linkedin.com/in/${h}` },
  { siteName: "pinterest.com", url: (h) => `https://www.pinterest.com/${h}/` },
  { siteName: "tinder.com", url: (h) => `https://tinder.com/@${h}` },
  { siteName: "example-blog.test", url: (h) => `https://example-blog.test/posts/${h}` },
  { siteName: "example-forum.test", url: (h) => `https://example-forum.test/member/${h}` },
];

function thumbnail(label: string, hue: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">` +
    `<rect width="96" height="96" fill="hsl(${hue},45%,70%)"/>` +
    `<text x="48" y="44" font-size="11" text-anchor="middle" font-family="sans-serif">fake result</text>` +
    `<text x="48" y="62" font-size="10" text-anchor="middle" font-family="sans-serif">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export class MockProvider implements ReverseImageSearchProvider {
  readonly name = "mock";

  async search(image: SearchImage): Promise<ImageMatchResult[]> {
    const digest = createHash("sha256").update(image.bytes).digest();
    const count = 3 + (digest[0] % 4); // 3 to 6 results
    const results: ImageMatchResult[] = [];
    for (let i = 0; i < count; i++) {
      const site = SITES[(digest[1] + i * 2) % SITES.length];
      const handle = `presensee_mock_${digest.subarray(2 + i, 5 + i).toString("hex")}`;
      const daysAgo = digest[10 + i] * 3;
      results.push({
        pageUrl: site.url(handle),
        siteName: site.siteName,
        thumbnailUrl: thumbnail(site.siteName.split(".")[0], (digest[20 + i] * 360) / 256),
        // Every third result has no date, like real providers.
        foundDate: i % 3 === 2 ? undefined : new Date(Date.UTC(2026, 10, 1) - daysAgo * 86_400_000),
        score: 55 + (digest[25 + i] % 46), // 55 to 100
      });
    }
    return results;
  }
}
