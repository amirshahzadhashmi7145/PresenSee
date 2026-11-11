"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

interface PhotoItem {
  id: string;
  expires: string;
}

const REASON_TEXT: Record<string, string> = {
  no_face: "No face was found in this photo.",
  more_than_one_face: "This photo has more than one face. Use a photo that shows only you.",
  not_same_person: "The face in this photo does not match your live selfie.",
  not_an_image: "This file is not a JPEG, PNG or WebP image.",
  too_big: "This photo is too large (the limit is 10 MB).",
  photo_limit: "You already have 5 photos. Delete one to add another.",
  live_check_required: "Your live check has run out. Do it again to add photos.",
  consent_required: "Please accept the consent screen first.",
};

export function PhotosCard({ photos, canUpload, max }: { photos: PhotoItem[]; canUpload: boolean; max: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<{ name: string; ok: boolean; text: string }[]>([]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const results: { name: string; ok: boolean; text: string }[] = [];
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.set("photo", file);
      const res = await fetch("/api/photos", { method: "POST", body: form }).catch(() => null);
      const body = res ? await res.json().catch(() => null) : null;
      if (body?.ok) results.push({ name: file.name, ok: true, text: "Accepted: it matches your live selfie." });
      else {
        const text = REASON_TEXT[body?.reason] ?? "Something went wrong. Please try again.";
        results.push({ name: file.name, ok: false, text: `Rejected and not saved. ${text}` });
      }
    }
    setNotes(results);
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    await fetch(`/api/photos/${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    router.refresh();
  }

  const full = photos.length >= max;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">Your photos</h2>
        <span className="text-sm text-slate-500">
          {photos.length} of {max}
        </span>
      </div>
      <p className="mt-2 text-slate-600">
        Add photos of yourself. Each one must show exactly one face, and that face must match your
        live selfie. A photo that fails is rejected and never saved.
      </p>

      {photos.length ? (
        <ul className="mt-4 grid grid-cols-3 gap-3">
          {photos.map((photo) => (
            <li key={photo.id} className="overflow-hidden rounded-lg border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/photos/${photo.id}`} alt="Your accepted photo" className="aspect-square w-full object-cover" />
              <div className="flex items-center justify-between gap-2 p-2 text-xs text-slate-500">
                <span>Deleted on {photo.expires}</span>
                <button type="button" disabled={busy} onClick={() => remove(photo.id)} className="font-medium text-red-700 disabled:opacity-40">
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No photos yet.</p>
      )}

      {canUpload ? (
        <div className="mt-4">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={busy || full}
            onChange={(e) => upload(e.target.files)}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:font-medium file:text-white disabled:opacity-40"
          />
          {busy ? <p className="mt-2 text-sm text-slate-600">Checking…</p> : null}
          {full ? <p className="mt-2 text-sm text-slate-600">You have reached the limit of {max} photos.</p> : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-600">To add photos, do the live check again below.</p>
      )}

      {notes.length ? (
        <ul className="mt-3 space-y-1 text-sm">
          {notes.map((note, i) => (
            <li key={i} className={note.ok ? "text-emerald-700" : "text-red-700"}>
              {note.ok ? "✓" : "✗"} <span className="font-medium">{note.name}</span>: {note.text}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
