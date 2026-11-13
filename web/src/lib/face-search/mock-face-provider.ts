// Made-up face-search results for testing without a token.

import { createHash } from "node:crypto";
import type { FaceHit, FaceSearchProvider } from "./provider";

const PAGES = [
  (h: string) => `https://www.instagram.com/${h}/`,
  (h: string) => `https://www.facebook.com/${h}`,
  (h: string) => `https://x.com/${h}/status/1900000000000000001`,
  (h: string) => `https://www.tiktok.com/@${h}/video/7300000000000000001`,
  (h: string) => `https://www.linkedin.com/in/${h}`,
  (h: string) => `https://example-news.test/people/${h}`,
  (h: string) => `https://example-dating.test/profile/${h}`,
];

function thumbnail(score: number): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#cbd5e1"/>` +
      `<circle cx="48" cy="38" r="18" fill="#94a3b8"/><rect x="20" y="62" width="56" height="34" rx="16" fill="#94a3b8"/>` +
      `<text x="48" y="92" font-size="9" text-anchor="middle" font-family="sans-serif">fake ${score}%</text></svg>`,
  );
}

export class MockFaceProvider implements FaceSearchProvider {
  readonly name = "mock-face";

  async search(selfieJpeg: Buffer): Promise<FaceHit[]> {
    const digest = createHash("sha256").update(selfieJpeg).digest();
    const hits: FaceHit[] = [];
    for (let i = 0; i < 7; i++) {
      // A spread of scores, including weak ones that the app must drop.
      const score = [97, 93, 88, 84, 79, 68, 55][i];
      const handle = `presensee_mock_${digest.subarray(i, i + 3).toString("hex")}`;
      hits.push({ pageUrl: PAGES[(digest[0] + i) % PAGES.length](handle), score, thumbnail: thumbnail(score) });
    }
    return hits;
  }
}
