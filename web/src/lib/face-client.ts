// The ONLY code that talks to the face service. The browser never can:
// the service needs a secret that only this server knows.

import { config } from "@/lib/config";

export type Challenge = "turn_left" | "turn_right" | "open_mouth" | "smile";

export interface ChallengeView {
  session_id: string;
  step: number;
  total: number;
  challenge: Challenge;
  seconds: number;
}

export type StepResult =
  | ({ result: "next" } & ChallengeView)
  | { result: "passed" }
  | { result: "failed"; reason: string };

export interface FaceClient {
  startLiveness(accountId: string): Promise<ChallengeView>;
  stepLiveness(sessionId: string, accountId: string, frames: Blob[]): Promise<StepResult | null>;
  fetchReference(sessionId: string, accountId: string): Promise<Buffer | null>;
  forgetAccount(accountId: string): Promise<void>;
}

function headers(): Record<string, string> {
  return { "x-face-secret": config.faceServiceSecret };
}

function url(pathname: string): string {
  return `${config.faceServiceUrl}${pathname}`;
}

export const faceClient: FaceClient = {
  async startLiveness(accountId) {
    const res = await fetch(url("/liveness/start"), {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ account_id: accountId }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`face service error ${res.status}`);
    return (await res.json()) as ChallengeView;
  },

  async stepLiveness(sessionId, accountId, frames) {
    const form = new FormData();
    form.set("account_id", accountId);
    frames.forEach((frame, i) => form.append("frames", frame, `${i}.jpg`));
    const res = await fetch(url(`/liveness/${encodeURIComponent(sessionId)}/step`), {
      method: "POST",
      headers: headers(),
      body: form,
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`face service error ${res.status}`);
    return (await res.json()) as StepResult;
  },

  async fetchReference(sessionId, accountId) {
    const res = await fetch(
      url(`/liveness/${encodeURIComponent(sessionId)}/reference?account_id=${encodeURIComponent(accountId)}`),
      { headers: headers(), cache: "no-store" },
    );
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  },

  async forgetAccount(accountId) {
    await fetch(url(`/liveness/account/${encodeURIComponent(accountId)}`), {
      method: "DELETE",
      headers: headers(),
      cache: "no-store",
    });
  },
};

/** True when the face service answers. */
export async function faceServiceHealthy(): Promise<boolean> {
  try {
    const res = await fetch(url("/health"), {
      headers: headers(),
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}
