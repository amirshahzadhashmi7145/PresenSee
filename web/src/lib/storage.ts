// Encrypted file storage. Every file is encrypted with AES-256-GCM before it
// reaches the disk. There is deliberately no way to save a file unencrypted.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";

const MAGIC = Buffer.from("PSE1");
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface Keyring {
  activeKeyId: string;
  key(keyId: string): Buffer;
}

export const envKeyring: Keyring = {
  get activeKeyId() {
    return config.photoEncActiveKeyId;
  },
  key: (keyId) => config.photoEncKey(keyId),
};

/** Encrypt bytes for one storage key. The key name is bound into the result,
 *  so a file copied to another name or account cannot be opened. */
export function seal(plain: Buffer, storageKey: string, keyring: Keyring): Buffer {
  const keyId = Buffer.from(keyring.activeKeyId, "ascii");
  const iv = randomBytes(IV_BYTES);
  const header = Buffer.concat([MAGIC, Buffer.from([keyId.length]), keyId, iv]);
  const cipher = createCipheriv("aes-256-gcm", keyring.key(keyring.activeKeyId), iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(Buffer.concat([header, Buffer.from(storageKey, "utf8")]));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([header, cipher.getAuthTag(), body]);
}

/** Decrypt, or throw if the file was changed, moved or is not ours. */
export function open(blob: Buffer, storageKey: string, keyring: Keyring): Buffer {
  if (blob.length < MAGIC.length + 1 || !blob.subarray(0, 4).equals(MAGIC)) {
    throw new Error("Not an encrypted PresenSee file");
  }
  const keyIdLength = blob[4];
  const headerEnd = 5 + keyIdLength + IV_BYTES;
  if (blob.length < headerEnd + TAG_BYTES) throw new Error("Encrypted file is cut short");
  const keyId = blob.subarray(5, 5 + keyIdLength).toString("ascii");
  const iv = blob.subarray(5 + keyIdLength, headerEnd);
  const header = blob.subarray(0, headerEnd);
  const tag = blob.subarray(headerEnd, headerEnd + TAG_BYTES);
  const body = blob.subarray(headerEnd + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", keyring.key(keyId), iv, {
    authTagLength: TAG_BYTES,
  });
  decipher.setAAD(Buffer.concat([header, Buffer.from(storageKey, "utf8")]));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

export interface PhotoStorage {
  put(storageKey: string, plain: Buffer): Promise<void>;
  get(storageKey: string): Promise<Buffer | null>;
  delete(storageKey: string): Promise<void>;
  /** Delete everything under a prefix such as "accounts/<id>". */
  deletePrefix(prefix: string): Promise<void>;
}

function safeKey(storageKey: string): string {
  if (!/^[a-zA-Z0-9_\-/]+$/.test(storageKey) || storageKey.includes("//") || storageKey.startsWith("/")) {
    throw new Error("Bad storage key");
  }
  return storageKey;
}

/** Local disk for development. An S3-compatible class can replace it later. */
export class LocalDiskStorage implements PhotoStorage {
  constructor(
    private readonly dir: string,
    private readonly keyring: Keyring = envKeyring,
  ) {}

  private file(storageKey: string): string {
    return path.join(this.dir, `${safeKey(storageKey)}.enc`);
  }

  async put(storageKey: string, plain: Buffer): Promise<void> {
    const file = this.file(storageKey);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, seal(plain, storageKey, this.keyring), { mode: 0o600 });
  }

  async get(storageKey: string): Promise<Buffer | null> {
    let blob: Buffer;
    try {
      blob = await readFile(this.file(storageKey));
    } catch {
      return null;
    }
    return open(blob, storageKey, this.keyring);
  }

  async delete(storageKey: string): Promise<void> {
    await rm(this.file(storageKey), { force: true });
  }

  async deletePrefix(prefix: string): Promise<void> {
    await rm(path.join(this.dir, safeKey(prefix)), { recursive: true, force: true });
  }
}

let shared: PhotoStorage | undefined;
export function storage(): PhotoStorage {
  shared ??= new LocalDiskStorage(path.resolve(config.storageDir));
  return shared;
}

export const selfieKey = (accountId: string) => `accounts/${accountId}/selfie`;
