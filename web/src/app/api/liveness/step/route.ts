import { NextResponse } from "next/server";
import { ConsentRequired, NotFound, submitLiveStep } from "@/lib/liveness";
import { livenessDeps } from "@/lib/liveness-deps";
import { getCurrentAccount } from "@/lib/session";

export async function POST(request: Request) {
  const account = await getCurrentAccount();
  if (!account) return NextResponse.json({ error: "no_account" }, { status: 401 });
  // Consent is checked before the request body (the camera frames) is even read.
  if (!account.consentedAt) return NextResponse.json({ error: "consent_required" }, { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const sessionId = form.get("sessionId");
  const frames = form.getAll("frames").filter((item): item is File => item instanceof Blob);
  if (typeof sessionId !== "string" || frames.length === 0) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    return NextResponse.json(await submitLiveStep(account, sessionId, frames, livenessDeps()));
  } catch (error) {
    if (error instanceof ConsentRequired) {
      return NextResponse.json({ error: "consent_required" }, { status: 403 });
    }
    if (error instanceof NotFound) return NextResponse.json({ error: "not_found" }, { status: 404 });
    // Log the kind of error only, never request data.
    console.error("live check error:", error instanceof Error ? error.message.slice(0, 300) : "unknown");
    return NextResponse.json({ error: "face_service_unavailable" }, { status: 503 });
  }
}
