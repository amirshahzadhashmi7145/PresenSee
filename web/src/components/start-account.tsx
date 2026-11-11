"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Quietly creates the anonymous account on first visit, then reloads the page. */
export function StartAccount() {
  const router = useRouter();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetch("/api/account", { method: "POST" })
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        router.refresh();
      })
      .catch(() => setFailed(true));
  }, [router]);

  return (
    <p className="text-sm text-slate-600">
      {failed ? "Could not set up your account. Is the database running?" : "Setting up your account…"}
    </p>
  );
}
