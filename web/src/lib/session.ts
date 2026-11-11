import { cookies } from "next/headers";
import { SESSION_COOKIE, findAccountByToken } from "@/lib/account";

/** The account for the current browser, or null if it has none yet. */
export async function getCurrentAccount() {
  const jar = await cookies();
  return findAccountByToken(jar.get(SESSION_COOKIE)?.value);
}
