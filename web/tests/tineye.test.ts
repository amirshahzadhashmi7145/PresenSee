import { describe, expect, it } from "vitest";
import { TINEYE_SEARCH_URL, TinEyeProvider } from "@/lib/search/tineye-provider";

// Shape copied from a real reply of TinEye's sandbox (2026-11-11), with made-up addresses.
const REPLY = {
  code: 200,
  messages: [],
  stats: { total_results: 2 },
  results: {
    matches: [
      {
        score: 100,
        domain: "example.test",
        image_url: "https://img.tineye.com/result/abc-71",
        backlinks: [
          { backlink: "https://www.example.test/thread/1", crawl_date: "2024-02-13", url: "https://example.test/i/1.jpg" },
          { backlink: "https://www.example.test/thread/2", url: "https://example.test/i/2.jpg" },
        ],
      },
      { score: 40, domain: "other.test", image_url: "https://img.tineye.com/result/def-71", backlinks: [] },
    ],
  },
};

function fakeFetch(status = 200, body: unknown = REPLY) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, impl };
}

const IMAGE = { bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), mimeType: "image/jpeg" };

describe("TinEye provider", () => {
  it("calls only the official search endpoint, with the key in the X-API-KEY header", async () => {
    const { calls, impl } = fakeFetch();
    await new TinEyeProvider("test-key-not-real", impl).search(IMAGE);
    expect(calls).toHaveLength(1);
    expect(calls[0].url.startsWith(`${TINEYE_SEARCH_URL}?`)).toBe(true);
    expect(TINEYE_SEARCH_URL).toBe("https://api.tineye.com/rest/search/");
    expect(calls[0].url).not.toContain("test-key-not-real"); // never in the address
    expect(calls[0].init.method).toBe("POST");
    expect(new Headers(calls[0].init.headers).get("x-api-key")).toBe("test-key-not-real");
    const form = calls[0].init.body as FormData;
    const upload = form.get("image_upload") as File;
    expect(Buffer.from(await upload.arrayBuffer()).equals(IMAGE.bytes)).toBe(true);
  });

  it("turns each page where the photo appears into one result", async () => {
    const { impl } = fakeFetch();
    const results = await new TinEyeProvider("k", impl).search(IMAGE);
    expect(results).toEqual([
      {
        pageUrl: "https://www.example.test/thread/1",
        siteName: "example.test",
        thumbnailUrl: "https://img.tineye.com/result/abc-71",
        foundDate: new Date("2024-02-13T00:00:00Z"),
        score: 100,
      },
      {
        pageUrl: "https://www.example.test/thread/2",
        siteName: "example.test",
        thumbnailUrl: "https://img.tineye.com/result/abc-71",
        foundDate: undefined,
        score: 100,
      },
    ]);
  });

  it("handles an empty reply", async () => {
    const { impl } = fakeFetch(200, { code: 200, results: { matches: [] } });
    expect(await new TinEyeProvider("k", impl).search(IMAGE)).toEqual([]);
  });

  it("an error from TinEye never leaks the key or the reply into the message", async () => {
    const { impl } = fakeFetch(401, { messages: ["bad key secret-detail"] });
    const error = await new TinEyeProvider("super-secret-key", impl).search(IMAGE).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("TinEye answered with status 401");
  });

  it("refuses to start without a key", () => {
    expect(() => new TinEyeProvider("")).toThrow(/TINEYE_API_KEY/);
  });
});
