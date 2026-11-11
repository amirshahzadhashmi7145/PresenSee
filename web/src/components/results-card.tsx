"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { type ReportInfo, ReportBox, type Tag, TagButtons } from "@/components/tagging";

export interface MatchItem {
  id: string;
  pageUrl: string;
  siteName: string;
  thumbnailUrl: string | null;
  foundDate: string | null;
  tag: Tag;
  report: ReportInfo | null;
}

export interface PhotoResults {
  photoId: string;
  searchedAt: string | null;
  matches: MatchItem[];
}

const REASON_TEXT: Record<string, string> = {
  daily_limit: "You have used all 20 searches for today. Try again tomorrow.",
  photo_not_found: "This photo is no longer available.",
  provider_error: "The search service did not answer. Please try again.",
  consent_required: "Please accept the consent screen first.",
};

function safeThumb(url: string | null): string | null {
  return url && (url.startsWith("https://") || url.startsWith("data:image/")) ? url : null;
}

export function ResultsCard({
  photos,
  usedToday,
  maxPerDay,
  mock,
  fallbacks,
}: {
  photos: PhotoResults[];
  usedToday: number;
  maxPerDay: number;
  mock: boolean;
  fallbacks: ReportInfo[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function search(photoId: string) {
    setBusy(photoId);
    setError("");
    const res = await fetch(`/api/photos/${photoId}/search`, { method: "POST" }).catch(() => null);
    const body = res ? await res.json().catch(() => null) : null;
    if (!body?.ok) setError(REASON_TEXT[body?.reason] ?? "Something went wrong. Please try again.");
    setBusy(null);
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
        <h2 className="text-xl font-semibold">Where your photos appear</h2>
        <span className="text-sm text-slate-500">
          {usedToday} of {maxPerDay} searches today
        </span>
      </div>
      <p className="mt-2 text-slate-600">
        Search the web for copies of each photo, then mark every result as Mine, Fake or Ignore.
      </p>
      {mock ? (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Test mode: these results are made up. No real search is happening yet.
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

      <ul className="mt-4 space-y-6">
        {photos.map((photo, index) => (
          <li key={photo.photoId} className="border-t border-slate-100 pt-4 first:border-0 first:pt-0">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/photos/${photo.photoId}`} alt={`Your photo ${index + 1}`} className="h-14 w-14 rounded-lg object-cover" />
              <div className="flex-1">
                <div className="font-medium">Photo {index + 1}</div>
                <div className="text-sm text-slate-500">
                  {photo.searchedAt ? `Searched ${photo.searchedAt} · ${photo.matches.length} results` : "Not searched yet"}
                </div>
              </div>
              <button
                type="button"
                disabled={busy !== null || usedToday >= maxPerDay}
                onClick={() => search(photo.photoId)}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === photo.photoId ? "Searching…" : photo.searchedAt ? "Search again" : "Search the web"}
              </button>
            </div>

            {photo.matches.length ? (
              <ul className="mt-3 space-y-2">
                {photo.matches.map((match) => {
                  const thumb = safeThumb(match.thumbnailUrl);
                  return (
                    <li key={match.id} className="rounded-lg border border-slate-200 p-2">
                      <div className="flex items-center gap-3">
                      {thumb ? (
                        // Loaded by your browser straight from the provider's link; our server never downloads it.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-12 w-12 rounded object-cover" />
                      ) : (
                        <div className="h-12 w-12 rounded bg-slate-200" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{match.siteName}</div>
                        <a href={match.pageUrl} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-sm text-blue-700 underline">
                          {match.pageUrl}
                        </a>
                        <div className="text-xs text-slate-500">{match.foundDate ? `First seen ${match.foundDate}` : "Date not known"}</div>
                      </div>
                      <TagButtons tag={match.tag} onTag={(next) => tag(match.id, next)} />
                      </div>
                      {match.tag === "FAKE" ? <ReportBox report={match.report} fallbacks={fallbacks} /> : null}
                    </li>
                  );
                })}
              </ul>
            ) : photo.searchedAt ? (
              <p className="mt-3 text-sm text-slate-500">No copies of this photo were found.</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
