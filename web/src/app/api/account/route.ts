import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createAccount } from "@/lib/account";
import { deleteAccount } from "@/lib/delete-account";
import { faceClient } from "@/lib/face-client";
import { getCurrentAccount } from "@/lib/session";
import { storage } from "@/lib/storage";

/** Create the anonymous account for this browser (does nothing if one exists). */
export async function POST() {
  const existing = await getCurrentAccount();
  if (existing) return NextResponse.json({ created: false });

  const { token } = await createAccount();
  const res = NextResponse.json({ created: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}

/** Delete my account: wipes every photo, result and record right away. */
export async function DELETE() {
  const account = await getCurrentAccount();
  if (!account) return NextResponse.json({ ok: true });
  await deleteAccount(account.id, { storage: storage(), face: faceClient });
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
