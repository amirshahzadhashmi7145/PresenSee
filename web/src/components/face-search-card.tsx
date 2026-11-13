"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MatchItem } from "@/components/results-card";
import { type ReportInfo, ReportBox, type Tag, TagButtons } from "@/components/tagging";

const REASON_TEXT: Record<string, string> = {
  face_consent_required: "Please tick the box to agree first.",
  live_check_required: "Your live check has run out. Do the live check again, then search.",
  selfie_not_available: "Your live selfie is not available. Do the live check again, then search.",
  daily_limit: "You have used today's face searches. Try again tomorrow.",
  provider_error: "The face-search service did not answer. Please try again.",
  consent_required: "Please accept the consent screen first.",
};

function strength(score: number | null): string {
  if (score === null) return "";
  if (score >= 90) return `Very likely you (${score}%)`;
  if (score >= 83) return `Likely you (${score}%)`;
  return `Possibly you (${score}%)`;
}

export function FaceSearchCard({
  matches,
  searchedAt,
  agreed,
  canSearch,
  usedToday,
  maxPerDay,
  providerName,
  testMode,
  fallbacks,
}: {
  matches: MatchItem[];
  searchedAt: string | null;
  agreed: boolean;
  canSearch: boolean;
  usedToday: number;
  maxPerDay: number;
  providerName: string;
  testMode: boolean;
  fallbacks: ReportInfo[];
}) {
  const router = useRouter();
  const [tick, setTick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function search() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/face-search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agree: agreed || tick }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => null) : null;
    if (!body?.ok) setError(REASON_TEXT[body?.reason] ?? "Something went wrong. Please try again.");
    setBusy(false);
    router.refresh();
  }

  async function tag(matchId: string, next: Tag) {
    await fetch(`/api/matches/${matchId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tag: next }),
    }).catch(() => null);
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">Find my face on the web</h2>
        <span className="text-sm text-slate-500">
          {usedToday} of {maxPerDay} today
        </span>
      </div>
      <p className="mt-2 text-slate-600">
        Searches the web for other photos that show <strong>your face</strong>, not only copies of the
        photos you uploaded. It uses the selfie from your live check, so it can only search for the
        person who just passed that check.
      </p>
      {testMode ? (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Test mode: these results are not real.
        </p>
      ) : null}

      {!agreed ? (
        <label className="mt-4 flex items-start gap-3 rounded-lg bg-slate-50 p-3 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={tick} onChange={(e) => setTick(e.target.checked)} />
          <span>
            I agree that my live selfie is sent to the face-search service <strong>{providerName}</strong> to
            look for my own face. I will only use this for myself.
          </span>
        </label>
      ) : null}

      <button
        type="button"
        disabled={busy || !canSearch || (!agreed && !tick) || usedToday >= maxPerDay}
        onClick={search}
        className="mt-4 rounded-lg bg-slate-900 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Searching… this can take a minute" : searchedAt ? "Search for my face again" : "Search for my face"}
      </button>
      {!canSearch ? (
        <p className="mt-2 text-sm text-slate-600">Do the live check again below to use this.</p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}

      {searchedAt ? (
        <p className="mt-4 text-sm text-slate-500">
          Searched {searchedAt} · {matches.length} results. Weak matches are left out because they are usually
          other people. Check each one yourself before you call it fake.
        </p>
      ) : null}
      <ul className="mt-2 space-y-2">
        {matches.map((match) => (
          <li key={match.id} className="rounded-lg border border-slate-200 p-2">
            <div className="flex items-center gap-3">
              {match.thumbnailUrl?.startsWith("/api/matches/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={match.thumbnailUrl} alt="" loading="lazy" className="h-12 w-12 rounded object-cover" />
              ) : (
                <div className="h-12 w-12 rounded bg-slate-200" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {match.siteName}
                  {match.profile ? (
                    <a href={match.profile.url} target="_blank" rel="noopener noreferrer nofollow" className="ml-2 font-mono font-normal text-blue-700 underline">
                      @{match.profile.handle}
                    </a>
                  ) : null}
                </div>
                <a href={match.pageUrl} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-sm text-blue-700 underline">
                  {match.pageUrl}
                </a>
                <div className="text-xs text-slate-500">{strength(match.score)}</div>
              </div>
              <TagButtons tag={match.tag} onTag={(next) => tag(match.id, next)} />
            </div>
            {match.tag === "FAKE" ? <ReportBox report={match.report} fallbacks={fallbacks} /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
