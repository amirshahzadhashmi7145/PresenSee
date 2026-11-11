import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Keyring, LocalDiskStorage, open, seal } from "@/lib/storage";

const keys: Record<string, Buffer> = { K1: randomBytes(32), K2: randomBytes(32) };
const keyring: Keyring = { activeKeyId: "K1", key: (id) => keys[id] };
// Starts like a real JPEG so we can prove the stored file does not.
const photo = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("JFIF pretend photo bytes ".repeat(40))]);

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "presensee-storage-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("hard rule: stored photos are encrypted", () => {
  it("the file on disk is not a readable image and has none of the photo's bytes", async () => {
    const store = new LocalDiskStorage(dir, keyring);
    await store.put("accounts/a1/photo1", photo);
    const onDisk = await readFile(path.join(dir, "accounts/a1/photo1.enc"));
    expect(onDisk.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(false);
    expect(onDisk.includes(Buffer.from("JFIF pretend photo"))).toBe(false);
    expect(onDisk.subarray(0, 4).toString()).toBe("PSE1");
  });

  it("gives back exactly the original bytes", async () => {
    const store = new LocalDiskStorage(dir, keyring);
    await store.put("accounts/a1/photo2", photo);
    expect((await store.get("accounts/a1/photo2"))?.equals(photo)).toBe(true);
  });

  it("encrypts the same photo differently every time", () => {
    expect(seal(photo, "k", keyring).equals(seal(photo, "k", keyring))).toBe(false);
  });

  it("refuses a file that was changed", async () => {
    const store = new LocalDiskStorage(dir, keyring);
    await store.put("accounts/a1/photo3", photo);
    const file = path.join(dir, "accounts/a1/photo3.enc");
    const blob = await readFile(file);
    blob[blob.length - 1] ^= 1;
    await writeFile(file, blob);
    await expect(store.get("accounts/a1/photo3")).rejects.toThrow();
  });

  it("refuses a file copied to another account or name", () => {
    const blob = seal(photo, "accounts/a1/photo", keyring);
    expect(open(blob, "accounts/a1/photo", keyring).equals(photo)).toBe(true);
    expect(() => open(blob, "accounts/a2/photo", keyring)).toThrow();
  });

  it("refuses the wrong key, and still opens old files after the active key changes", () => {
    const blob = seal(photo, "k", keyring);
    const wrong: Keyring = { activeKeyId: "K1", key: () => randomBytes(32) };
    expect(() => open(blob, "k", wrong)).toThrow();
    const rotated: Keyring = { activeKeyId: "K2", key: (id) => keys[id] };
    expect(open(blob, "k", rotated).equals(photo)).toBe(true);
  });

  it("deletes one file, and everything of one account", async () => {
    const store = new LocalDiskStorage(dir, keyring);
    await store.put("accounts/a9/one", photo);
    await store.put("accounts/a9/two", photo);
    await store.delete("accounts/a9/one");
    expect(await store.get("accounts/a9/one")).toBeNull();
    await store.deletePrefix("accounts/a9");
    expect(await store.get("accounts/a9/two")).toBeNull();
    expect((await readdir(path.join(dir, "accounts"))).includes("a9")).toBe(false);
  });

  it("refuses storage names that could escape the storage folder", async () => {
    const store = new LocalDiskStorage(dir, keyring);
    await expect(store.put("../outside", photo)).rejects.toThrow();
    await expect(store.put("/etc/x", photo)).rejects.toThrow();
  });
});
