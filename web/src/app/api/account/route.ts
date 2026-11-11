import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createAccount } from "@/lib/account";
import { getCurrentAccount } from "@/lib/session";

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
