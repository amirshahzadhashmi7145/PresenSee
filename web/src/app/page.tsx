import { ConsentCard } from "@/components/consent-card";
import { DeleteAccount } from "@/components/delete-account";
import { FaceSearchCard } from "@/components/face-search-card";
import { LiveCheck } from "@/components/live-check";
import { PhotosCard } from "@/components/photos-card";
import { PresenceCard } from "@/components/presence-card";
import { type MatchItem, type PhotoResults, ResultsCard } from "@/components/results-card";
import { StartAccount } from "@/components/start-account";
import { MAX_FACE_SEARCHES_PER_DAY, faceSearchesUsedToday } from "@/lib/face-search/service";
import { currentPassedCheck } from "@/lib/liveness";
import { MAX_PHOTOS, listPhotos } from "@/lib/photos";
import { profileFromUrl, summarizePresence } from "@/lib/presence";
import { config } from "@/lib/config";
import { MAX_SEARCHES_PER_DAY, resultsForAccount, searchesUsedToday } from "@/lib/search/service";
import { GENERIC_REPORT_LINKS, reportLinkFor } from "@/lib/report-links";
import { getCurrentAccount } from "@/lib/session";

export const dynamic = "force-dynamic";

function Steps({ current }: { current: number }) {
  const names = ["Consent", "Live check", "Photos", "Results"];
  return (
    <ol className="mt-6 flex flex-wrap gap-2 text-sm">
      {names.map((name, i) => (
        <li
          key={name}
          className={
            i < current
              ? "rounded-full bg-emerald-100 px-3 py-1 text-emerald-800"
              : i === current
                ? "rounded-full bg-slate-900 px-3 py-1 text-white"
                : "rounded-full bg-slate-200 px-3 py-1 text-slate-600"
          }
        >
          {i < current ? "✓ " : `${i + 1}. `}
          {name}
        </li>
      ))}
    </ol>
  );
}

export default async function Home() {
  let account = null;
  let databaseOk = true;
  try {
    account = await getCurrentAccount();
  } catch {
    databaseOk = false;
  }
  const passed = account?.consentedAt ? await currentPassedCheck(account.id) : null;
  const photos = account?.consentedAt ? await listPhotos(account.id) : [];
  const runs = account?.consentedAt ? await resultsForAccount(account.id) : [];
  const usedToday = account?.consentedAt ? await searchesUsedToday(account.id) : 0;
  const report = (url: string) => {
    const link = reportLinkFor(url);
    return link ? { platform: link.platform, url: link.url, note: link.note } : null;
  };
  const profileOf = (url: string) => {
    const profile = profileFromUrl(url);
    return profile ? { platform: profile.platform, handle: profile.handle, url: profile.profileUrl } : null;
  };
  const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const photoResults: PhotoResults[] = photos.map((photo) => {
    const latest = runs.find((run) => run.photoId === photo.id); // runs are newest first
    return {
      photoId: photo.id,
      searchedAt: latest ? day(latest.createdAt) : null,
      matches: (latest?.matches ?? []).map((m) => ({
        id: m.id,
        pageUrl: m.pageUrl,
        siteName: m.siteName,
        thumbnailUrl: m.thumbnailUrl,
        foundDate: m.foundDate ? day(m.foundDate) : null,
        score: m.matchScore,
        profile: profileOf(m.pageUrl),
        tag: m.tag,
        report: report(m.pageUrl),
      })),
    };
  });
  const faceProvider = config.faceSearchProvider;
  const faceRun = runs.find((run) => run.kind === "face");
  const faceMatches: MatchItem[] = (faceRun?.matches ?? []).map((m) => ({
    id: m.id,
    pageUrl: m.pageUrl,
    siteName: m.siteName,
    thumbnailUrl: m.thumbnailUrl,
    foundDate: null,
    score: m.matchScore,
    profile: profileOf(m.pageUrl),
    tag: m.tag,
    report: report(m.pageUrl),
  }));
  const faceUsedToday = account?.consentedAt ? await faceSearchesUsedToday(account.id) : 0;
  const presence = summarizePresence(
    [...photoResults.flatMap((p) => p.matches), ...faceMatches].map((m) => ({
      pageUrl: m.pageUrl,
      siteName: m.siteName,
      tag: m.tag,
    })),
  );
  const searchedCount = photoResults.filter((p) => p.searchedAt).length;
  const anySearch = searchedCount > 0 || Boolean(faceRun);
  const current = !account?.consentedAt ? 0 : anySearch ? 3 : passed || photos.length ? 2 : 1;
  const photoItems = photos.map((photo) => ({
    id: photo.id,
    expires: photo.expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
  }));

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">PresenSee</h1>
      <p className="mt-2 text-slate-600">
        Check your own online presence and spot fake profiles using your photos.
      </p>
      <Steps current={current} />

      <div className="mt-6">
        {!databaseOk ? (
          <p className="text-red-700">The database is not reachable. Is `bash dev.sh` running?</p>
        ) : !account ? (
          <StartAccount />
        ) : !account.consentedAt ? (
          <ConsentCard />
        ) : (
          <div className="space-y-6">
            {passed ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                ✓ Live check passed. You can add photos until{" "}
                {passed.expiresAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.
              </p>
            ) : null}
            {passed || photos.length ? (
              <PhotosCard photos={photoItems} canUpload={Boolean(passed)} max={MAX_PHOTOS} />
            ) : null}
            {anySearch ? (
              <PresenceCard summary={presence} searched={searchedCount} total={photos.length} faceSearched={Boolean(faceRun)} />
            ) : null}
            {faceProvider !== "off" && (passed || faceRun) ? (
              <FaceSearchCard
                matches={faceMatches}
                searchedAt={faceRun ? day(faceRun.createdAt) : null}
                agreed={Boolean(account.faceSearchConsentedAt)}
                canSearch={Boolean(passed)}
                usedToday={faceUsedToday}
                maxPerDay={MAX_FACE_SEARCHES_PER_DAY}
                providerName={faceProvider === "facecheck" ? "FaceCheck.ID" : "test provider (no data leaves this computer)"}
                testMode={faceProvider === "mock" || (faceProvider === "facecheck" && config.facecheckDemo)}
                fallbacks={GENERIC_REPORT_LINKS}
              />
            ) : null}
            {photos.length ? (
              <ResultsCard
                photos={photoResults}
                usedToday={usedToday}
                maxPerDay={MAX_SEARCHES_PER_DAY}
                mock={config.imageSearchProvider === "mock"}
                fallbacks={GENERIC_REPORT_LINKS}
              />
            ) : null}
            {!passed ? <LiveCheck /> : null}
          </div>
        )}
      </div>

      {account ? (
        <>
          <DeleteAccount />
          <p className="mt-4 text-xs text-slate-400">Anonymous account …{account.id.slice(-6)}</p>
        </>
      ) : null}
    </main>
  );
}
