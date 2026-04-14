import { NextResponse } from "next/server";
import { tick, getSchedulerStats } from "@/lib/cron/scheduler";

// ---------------------------------------------------------------------------
// POST /api/cronjobs/tick
// Manually trigger the scheduler tick.
//
// This endpoint can be called by:
//   1. Vercel Cron Jobs (configured in vercel.json)
//   2. Admin manual trigger for debugging
//
// The response includes execution stats so the caller knows what happened.
// ---------------------------------------------------------------------------
export async function POST() {
  try {
    const statsBefore = await getSchedulerStats();

    if (statsBefore.dueJobs === 0) {
      return NextResponse.json({
        triggered: true,
        executed: 0,
        skipped: 0,
        errors: 0,
        message: "No due jobs found.",
        stats: statsBefore,
      });
    }

    console.log(
      `[CronJobs Tick] Manual tick triggered: ${statsBefore.dueJobs} due job(s)`,
    );

    const result = await tick();

    return NextResponse.json({
      triggered: true,
      ...result,
      stats: statsBefore,
    });
  } catch (error) {
    console.error("[CronJobs Tick API] POST error:", error);
    return NextResponse.json(
      { error: "Failed to execute scheduler tick" },
      { status: 503 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/cronjobs/tick
// Get scheduler health/stats without triggering a tick.
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const stats = await getSchedulerStats();
    return NextResponse.json({
      scheduler: "active",
      tickIntervalMs: 60_000,
      ...stats,
    });
  } catch (error) {
    console.error("[CronJobs Tick API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to get scheduler stats" },
      { status: 503 },
    );
  }
}
