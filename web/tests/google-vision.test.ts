import { describe, expect, it } from "vitest";
import { GOOGLE_VISION_URL, GoogleVisionProvider } from "@/lib/search/google-vision-provider";

// Shape from Google's Web Detection docs, with made-up addresses.
const REPLY = {
  responses: [
    {
      webDetection: {
        webEntities: [{ entityId: "/m/x", score: 1.2, description: "Some Person Name" }],
        bestGuessLabels: [{ label: "some person name" }],
        visuallySimilarImages: [{ url: "https://lookalike.test/other-person.jpg" }],
        fullMatchingImages: [{ url: "https://cdn.test/copy.jpg" }],
        pagesWithMatchingImages: [
          { url: "https://www.site-a.test/profile/fake", pageTitle: "<b>Fake</b>", fullMatchingImages: [{ url: "https://cdn.site-a.test/1.jpg" }] },
          { url: "https://site-b.test/post/9", partialMatchingImages: [{ url: "https://site-b.test/crop.jpg" }] },
          { pageTitle: "no address" },
        ],
      },
    },
  ],
};

function fakeFetch(status = 200, body: unknown = REPLY) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, impl };
}

const IMAGE = { bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7]), mimeType: "image/jpeg" };

describe("Google Vision provider", () => {
  it("calls only the official endpoint, with the key in a header and never in the address", async () => {
    const { calls, impl } = fakeFetch();
    await new GoogleVisionProvider("test-key-not-real", impl).search(IMAGE);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(GOOGLE_VISION_URL);
    expect(GOOGLE_VISION_URL).toBe("https://vision.googleapis.com/v1/images:annotate");
    expect(new Headers(calls[0].init.headers).get("x-goog-api-key")).toBe("test-key-not-real");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.requests[0].image.content).toBe(IMAGE.bytes.toString("base64"));
    expect(body.requests[0].features).toEqual([{ type: "WEB_DETECTION", maxResults: 50 }]);
  });

  it("returns only pages that hold a copy of the photo", async () => {
    const { impl } = fakeFetch();
    const results = await new GoogleVisionProvider("k", impl).search(IMAGE);
    expect(results).toEqual([
      { pageUrl: "https://www.site-a.test/profile/fake", siteName: "site-a.test", thumbnailUrl: "https://cdn.site-a.test/1.jpg", score: 100 },
      { pageUrl: "https://site-b.test/post/9", siteName: "site-b.test", thumbnailUrl: "https://site-b.test/crop.jpg", score: 70 },
    ]);
  });

  it("ignores look-alike images and never passes on a guessed name of the person", async () => {
    const { impl } = fakeFetch();
    const text = JSON.stringify(await new GoogleVisionProvider("k", impl).search(IMAGE));
    expect(text).not.toContain("lookalike.test");
    expect(text.toLowerCase()).not.toContain("some person name");
  });

  it("handles a reply with nothing found", async () => {
    const { impl } = fakeFetch(200, { responses: [{}] });
    expect(await new GoogleVisionProvider("k", impl).search(IMAGE)).toEqual([]);
  });

  it("errors never leak the key or the reply", async () => {
    const denied = fakeFetch(403, { error: { message: "key super-secret-key blocked" } });
    const a = await new GoogleVisionProvider("super-secret-key", denied.impl).search(IMAGE).catch((e: Error) => e);
    expect((a as Error).message).toBe("Google Vision answered with status 403");
    const bad = fakeFetch(200, { responses: [{ error: { message: "bad image detail" } }] });
    const b = await new GoogleVisionProvider("k", bad.impl).search(IMAGE).catch((e: Error) => e);
    expect((b as Error).message).toBe("Google Vision could not process the image");
  });

  it("refuses to start without a key, and caps itself under the free allowance", () => {
    expect(() => new GoogleVisionProvider("")).toThrow(/GOOGLE_VISION_API_KEY/);
    expect(new GoogleVisionProvider("k").monthlyLimit).toBeLessThan(1000);
  });
});
