// Face search through FaceCheck.ID's public API.
// Written from https://facecheck.id/Face-Search/API (read 2026-11-13):
//   POST https://facecheck.id/api/upload_pic   multipart field "images"
//        header Authorization: <token>          -> { id_search, error, code }
//   POST https://facecheck.id/api/search        JSON { id_search, with_progress, status_only, demo }
//        poll about once a second until "output" appears
//        output.items[]: { score (0-100), url, base64 (thumbnail) }
// "demo: true" is FaceCheck's free test mode: it scans only a small sample,
// so its results are not meaningful.
// NOT yet run against the live service: that needs the owner's token.

import type { FaceHit, FaceSearchProvider } from "./provider";

export const FACECHECK_BASE = "https://facecheck.id";
const POLL_MS = 1500;
const MAX_WAIT_MS = 4 * 60 * 1000;

interface UploadReply {
  id_search?: string;
  error?: string | null;
}
interface SearchReply {
  error?: string | null;
  output?: { items?: { score?: number; url?: string; base64?: string }[] } | null;
}

function decodeThumbnail(value: string | undefined): Buffer | undefined {
  if (!value) return undefined;
  const comma = value.indexOf(",");
  const raw = value.startsWith("data:") && comma > 0 ? value.slice(comma + 1) : value;
  const bytes = Buffer.from(raw, "base64");
  return bytes.length > 0 && bytes.length < 500_000 ? bytes : undefined;
}

export class FaceCheckProvider implements FaceSearchProvider {
  readonly name = "facecheck";

  constructor(
    private readonly token: string,
    private readonly demo: boolean,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
    if (!token) throw new Error("FACECHECK_API_TOKEN is not set. See .env.example.");
  }

  private headers(): Record<string, string> {
    return { accept: "application/json", Authorization: this.token };
  }

  async search(selfieJpeg: Buffer): Promise<FaceHit[]> {
    const form = new FormData();
    form.set("images", new Blob([new Uint8Array(selfieJpeg)], { type: "image/jpeg" }), "selfie.jpg");
    const upload = await this.fetchImpl(`${FACECHECK_BASE}/api/upload_pic`, {
      method: "POST",
      headers: this.headers(),
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    // Never put the token, the image or the reply body into an error message.
    if (!upload.ok) throw new Error(`FaceCheck upload answered with status ${upload.status}`);
    const uploaded = (await upload.json()) as UploadReply;
    if (uploaded.error || !uploaded.id_search) throw new Error("FaceCheck did not accept the picture");

    const body = JSON.stringify({
      id_search: uploaded.id_search,
      with_progress: true,
      status_only: false,
      demo: this.demo,
    });
    for (let waited = 0; waited <= MAX_WAIT_MS; waited += POLL_MS) {
      const res = await this.fetchImpl(`${FACECHECK_BASE}/api/search`, {
        method: "POST",
        headers: { ...this.headers(), "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`FaceCheck search answered with status ${res.status}`);
      const reply = (await res.json()) as SearchReply;
      if (reply.error) throw new Error("FaceCheck could not finish the search");
      if (reply.output) {
        return (reply.output.items ?? [])
          .filter((item) => typeof item.url === "string" && typeof item.score === "number")
          .map((item) => ({
            pageUrl: item.url as string,
            score: item.score as number,
            thumbnail: decodeThumbnail(item.base64),
          }));
      }
      await this.sleep(POLL_MS);
    }
    throw new Error("FaceCheck took too long");
  }
}
