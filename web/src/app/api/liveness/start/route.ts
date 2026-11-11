import { NextResponse } from "next/server";
import { ConsentRequired, startLiveCheck } from "@/lib/liveness";
import { livenessDeps } from "@/lib/liveness-deps";
import { getCurrentAccount } from "@/lib/session";

export async function POST() {
  const account = await getCurrentAccount();
  if (!account) return NextResponse.json({ error: "no_account" }, { status: 401 });
  try {
    return NextResponse.json(await startLiveCheck(account, livenessDeps()));
  } catch (error) {
    if (error instanceof ConsentRequired) {
      return NextResponse.json({ error: "consent_required" }, { status: 403 });
    }
    // Log the kind of error only, never request data.
    console.error("live check error:", error instanceof Error ? error.message.slice(0, 300) : "unknown");
    return NextResponse.json({ error: "face_service_unavailable" }, { status: 503 });
  }
}
