import { db } from "@/lib/db";
import { faceServiceHealthy } from "@/lib/face-client";
import { getCurrentAccount } from "@/lib/session";
import { StartAccount } from "./start-account";

export const dynamic = "force-dynamic";

function Row({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <span className="font-medium">{label}</span>
      <span className={ok ? "text-emerald-700" : "text-red-700"}>
        {ok ? "✓" : "✗"} {detail}
      </span>
    </li>
  );
}

export default async function Home() {
  let databaseOk = true;
  let account = null;
  try {
    account = await getCurrentAccount();
  } catch {
    databaseOk = false;
  }
  const faceOk = await faceServiceHealthy();
  const accountCount = databaseOk ? await db.account.count().catch(() => 0) : 0;

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">PresenSee</h1>
      <p className="mt-2 text-slate-600">
        Check your own online presence and spot fake profiles using your photos.
      </p>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Step 1 status
        </h2>
        <ul className="mt-2 divide-y divide-slate-100">
          <Row label="Web app" ok detail="running" />
          <Row label="Database" ok={databaseOk} detail={databaseOk ? "connected" : "not reachable"} />
          <Row label="Face service" ok={faceOk} detail={faceOk ? "connected" : "not reachable"} />
          <Row
            label="Your account"
            ok={Boolean(account)}
            detail={account ? `anonymous · …${account.id.slice(-6)}` : "not created yet"}
          />
        </ul>
        {databaseOk && !account ? (
          <div className="mt-3">
            <StartAccount />
          </div>
        ) : null}
        <p className="mt-4 text-xs text-slate-500">
          Accounts in this database: {accountCount}. No sign-up yet: the account is tied to this
          browser by a cookie.
        </p>
      </section>

      <p className="mt-6 text-sm text-slate-500">
        Next: the consent screen and the live selfie check.
      </p>
    </main>
  );
}
