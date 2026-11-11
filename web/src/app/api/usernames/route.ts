import { NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/session";
import { politeClient } from "@/lib/usernames/outbound";
import { addUsername } from "@/lib/usernames/service";

const STATUS: Record<string, number> = { consent_required: 403, bad_handle: 400, already_added: 409, username_limit: 409 };

export async function POST(request: Request) {
  const account = await getCurrentAccount();
  if (!account) return NextResponse.json({ error: "no_account" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { handle?: unknown } | null;
  if (typeof body?.handle !== "string") return NextResponse.json({ ok: false, reason: "bad_handle" }, { status: 400 });
  try {
    const outcome = await addUsername(account, body.handle, politeClient());
    return NextResponse.json(outcome, { status: outcome.ok ? 200 : (STATUS[outcome.reason] ?? 422) });
  } catch (error) {
    console.error("username check error:", error instanceof Error ? error.message.slice(0, 300) : "unknown");
    return NextResponse.json({ ok: false, reason: "server_error" }, { status: 503 });
  }
}
