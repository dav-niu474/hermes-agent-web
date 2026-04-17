import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { executeJob } from "@/lib/cron/scheduler";

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
// DELETE /api/cronjobs/[id]
// Delete a single cron job by ID.
// ---------------------------------------------------------------------------
export async function DELETE(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;

    const existing = await db.cronJob.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Cron job not found" },
        { status: 404 },
      );
    }

    await db.cronJob.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CronJobs API] DELETE /:id error:", error);
    return NextResponse.json(
      { error: "Failed to delete cron job" },
      { status: 503 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/cronjobs/[id]/trigger
// Trigger a job to run IMMEDIATELY (not just schedule for next tick).
//
// This route lives at /api/cronjobs/[id]/trigger via Next.js file convention.
// We detect the "trigger" action by checking if the URL ends with /trigger.
// ---------------------------------------------------------------------------
export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;

    // Check if this is a /trigger request
    const url = new URL(request.url);
    const isTrigger = url.pathname.endsWith("/trigger");

    if (!isTrigger) {
      return NextResponse.json(
        { error: "Unknown action. Use /trigger to run a job." },
        { status: 400 },
      );
    }

    // Fetch the job
    const job = await db.cronJob.findUnique({ where: { id } });
    if (!job) {
      return NextResponse.json(
        { error: "Cron job not found" },
        { status: 404 },
      );
    }

    // Execute the job IMMEDIATELY in the background
    // Don't await — return immediately with "accepted" status
    const jobRow = {
      id: job.id,
      name: job.name,
      schedule: job.schedule,
      scheduleKind: job.scheduleKind,
      scheduleExpr: job.scheduleExpr,
      task: job.task,
      isEnabled: job.isEnabled,
      status: job.status,
      repeatMax: job.repeatMax,
      repeatDone: job.repeatDone,
      lastRunAt: job.lastRunAt,
      nextRunAt: job.nextRunAt,
      lastStatus: job.lastStatus,
      lastError: job.lastError,
      runCount: job.runCount,
    };

    // Fire and forget — execute in background
    executeJob(jobRow)
      .then((result) => {
        console.log(
          `[CronJobs] Job "${job.name}" (${id}) executed: success=${result.success}, duration=${result.duration}s`,
        );
      })
      .catch((err) => {
        console.error(
          `[CronJobs] Job "${job.name}" (${id}) background execution failed:`,
          err,
        );
      });

    return NextResponse.json({
      success: true,
      message: `Job "${job.name}" is now executing.`,
      jobId: id,
    });
  } catch (error) {
    console.error("[CronJobs API] POST /:id/trigger error:", error);
    return NextResponse.json(
      { error: "Failed to trigger cron job" },
      { status: 503 },
    );
  }
}
