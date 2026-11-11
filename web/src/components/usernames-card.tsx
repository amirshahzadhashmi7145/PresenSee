"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { type ReportInfo, ReportBox, type Tag, TagButtons } from "@/components/tagging";

export interface ProfileRow {
  id: string;
  site: string;
  url: string;
  status: "FOUND" | "NOT_FOUND" | "UNKNOWN" | "MANUAL";
  tag: Tag;
  report: ReportInfo | null;
}

export interface UsernameItem {
  id: string;
  handle: string;
  rows: ProfileRow[];
}

const REASON_TEXT: Record<string, string> = {
  bad_handle: "That does not look like a username. Use 2 to 40 letters, numbers, dots, dashes or underscores.",
  already_added: "You already added this username.",
  username_limit: "You already have 5 usernames. Remove one to add another.",
  consent_required: "Please accept the consent screen first.",
  too_soon: "This username was checked less than an hour ago. Try again later.",
};

export function UsernamesCard({ usernames, max, fallbacks }: { usernames: UsernameItem[]; max: number; fallbacks: ReportInfo[] }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function call(url: string, init: RequestInit) {
    setBusy(true);
    setError("");
    const res = await fetch(url, init).catch(() => null);
    const body = res ? await res.json().catch(() => null) : null;
    if (!body?.ok) setError(REASON_TEXT[body?.reason] ?? "Something went wrong. Please try again.");
    setBusy(false);
    router.refresh();
    return Boolean(body?.ok);
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!value.trim()) return;
    const ok = await call("/api/usernames", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ handle: value }),
    });
    if (ok) setValue("");
  }

  async function tag(checkId: string, next: Tag) {
    await fetch(`/api/profile-checks/${checkId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tag: next }),
    }).catch(() => null);
    router.refresh();
  }

  const full = usernames.length >= max;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">Your usernames</h2>
        <span className="text-sm text-slate-500">
          {usernames.length} of {max}
        </span>
      </div>
      <p className="mt-2 text-slate-600">
        Enter usernames that <strong>you</strong> use. We check a fixed list of sites for a public profile with that
        name. Some big sites do not allow automatic checks; for those you get a link to open yourself.
      </p>

      <form onSubmit={add} className="mt-4 flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="your_username"
          maxLength={41}
          disabled={busy || full}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-40"
        />
        <button type="submit" disabled={busy || full || !value.trim()} className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">
          {busy ? "Checking…" : "Check"}
        </button>
      </form>
      {busy ? <p className="mt-2 text-sm text-slate-600">Checking the sites politely, one at a time. This can take 10 to 20 seconds.</p> : null}
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}

      <ul className="mt-4 space-y-6">
        {usernames.map((username) => {
          const found = username.rows.filter((r) => r.status === "FOUND");
          const manual = username.rows.filter((r) => r.status === "MANUAL");
          const unknown = username.rows.filter((r) => r.status === "UNKNOWN");
          const notFound = username.rows.filter((r) => r.status === "NOT_FOUND");
          return (
            <li key={username.id} className="border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">@{username.handle}</div>
                <div className="flex gap-3 text-sm">
                  <button type="button" disabled={busy} onClick={() => call(`/api/usernames/${username.id}`, { method: "POST" })} className="text-blue-700 underline disabled:opacity-40">
                    Check again
                  </button>
                  <button type="button" disabled={busy} onClick={() => call(`/api/usernames/${username.id}`, { method: "DELETE" })} className="text-red-700 underline disabled:opacity-40">
                    Remove
                  </button>
                </div>
              </div>

              <Group title={`Profile found (${found.length})`} rows={found} onTag={tag} fallbacks={fallbacks} empty="No profile with this name was found on the sites we can check." />
              <Group title={`Open and look yourself (${manual.length})`} rows={manual} onTag={tag} fallbacks={fallbacks} hint="These sites do not allow automatic checks." />
              {unknown.length ? <Group title={`Could not check (${unknown.length})`} rows={unknown} onTag={tag} fallbacks={fallbacks} hint="The site did not give a clear answer, or its rules did not allow the check." /> : null}
              <p className="mt-3 text-sm text-slate-500">
                No profile on: {notFound.length ? notFound.map((r) => r.site).join(", ") : "—"}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Group({
  title,
  rows,
  onTag,
  fallbacks,
  hint,
  empty,
}: {
  title: string;
  rows: ProfileRow[];
  onTag: (id: string, next: Tag) => void;
  fallbacks: ReportInfo[];
  hint?: string;
  empty?: string;
}) {
  return (
    <div className="mt-3">
      <div className="text-sm font-medium text-slate-700">{title}</div>
      {hint ? <div className="text-xs text-slate-500">{hint}</div> : null}
      {rows.length === 0 && empty ? <p className="mt-1 text-sm text-slate-500">{empty}</p> : null}
      <ul className="mt-1 space-y-1">
        {rows.map((row) => (
          <li key={row.id} className="rounded-lg border border-slate-200 p-2">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{row.site}</div>
                <a href={row.url} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-sm text-blue-700 underline">
                  {row.url}
                </a>
              </div>
              <TagButtons tag={row.tag} onTag={(next) => onTag(row.id, next)} />
            </div>
            {row.tag === "FAKE" ? <ReportBox report={row.report} fallbacks={fallbacks} /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
