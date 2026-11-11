import { config } from "@/lib/config";
import { faceClient } from "@/lib/face-client";
import type { LivenessDeps } from "@/lib/liveness";
import { storage } from "@/lib/storage";

export function livenessDeps(): LivenessDeps {
  return { face: faceClient, storage: storage(), selfieStore: config.selfieStore };
}
