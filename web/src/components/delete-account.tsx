"use client";

import { useState } from "react";

export function DeleteAccount() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/account", { method: "DELETE" }).catch(() => null);
    if (res?.ok) window.location.assign("/");
    else {
      setError("Could not delete the account. Please try again.");
      setBusy(false);
    }
  }

  return (
    <section className="mt-10 rounded-xl border border-red-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-red-800">Delete my account</h2>
      <p className="mt-1 text-sm text-slate-600">
        Removes every photo, your selfie, all results and all records right away. This cannot be undone.
      </p>
      {confirming ? (
        <div className="mt-3 flex items-center gap-3">
          <button type="button" disabled={busy} onClick={remove} className="rounded-lg bg-red-700 px-4 py-2 font-medium text-white disabled:opacity-40">
            {busy ? "Deleting…" : "Yes, delete everything"}
          </button>
          <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="text-sm text-slate-600 underline">
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="mt-3 rounded-lg border border-red-300 px-4 py-2 font-medium text-red-800">
          Delete my account
        </button>
      )}
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </section>
  );
}
