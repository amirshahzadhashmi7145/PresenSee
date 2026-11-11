import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createAccount } from "@/lib/account";
import { db } from "@/lib/db";
import type { ChallengeView, FaceClient, StepResult } from "@/lib/face-client";
import {
  ConsentRequired,
  type LivenessDeps,
  NotFound,
  currentPassedCheck,
  recordConsent,
  startLiveCheck,
  submitLiveStep,
} from "@/lib/liveness";
import type { PhotoStorage } from "@/lib/storage";

const created: string[] = [];
afterAll(async () => {
  await db.account.deleteMany({ where: { id: { in: created } } });
  await db.$disconnect();
});

let counter = 0;
class FakeFace implements FaceClient {
  calls: string[] = [];
  nextStep: StepResult | null = { result: "passed" };
  async startLiveness(): Promise<ChallengeView> {
    this.calls.push("start");
    counter += 1;
    return { session_id: `test-session-${Date.now()}-${counter}`, step: 1, total: 3, challenge: "smile", seconds: 20 };
  }
  async stepLiveness(): Promise<StepResult | null> {
    this.calls.push("step");
    return this.nextStep;
  }
  async fetchReference(): Promise<Buffer | null> {
    this.calls.push("reference");
    return Buffer.from("pretend selfie");
  }
  async forgetAccount(): Promise<void> {
    this.calls.push("forget");
  }
}

class FakeStorage implements PhotoStorage {
  files = new Map<string, Buffer>();
  async put(key: string, plain: Buffer) {
    this.files.set(key, plain);
  }
  async get(key: string) {
    return this.files.get(key) ?? null;
  }
  async delete(key: string) {
    this.files.delete(key);
  }
  async deletePrefix(prefix: string) {
    for (const key of this.files.keys()) if (key.startsWith(prefix)) this.files.delete(key);
  }
}

let face: FakeFace;
let store: FakeStorage;
const deps = (selfieStore = "memory"): LivenessDeps => ({ face, storage: store, selfieStore });
const frames = () => Array.from({ length: 10 }, () => new Blob(["frame"], { type: "image/jpeg" }));

async function newAccount(consented: boolean) {
  const { account } = await createAccount();
  created.push(account.id);
  return consented ? recordConsent(account.id) : account;
}

beforeEach(() => {
  face = new FakeFace();
  store = new FakeStorage();
});

describe("hard rule: nothing before consent", () => {
  it("refuses to start a live check and never calls the face service", async () => {
    const account = await newAccount(false);
    await expect(startLiveCheck(account, deps())).rejects.toBeInstanceOf(ConsentRequired);
    expect(face.calls).toEqual([]);
  });

  it("refuses camera frames and never calls the face service", async () => {
    const account = await newAccount(false);
    await expect(submitLiveStep(account, "any", frames(), deps())).rejects.toBeInstanceOf(ConsentRequired);
    expect(face.calls).toEqual([]);
  });
});

describe("live check on the server", () => {
  it("a pass is recorded by the server and stays valid for a while", async () => {
    const account = await newAccount(true);
    const view = await startLiveCheck(account, deps());
    expect(await currentPassedCheck(account.id)).toBeNull();
    const result = await submitLiveStep(account, view.session_id, frames(), deps());
    expect(result.result).toBe("passed");
    expect((await currentPassedCheck(account.id))?.id).toBe(view.session_id);
    const later = new Date(Date.now() + 16 * 60 * 1000);
    expect(await currentPassedCheck(account.id, later)).toBeNull();
  });

  it("a failed check is recorded as failed and cannot be continued", async () => {
    const account = await newAccount(true);
    const view = await startLiveCheck(account, deps());
    face.nextStep = { result: "failed", reason: "move_not_seen" };
    expect((await submitLiveStep(account, view.session_id, frames(), deps())).result).toBe("failed");
    expect(await currentPassedCheck(account.id)).toBeNull();
    await expect(submitLiveStep(account, view.session_id, frames(), deps())).rejects.toBeInstanceOf(NotFound);
  });

  it("one account cannot use another account's live check", async () => {
    const mine = await newAccount(true);
    const other = await newAccount(true);
    const view = await startLiveCheck(mine, deps());
    face.calls = [];
    await expect(submitLiveStep(other, view.session_id, frames(), deps())).rejects.toBeInstanceOf(NotFound);
    expect(face.calls).toEqual([]);
    expect(await currentPassedCheck(other.id)).toBeNull();
  });

  it("too many or too large frames are refused before reaching the face service", async () => {
    const account = await newAccount(true);
    const view = await startLiveCheck(account, deps());
    face.calls = [];
    const many = Array.from({ length: 41 }, () => new Blob(["x"]));
    expect((await submitLiveStep(account, view.session_id, many, deps())).result).toBe("failed");
    const big = [new Blob([new Uint8Array(300_001)])];
    expect((await submitLiveStep(account, view.session_id, big, deps())).result).toBe("failed");
    expect(face.calls).toEqual([]);
  });
});

describe("where the reference selfie goes", () => {
  it("memory mode: the web server never fetches or stores the selfie", async () => {
    const account = await newAccount(true);
    const view = await startLiveCheck(account, deps("memory"));
    await submitLiveStep(account, view.session_id, frames(), deps("memory"));
    expect(face.calls).not.toContain("reference");
    expect(store.files.size).toBe(0);
  });

  it("disk mode (testing): one selfie is stored, under this account only", async () => {
    const account = await newAccount(true);
    const view = await startLiveCheck(account, deps("disk"));
    await submitLiveStep(account, view.session_id, frames(), deps("disk"));
    expect([...store.files.keys()]).toEqual([`accounts/${account.id}/selfie`]);
  });

  it("the database row of a live check holds no image or face data", async () => {
    const account = await newAccount(true);
    const view = await startLiveCheck(account, deps("disk"));
    await submitLiveStep(account, view.session_id, frames(), deps("disk"));
    const row = await db.livenessSession.findUniqueOrThrow({ where: { id: view.session_id } });
    expect(Object.keys(row).sort()).toEqual(["accountId", "createdAt", "expiresAt", "id", "passedAt", "status"]);
  });
});
