import { NextResponse } from "next/server";
import { TAGS, type TagName } from "@/lib/search/service";
import { getCurrentAccount } from "@/lib/session";
import { tagProfileCheck } from "@/lib/usernames/service";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const account = await getCurrentAccount();
  if (!account) return NextResponse.json({ error: "no_account" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { tag?: string } | null;
  const tag = body?.tag;
  if (!tag || !(TAGS as readonly string[]).includes(tag)) {
    return NextResponse.json({ ok: false, reason: "bad_tag" }, { status: 400 });
  }
  const { id } = await context.params;
  const ok = await tagProfileCheck(account.id, id, tag as TagName);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
