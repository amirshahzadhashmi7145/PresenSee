import { NextResponse } from "next/server";
import { getSearchProvider } from "@/lib/search";
import { runSearch } from "@/lib/search/service";
import { getCurrentAccount } from "@/lib/session";
import { storage } from "@/lib/storage";

const STATUS: Record<string, number> = {
  consent_required: 403,
  photo_not_found: 404,
  daily_limit: 429,
  provider_error: 502,
};

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const account = await getCurrentAccount();
  if (!account) return NextResponse.json({ error: "no_account" }, { status: 401 });
  const { id } = await context.params;
  try {
    const outcome = await runSearch(account, id, { provider: getSearchProvider(), storage: storage() });
    return NextResponse.json(outcome, { status: outcome.ok ? 200 : (STATUS[outcome.reason] ?? 422) });
  } catch (error) {
    console.error("search error:", error instanceof Error ? error.message.slice(0, 300) : "unknown");
    return NextResponse.json({ ok: false, reason: "server_error" }, { status: 503 });
  }
}
