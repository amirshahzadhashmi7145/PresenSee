import type { PresenceSummary } from "@/lib/presence";

function Stat({ value, label, tone = "" }: { value: number; label: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-center">
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

/** The roll-up: where on the internet your photos show up. */
export function PresenceCard({
  summary,
  searched,
  total,
  faceSearched,
}: {
  summary: PresenceSummary;
  searched: number;
  total: number;
  faceSearched: boolean;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Your internet presence</h2>
      <p className="mt-1 text-sm text-slate-600">
        Built from {searched} of {total} photos searched{faceSearched ? " and a face search" : ""}. Tag the results
        below and this summary updates.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat value={summary.pages} label="pages found" />
        <Stat value={summary.sites.length} label="websites" />
        <Stat value={summary.profiles.length} label="profiles" />
        <Stat value={summary.fake} label="marked fake" tone="text-red-700" />
        <Stat value={summary.untagged} label="not reviewed" tone="text-amber-700" />
      </div>

      <h3 className="mt-5 font-semibold">Profiles showing you or your photos</h3>
      {summary.profiles.length ? (
        <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {summary.profiles.map((profile) => (
            <li key={`${profile.platform}:${profile.handle}`} className="flex items-center gap-3 p-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {profile.platform} · <span className="font-mono">@{profile.handle}</span>
                </div>
                <a href={profile.profileUrl} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-sm text-blue-700 underline">
                  {profile.profileUrl}
                </a>
              </div>
              <div className="shrink-0 text-right text-xs text-slate-500">
                <div>
                  {profile.pages} {profile.pages === 1 ? "page" : "pages"}
                </div>
                {profile.fake ? <div className="font-medium text-red-700">marked fake</div> : null}
                {profile.mine && !profile.fake ? <div className="font-medium text-emerald-700">yours</div> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">No social profiles in the results so far.</p>
      )}

      <h3 className="mt-5 font-semibold">Websites</h3>
      {summary.sites.length ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {summary.sites.map((site) => (
            <li key={site.site} className="rounded-full bg-slate-100 px-3 py-1 text-sm">
              {site.site} <span className="text-slate-500">× {site.pages}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">Nothing found yet. Search your photos below.</p>
      )}
    </section>
  );
}
