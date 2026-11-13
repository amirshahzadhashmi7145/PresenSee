// Real reverse image search through Google Cloud Vision "Web Detection",
// an official Google API. Free for the first 1,000 searches each month.
// Written from Google's docs (https://docs.cloud.google.com/vision/docs/detecting-web
// and https://cloud.google.com/vision/pricing, read 2026-11-13):
//   POST https://vision.googleapis.com/v1/images:annotate
//   header X-goog-api-key: <key>
//   body  { requests: [ { image: { content: <base64> },
//                         features: [ { type: "WEB_DETECTION", maxResults } ] } ] }
//   answer responses[0].webDetection.pagesWithMatchingImages[]:
//          { url, pageTitle, fullMatchingImages[{url}], partialMatchingImages[{url}] }
//
// We use ONLY "pages with matching images": pages that hold a copy of the
// uploaded photo. We deliberately ignore Google's "visually similar images"
// (look-alike pictures, possibly of other people) and its entity labels
// (which can name a person). PresenSee finds copies of your photos, nothing else.

import type { ImageMatchResult, ReverseImageSearchProvider, SearchImage } from "./provider";

export const GOOGLE_VISION_URL = "https://vision.googleapis.com/v1/images:annotate";
const MAX_RESULTS = 50;
const TIMEOUT_MS = 30_000;

interface WebImage {
  url?: string;
}
interface WebPage {
  url?: string;
  fullMatchingImages?: WebImage[];
  partialMatchingImages?: WebImage[];
}
interface VisionResponse {
  responses?: { webDetection?: { pagesWithMatchingImages?: WebPage[] }; error?: { message?: string } }[];
}

export class GoogleVisionProvider implements ReverseImageSearchProvider {
  readonly name = "google";
  /** Stay inside Google's free allowance (1,000 a month) with some room to spare. */
  readonly monthlyLimit = 900;

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {
    if (!apiKey) throw new Error("GOOGLE_VISION_API_KEY is not set. See .env.example.");
  }

  async search(image: SearchImage): Promise<ImageMatchResult[]> {
    const res = await this.fetchImpl(GOOGLE_VISION_URL, {
      method: "POST",
      // The key goes in a header, never in the address.
      headers: { "X-goog-api-key": this.apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: image.bytes.toString("base64") },
            features: [{ type: "WEB_DETECTION", maxResults: MAX_RESULTS }],
          },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Never put the key, the image or the reply body into an error message.
    if (!res.ok) throw new Error(`Google Vision answered with status ${res.status}`);
    const data = (await res.json()) as VisionResponse;
    const first = data.responses?.[0];
    if (first?.error) throw new Error("Google Vision could not process the image");

    const results: ImageMatchResult[] = [];
    for (const page of first?.webDetection?.pagesWithMatchingImages ?? []) {
      if (!page.url) continue;
      const full = page.fullMatchingImages?.[0]?.url;
      const partial = page.partialMatchingImages?.[0]?.url;
      results.push({
        pageUrl: page.url,
        siteName: safeHost(page.url),
        thumbnailUrl: full ?? partial,
        // Google gives no number. A full copy is certain; a cropped or edited copy is marked lower.
        score: full ? 100 : partial ? 70 : undefined,
      });
    }
    return results;
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown site";
  }
}
