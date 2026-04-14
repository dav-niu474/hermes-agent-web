import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { triggerJob } from "@/lib/cron/scheduler";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// GET /api/cronjobs/[id]
// Get a single cron job with its recent logs (last 10).
// ---------------------------------------------------------------------------
export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;

    const job = await db.cronJob.findUnique({
      where: { id },
      include: {
        logs: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!job) {
      return NextResponse.json(
        { error: "Cron job not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(job);
  } catch (error) {
    console.error("[CronJobs API] GET /:id error:", error);
    return NextResponse.json(
      { error: "Failed to fetch cron job" },
      { status: 503 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/cronjobs/[id]/trigger
// Trigger a job to run immediately.
// ---------------------------------------------------------------------------
export async function POST(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;

    // Verify the job exists first
    const existing = await db.cronJob.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Cron job not found" },
        { status: 404 },
      );
    }

    // Trigger the job via the scheduler
    const job = await triggerJob(id);

    if (!job) {
      return NextResponse.json(
        { error: "Failed to trigger cron job" },
        { status: 500 },
      );
    }

    return NextResponse.json(job);
  } catch (error) {
    console.error("[CronJobs API] POST /:id/trigger error:", error);
    return NextResponse.json(
      { error: "Failed to trigger cron job" },
      { status: 503 },
    );
  }
}
