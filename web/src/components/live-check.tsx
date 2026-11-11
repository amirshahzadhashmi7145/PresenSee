"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Challenge = "turn_left" | "turn_right" | "open_mouth" | "smile";
interface View {
  session_id: string;
  step: number;
  total: number;
  challenge: Challenge;
}
type Phase = "idle" | "starting" | "relax" | "move" | "checking" | "passed" | "failed";

const MOVE_TEXT: Record<Challenge, string> = {
  turn_left: "Turn your head to YOUR left",
  turn_right: "Turn your head to YOUR right",
  open_mouth: "Open your mouth wide",
  smile: "Give a big smile",
};

const REASON_TEXT: Record<string, string> = {
  move_not_seen: "We did not see the move. Make it clear and hold it for a moment.",
  start_relaxed: "Start by looking straight at the camera with a relaxed face.",
  more_than_one_face: "More than one face was in view. Only you should be in the picture.",
  face_not_visible: "Your face was not clearly visible. Check the light and stay in the frame.",
  face_not_clear: "Your face was not clear enough. Check the light and try again.",
  different_person: "The face changed during the check.",
  too_slow: "That took too long. Please try again.",
  too_few_frames: "The camera sent too few pictures. Please try again.",
  too_many_frames: "Something went wrong with the camera pictures. Please try again.",
  frame_too_big: "Something went wrong with the camera pictures. Please try again.",
};

const WIDTH = 480;
const HEIGHT = 360;
const FRAME_GAP_MS = 125;
const RELAX_FRAMES = 8; // about 1 second looking straight
const MOVE_FRAMES = 16; // about 2 seconds doing the move

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function LiveCheck() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [view, setView] = useState<View | null>(null);
  const [message, setMessage] = useState("");

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  function grabFrame(canvas: HTMLCanvasElement): Promise<Blob | null> {
    const video = videoRef.current;
    const ctx = canvas.getContext("2d");
    if (!video || !ctx) return Promise.resolve(null);
    // Drawn as the camera sees it (not mirrored), straight from the live video.
    ctx.drawImage(video, 0, 0, WIDTH, HEIGHT);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  }

  async function captureBurst(): Promise<Blob[]> {
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const frames: Blob[] = [];
    for (let i = 0; i < RELAX_FRAMES + MOVE_FRAMES; i++) {
      if (i === RELAX_FRAMES) setPhase("move");
      const frame = await grabFrame(canvas);
      if (frame) frames.push(frame);
      await sleep(FRAME_GAP_MS);
    }
    return frames;
  }

  async function run() {
    setMessage("");
    setPhase("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setPhase("failed");
      setMessage("We could not use your camera. Allow camera access in the browser and try again.");
      return;
    }

    try {
      const started = await fetch("/api/liveness/start", { method: "POST" });
      if (!started.ok) throw new Error("start");
      let current = (await started.json()) as View;
      const sessionId = current.session_id;

      for (;;) {
        setView(current);
        setPhase("relax");
        await sleep(1200); // time to read the instruction and settle
        const frames = await captureBurst();
        setPhase("checking");

        const form = new FormData();
        form.set("sessionId", sessionId);
        frames.forEach((frame, i) => form.append("frames", frame, `${i}.jpg`));
        const res = await fetch("/api/liveness/step", { method: "POST", body: form });
        if (!res.ok) throw new Error("step");
        const body = await res.json();

        if (body.result === "next") {
          current = body as View;
          continue;
        }
        stopCamera();
        if (body.result === "passed") {
          setPhase("passed");
          router.refresh();
        } else {
          setPhase("failed");
          setMessage(REASON_TEXT[body.reason] ?? "The live check did not pass. Please try again.");
        }
        return;
      }
    } catch {
      stopCamera();
      setPhase("failed");
      setMessage("Something went wrong. Please try again.");
    }
  }

  const active = phase === "relax" || phase === "move" || phase === "checking" || phase === "starting";
  let instruction = "";
  if (phase === "starting") instruction = "Starting the camera…";
  if (phase === "relax") instruction = "Look straight at the camera, relaxed face";
  if (phase === "move" && view) instruction = MOVE_TEXT[view.challenge];
  if (phase === "checking") instruction = "Checking…";

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Live selfie check</h2>
      <p className="mt-2 text-slate-600">
        We will ask you to make 3 small moves in front of your camera. It takes about 15 seconds.
        Make sure your face is well lit and only you are in the picture.
      </p>

      <div className="relative mt-4 aspect-[4/3] w-full overflow-hidden rounded-lg bg-slate-900">
        {/* Mirrored for comfort only. The frames we send are not mirrored. */}
        <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
        {active && instruction ? (
          <div className="absolute inset-x-0 bottom-0 bg-black/60 p-3 text-center text-lg font-semibold text-white">
            {instruction}
          </div>
        ) : null}
        {view && active ? (
          <div className="absolute right-2 top-2 rounded bg-black/60 px-2 py-1 text-sm text-white">
            Move {view.step} of {view.total}
          </div>
        ) : null}
      </div>

      {phase === "passed" ? (
        <p className="mt-4 font-medium text-emerald-700">✓ Live check passed.</p>
      ) : (
        <button
          type="button"
          onClick={run}
          disabled={active}
          className="mt-4 rounded-lg bg-slate-900 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {phase === "failed" ? "Try again" : "Start live check"}
        </button>
      )}
      {message ? <p className="mt-3 text-sm text-red-700">{message}</p> : null}
      <p className="mt-3 text-xs text-slate-500">
        Camera only: there is no way to upload a file here. The pictures are thrown away when the
        check ends.
      </p>
    </section>
  );
}
