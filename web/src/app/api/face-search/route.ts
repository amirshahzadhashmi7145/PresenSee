import { NextResponse } from "next/server";
import { getFaceSearchProvider } from "@/lib/face-search";
import { recordFaceSearchConsent, runFaceSearch } from "@/lib/face-search/service";
import { getCurrentAccount } from "@/lib/session";
import { storage } from "@/lib/storage";

const STATUS: Record<string, number> = {
  consent_required: 403,
  face_consent_required: 403,
  live_check_required: 403,
  selfie_not_available: 409,
  daily_limit: 429,
  provider_error: 502,
};

/** Search the web for the live-verified person's own face. Takes NO image:
 *  the server uses the selfie it saved itself when the live check passed. */
export async function POST(request: Request) {
  let account = await getCurrentAccount();
  if (!account) return NextResponse.json({ error: "no_account" }, { status: 401 });
  const provider = getFaceSearchProvider();
  if (!provider) return NextResponse.json({ ok: false, reason: "feature_off" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { agree?: unknown } | null;
  if (!account.faceSearchConsentedAt && account.consentedAt && body?.agree === true) {
    account = await recordFaceSearchConsent(account.id);
  }
  try {
    const outcome = await runFaceSearch(account, { provider, storage: storage() });
    return NextResponse.json(outcome, { status: outcome.ok ? 200 : (STATUS[outcome.reason] ?? 422) });
  } catch (error) {
    console.error("face search error:", error instanceof Error ? error.message.slice(0, 300) : "unknown");
    return NextResponse.json({ ok: false, reason: "server_error" }, { status: 503 });
  }
}
