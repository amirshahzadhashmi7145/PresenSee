import { NextResponse } from "next/server";
import { deletePhoto, readPhoto } from "@/lib/photos";
import { getCurrentAccount } from "@/lib/session";
import { storage } from "@/lib/storage";

type Context = { params: Promise<{ id: string }> };

/** Show a photo to its owner only. */
export async function GET(_request: Request, context: Context) {
  const account = await getCurrentAccount();
  if (!account) return new NextResponse(null, { status: 401 });
  const { id } = await context.params;
  const photo = await readPhoto(account.id, id, storage());
  if (!photo) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(photo.bytes), {
    headers: {
      "content-type": photo.mimeType,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function DELETE(_request: Request, context: Context) {
  const account = await getCurrentAccount();
  if (!account) return NextResponse.json({ error: "no_account" }, { status: 401 });
  const { id } = await context.params;
  const deleted = await deletePhoto(account.id, id, storage());
  return NextResponse.json({ ok: deleted }, { status: deleted ? 200 : 404 });
}
