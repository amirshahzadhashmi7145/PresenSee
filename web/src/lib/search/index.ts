import { config } from "@/lib/config";
import { GoogleVisionProvider } from "./google-vision-provider";
import { MockProvider } from "./mock-provider";
import type { ReverseImageSearchProvider } from "./provider";
import { TinEyeProvider } from "./tineye-provider";

/** Pick the provider from IMAGE_SEARCH_PROVIDER. */
export function getSearchProvider(): ReverseImageSearchProvider {
  const name = config.imageSearchProvider;
  if (name === "mock") return new MockProvider();
  if (name === "google") return new GoogleVisionProvider(config.googleVisionApiKey);
  if (name === "tineye") return new TinEyeProvider(config.tineyeApiKey);
  throw new Error(`Unknown IMAGE_SEARCH_PROVIDER: ${name}`);
}
