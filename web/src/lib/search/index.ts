import { config } from "@/lib/config";
import { MockProvider } from "./mock-provider";
import type { ReverseImageSearchProvider } from "./provider";

/** Pick the provider from IMAGE_SEARCH_PROVIDER. */
export function getSearchProvider(): ReverseImageSearchProvider {
  const name = config.imageSearchProvider;
  if (name === "mock") return new MockProvider();
  if (name === "tineye") throw new Error("The TinEye provider is not built yet (step 6).");
  throw new Error(`Unknown IMAGE_SEARCH_PROVIDER: ${name}`);
}
