// Runs once when the web server starts: start the auto-delete timer.

const HOUR_MS = 60 * 60 * 1000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const flag = globalThis as unknown as { presenseeRetentionTimer?: boolean };
  if (flag.presenseeRetentionTimer) return; // a hot reload must not start a second timer
  flag.presenseeRetentionTimer = true;

  const { runRetention } = await import("@/lib/retention");
  const { storage } = await import("@/lib/storage");
  const sweep = () =>
    runRetention(storage())
      .then((done) => {
        if (done.photos || done.selfies || done.faceResults) {
          console.log(`auto-delete: ${done.photos} photos, ${done.selfies} selfies, ${done.faceResults} face searches`);
        }
      })
      .catch((error) => console.error("auto-delete error:", error instanceof Error ? error.message.slice(0, 200) : "unknown"));

  setTimeout(sweep, 10_000).unref(); // catch up shortly after start
  setInterval(sweep, HOUR_MS).unref(); // then every hour
}
