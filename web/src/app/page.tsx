import { ConsentCard } from "@/components/consent-card";
import { LiveCheck } from "@/components/live-check";
import { PhotosCard } from "@/components/photos-card";
import { StartAccount } from "@/components/start-account";
import { currentPassedCheck } from "@/lib/liveness";
import { MAX_PHOTOS, listPhotos } from "@/lib/photos";
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
  const current = !account?.consentedAt ? 0 : passed || photos.length ? 2 : 1;
  const photoItems = photos.map((photo) => ({
    id: photo.id,
    expires: photo.expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
  }));

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
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
            {!passed ? <LiveCheck /> : null}
          </div>
        )}
      </div>

      {account ? (
        <p className="mt-8 text-xs text-slate-400">Anonymous account …{account.id.slice(-6)}</p>
      ) : null}
    </main>
  );
}
