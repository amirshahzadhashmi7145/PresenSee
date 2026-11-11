import { NextResponse } from "next/server";
import { recordConsent } from "@/lib/liveness";
import { getCurrentAccount } from "@/lib/session";

export async function POST() {
  const account = await getCurrentAccount();
  if (!account) return NextResponse.json({ error: "no_account" }, { status: 401 });
  if (!account.consentedAt) await recordConsent(account.id);
  return NextResponse.json({ ok: true });
}
