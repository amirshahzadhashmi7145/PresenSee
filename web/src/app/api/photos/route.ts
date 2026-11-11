import { NextResponse } from "next/server";
import { livenessDeps } from "@/lib/liveness-deps";
import { MAX_PHOTO_BYTES, uploadPhoto } from "@/lib/photos";
import { getCurrentAccount } from "@/lib/session";

const STATUS: Record<string, number> = {
  consent_required: 403,
  live_check_required: 403,
  photo_limit: 409,
  too_big: 413,
};

export async function POST(request: Request) {
  const account = await getCurrentAccount();
  if (!account) return NextResponse.json({ error: "no_account" }, { status: 401 });
  // Checked before the photo is even read from the request.
  if (!account.consentedAt) return NextResponse.json({ ok: false, reason: "consent_required" }, { status: 403 });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_PHOTO_BYTES + 100_000) {
    return NextResponse.json({ ok: false, reason: "too_big" }, { status: 413 });
  }
  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("photo");
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  if (!(file instanceof Blob)) return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  if (file.size > MAX_PHOTO_BYTES) return NextResponse.json({ ok: false, reason: "too_big" }, { status: 413 });

  try {
    const outcome = await uploadPhoto(account, Buffer.from(await file.arrayBuffer()), livenessDeps());
    return NextResponse.json(outcome, { status: outcome.ok ? 200 : (STATUS[outcome.reason] ?? 422) });
  } catch (error) {
    console.error("photo upload error:", error instanceof Error ? error.message.slice(0, 300) : "unknown");
    return NextResponse.json({ ok: false, reason: "server_error" }, { status: 503 });
  }
}
