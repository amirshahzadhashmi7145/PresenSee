import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");

function exampleKeys(): Set<string> {
  const text = readFileSync(path.join(root, ".env.example"), "utf8");
  return new Set(
    text
      .split("\n")
      .map((line) => /^([A-Z0-9_]+)=/.exec(line)?.[1])
      .filter((key): key is string => Boolean(key)),
  );
}

describe("hard rule: secrets live in .env only", () => {
  it("every setting the web code reads is listed in .env.example", () => {
    const source = readFileSync(path.join(root, "web/src/lib/config.ts"), "utf8");
    const used = [...source.matchAll(/(?:required|optional)\("([A-Z0-9_]+)"/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    const listed = exampleKeys();
    expect(used.filter((name) => !listed.has(name))).toEqual([]);
  });

  it(".env.example holds placeholders only, never real secrets", () => {
    const text = readFileSync(path.join(root, ".env.example"), "utf8");
    for (const key of ["POSTGRES_PASSWORD", "FACE_SERVICE_SECRET", "PHOTO_ENC_KEY_K1"]) {
      expect(text).toMatch(new RegExp(`^${key}=CHANGE_ME_`, "m"));
    }
    expect(text).toMatch(/^TINEYE_API_KEY=$/m);
  });

  it(".env is ignored by git and not tracked", () => {
    const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n");
    expect(tracked).not.toContain(".env");
    const ignored = execFileSync("git", ["check-ignore", ".env"], { cwd: root, encoding: "utf8" });
    expect(ignored.trim()).toBe(".env");
  });

  it("only config.ts reads process.env for settings", () => {
    const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "web/src"], {
      cwd: root,
      encoding: "utf8",
    })
      .split("\n")
      .filter((f) => /\.(ts|tsx)$/.test(f) && f !== "web/src/lib/config.ts")
      .filter((f) => existsSync(path.join(root, f)));
    const offenders = files.filter((f) => {
      const text = readFileSync(path.join(root, f), "utf8");
      // NODE_ENV and NEXT_RUNTIME are built-in flags, not secrets or settings of ours.
      return /process\.env(?!\.NODE_ENV|\.NEXT_RUNTIME)/.test(text);
    });
    expect(offenders).toEqual([]);
  });
});

describe("hard rule: the database never holds photos or face data", () => {
  it("the schema has no binary, vector or float-array columns", () => {
    const schema = readFileSync(path.join(root, "web/prisma/schema.prisma"), "utf8");
    const code = schema
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toMatch(/\bBytes\b/);
    expect(code).not.toMatch(/\bFloat\b/);
    expect(code).not.toMatch(/\bJson\b/);
    expect(code).not.toMatch(/Unsupported\(|vector/i);
    expect(code).not.toMatch(/embedding|descriptor|faceprint/i);
  });
});
