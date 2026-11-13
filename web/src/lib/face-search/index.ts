import { config } from "@/lib/config";
import { FaceCheckProvider } from "./facecheck-provider";
import { MockFaceProvider } from "./mock-face-provider";
import type { FaceSearchProvider } from "./provider";

/** Pick the face-search provider from FACE_SEARCH_PROVIDER. null = feature off. */
export function getFaceSearchProvider(): FaceSearchProvider | null {
  const name = config.faceSearchProvider;
  if (name === "off") return null;
  if (name === "mock") return new MockFaceProvider();
  if (name === "facecheck") return new FaceCheckProvider(config.facecheckApiToken, config.facecheckDemo);
  throw new Error(`Unknown FACE_SEARCH_PROVIDER: ${name}`);
}
