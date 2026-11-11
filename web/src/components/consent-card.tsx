"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ConsentCard() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function accept() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/consent", { method: "POST" }).catch(() => null);
    if (res?.ok) router.refresh();
    else {
      setError("Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Before we start</h2>
      <p className="mt-2 text-slate-600">
        PresenSee checks where <strong>your own</strong> photos appear online. It is not for
        looking up other people. Here is what happens with your data.
      </p>

      <h3 className="mt-5 font-semibold">What we collect</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">
        <li>A short live selfie from your camera, to prove you are a real person.</li>
        <li>Up to 5 photos of you that you choose to upload.</li>
      </ul>

      <h3 className="mt-5 font-semibold">Why</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">
        <li>The selfie is compared only with your own uploads, to confirm the photos are of you.</li>
        <li>Photos that match are searched on the web to find copies of them.</li>
        <li>Your face is never compared with other people or with search results.</li>
      </ul>

      <h3 className="mt-5 font-semibold">How it is kept</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">
        <li>Camera frames from the live check are thrown away when the check ends.</li>
        <li>Face measurements are used for a moment and never saved.</li>
        <li>Photos are stored encrypted and deleted automatically after 30 days.</li>
        <li>
          Test version: one selfie frame is kept encrypted on this computer so your uploads can be
          compared with it.
        </li>
      </ul>

      <h3 className="mt-5 font-semibold">How to delete</h3>
      <p className="mt-1 text-slate-700">
        “Delete my account”, at the bottom of the page, removes every photo, result and record
        right away.
      </p>

      <label className="mt-6 flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span>I have read this and I agree. I will only use PresenSee for my own photos.</span>
      </label>

      <button
        type="button"
        disabled={!agreed || busy}
        onClick={accept}
        className="mt-4 rounded-lg bg-slate-900 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Saving…" : "I agree, continue"}
      </button>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      <p className="mt-3 text-xs text-slate-500">
        Your camera is not used until you agree and press “Start live check”.
      </p>
    </section>
  );
}
