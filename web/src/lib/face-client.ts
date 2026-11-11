import { config } from "@/lib/config";

/** True when the face service answers. Only the web server ever calls it. */
export async function faceServiceHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${config.faceServiceUrl}/health`, {
      headers: { "x-face-secret": config.faceServiceSecret },
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}
