/**
 * Next.js Instrumentation — Background Scheduler
 *
 * This file runs once when the Next.js server starts (both dev and production).
 * It sets up a periodic timer that drives the cron scheduler tick every 60 seconds.
 *
 * In development, this runs when `next dev` starts.
 * In production (Vercel), this runs as part of the serverless function lifecycle.
 * Note: On Vercel serverless, the timer may not persist between cold starts.
 *       For production, use Vercel Cron Jobs (vercel.json) to hit
 *       /api/cronjobs/tick as a web cron endpoint.
 *
 * @see https://nextjs.org/docs/app/building-your-application/configuring/instrumentation
 */

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

export async function register() {
  // This function is called once when the Next.js server starts
  // Only run in Node.js runtime — not Edge Runtime
  // In Vercel serverless, skip the background scheduler entirely
  // (use Vercel Cron via vercel.json instead)
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.VERCEL) {
    startScheduler();
  }
}

async function startScheduler() {
  if (schedulerInterval) {
    console.log("[Scheduler] Already running, skipping.");
    return;
  }

  console.log("[Scheduler] Starting background cron scheduler (tick every 60s)...");

  // Register signal handlers — use global process directly since we're
  // already guarded by NEXT_RUNTIME === "nodejs" check in register().
  try {
    if (typeof process !== "undefined") {
      process.on("SIGTERM", stopScheduler);
      process.on("SIGINT", stopScheduler);
    }
  } catch {
    // Signal handlers not supported in this environment — skip
  }

  // Run an initial tick on startup (with delay to let the server fully start)
  setTimeout(async () => {
    try {
      // Dynamic import to avoid crashing on startup if DB is unavailable
      const { getSchedulerStats, tick, TICK_INTERVAL_MS } = await import("@/lib/cron/scheduler");

      try {
        const stats = await getSchedulerStats();
        console.log(
          `[Scheduler] Initial stats: ${stats.totalJobs} total, ${stats.enabledJobs} enabled, ${stats.dueJobs} due`,
        );

        if (stats.dueJobs > 0) {
          console.log("[Scheduler] Running initial tick...");
          const result = await tick();
          console.log(
            `[Scheduler] Initial tick: ${result.executed} executed, ${result.errors} errors`,
          );
        }
      } catch (dbErr) {
        console.warn(
          "[Scheduler] Database unavailable — scheduler will retry on next tick.",
          dbErr instanceof Error ? dbErr.message : dbErr,
        );
      }

      // Schedule periodic ticks
      schedulerInterval = setInterval(async () => {
        try {
          await tick();
        } catch (err) {
          // Log but don't crash — the server should stay alive
          console.warn(
            "[Scheduler] Tick failed (DB may be unavailable):",
            err instanceof Error ? err.message : err,
          );
        }
      }, TICK_INTERVAL_MS);
    } catch (importErr) {
      console.warn(
        "[Scheduler] Failed to load scheduler module:",
        importErr instanceof Error ? importErr.message : importErr,
      );
    }
  }, 8000); // 8s delay to ensure server is fully ready
}

function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[Scheduler] Stopped.");
  }
}
