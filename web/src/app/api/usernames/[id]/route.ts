import { NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/session";
import { politeClient } from "@/lib/usernames/outbound";
import { recheckUsername, removeUsername } from "@/lib/usernames/service";

type Context = { params: Promise<{ id: string }> };

/** Check this handle again (at most once an hour). */
export async function POST(_request: Request, context: Context) {
  const account = await getCurrentAccount();
  if (!account) return NextResponse.json({ error: "no_account" }, { status: 401 });
  if (!account.consentedAt) return NextResponse.json({ ok: false, reason: "consent_required" }, { status: 403 });
  const { id } = await context.params;
  const outcome = await recheckUsername(account.id, id, politeClient());
  const status = outcome.ok ? 200 : outcome.reason === "too_soon" ? 429 : 404;
  return NextResponse.json(outcome, { status });
}

export async function DELETE(_request: Request, context: Context) {
  const account = await getCurrentAccount();
  if (!account) return NextResponse.json({ error: "no_account" }, { status: 401 });
  const { id } = await context.params;
  const ok = await removeUsername(account.id, id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
