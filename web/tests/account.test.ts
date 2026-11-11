import { afterAll, describe, expect, it } from "vitest";
import { createAccount, findAccountByToken, hashToken, newToken } from "@/lib/account";
import { db } from "@/lib/db";

const created: string[] = [];

afterAll(async () => {
  await db.account.deleteMany({ where: { id: { in: created } } });
  await db.$disconnect();
});

describe("anonymous account", () => {
  it("makes long random tokens that differ every time", () => {
    const a = newToken();
    const b = newToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
  });

  it("stores only a hash of the token, never the token", async () => {
    const { account, token } = await createAccount();
    created.push(account.id);
    expect(account.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(account)).not.toContain(token);
  });

  it("finds the account by its token and nothing by a wrong token", async () => {
    const { account, token } = await createAccount();
    created.push(account.id);
    expect((await findAccountByToken(token))?.id).toBe(account.id);
    expect(await findAccountByToken(newToken())).toBeNull();
    expect(await findAccountByToken(undefined)).toBeNull();
  });

  it("keeps two browsers as two separate accounts", async () => {
    const first = await createAccount();
    const second = await createAccount();
    created.push(first.account.id, second.account.id);
    expect(first.account.id).not.toBe(second.account.id);
    expect((await findAccountByToken(first.token))?.id).toBe(first.account.id);
    expect((await findAccountByToken(second.token))?.id).toBe(second.account.id);
  });
});
