import { NextResponse } from "next/server";
import { readFaceThumb } from "@/lib/face-search/service";
import { sniffImageType } from "@/lib/photos";
import { getCurrentAccount } from "@/lib/session";
import { storage } from "@/lib/storage";

type Context = { params: Promise<{ id: string }> };

/** A face-search result thumbnail, shown to its owner only. */
export async function GET(_request: Request, context: Context) {
  const account = await getCurrentAccount();
  if (!account) return new NextResponse(null, { status: 401 });
  const { id } = await context.params;
  const bytes = await readFaceThumb(account.id, id, storage());
  if (!bytes) return new NextResponse(null, { status: 404 });
  const type = sniffImageType(bytes) ?? (bytes.subarray(0, 4).toString() === "<svg" ? "image/svg+xml" : null);
  if (!type) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": type,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
