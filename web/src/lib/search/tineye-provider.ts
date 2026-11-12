// Real reverse image search through TinEye's official API.
// Written from the official OpenAPI file (https://api.tineye.com/rest/docs/openapi.json,
// read 2026-11-11) and checked against TinEye's free sandbox:
//   POST https://api.tineye.com/rest/search/   multipart field "image_upload"
//   header X-API-KEY: <key>
//   answer: { code, messages, stats, results: { matches: [ { domain, image_url,
//             backlinks: [ { backlink, url, crawl_date } ], ... } ] } }
// This is the only file in the web app that calls an outside service.

import type { ImageMatchResult, ReverseImageSearchProvider, SearchImage } from "./provider";

export const TINEYE_SEARCH_URL = "https://api.tineye.com/rest/search/";
const MAX_MATCHES = 50;
const MAX_BACKLINKS_PER_MATCH = 3;
const TIMEOUT_MS = 30_000;

interface TinEyeBacklink {
  backlink?: string;
  crawl_date?: string;
}
interface TinEyeMatch {
  score?: number;
  domain?: string;
  image_url?: string;
  backlinks?: TinEyeBacklink[];
}
interface TinEyeResponse {
  code?: number;
  results?: { matches?: TinEyeMatch[] };
}

const EXTENSION: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export class TinEyeProvider implements ReverseImageSearchProvider {
  readonly name = "tineye";

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {
    if (!apiKey) throw new Error("TINEYE_API_KEY is not set. See .env.example.");
  }

  async search(image: SearchImage): Promise<ImageMatchResult[]> {
    const form = new FormData();
    form.set(
      "image_upload",
      new Blob([new Uint8Array(image.bytes)], { type: image.mimeType }),
      `photo.${EXTENSION[image.mimeType] ?? "jpg"}`,
    );
    const query = new URLSearchParams({
      limit: String(MAX_MATCHES),
      backlink_limit: String(MAX_BACKLINKS_PER_MATCH),
      sort: "score",
      order: "desc",
    });
    const res = await this.fetchImpl(`${TINEYE_SEARCH_URL}?${query}`, {
      method: "POST",
      headers: { "X-API-KEY": this.apiKey },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Never put the key, the image or the reply body into an error message.
    if (!res.ok) throw new Error(`TinEye answered with status ${res.status}`);
    const data = (await res.json()) as TinEyeResponse;

    const results: ImageMatchResult[] = [];
    for (const match of data.results?.matches ?? []) {
      for (const link of match.backlinks ?? []) {
        if (!link.backlink) continue;
        const date = link.crawl_date ? new Date(`${link.crawl_date}T00:00:00Z`) : undefined;
        results.push({
          pageUrl: link.backlink,
          siteName: match.domain || safeHost(link.backlink),
          // TinEye's own small copy of the result image; shown by the browser, never fetched by us.
          thumbnailUrl: match.image_url,
          foundDate: date && !Number.isNaN(date.getTime()) ? date : undefined,
          score: typeof match.score === "number" ? match.score : undefined,
        });
      }
    }
    return results;
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown site";
  }
}
