import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/cronjobs/[id]/trigger
 * Trigger a cron job to run on the next scheduler tick by setting nextRunAt to now.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const { db } = await import("@/lib/db");

    const job = await db.cronJob.findUnique({ where: { id } });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Set nextRunAt to now so the scheduler picks it up on the next tick
    const updatedJob = await db.cronJob.update({
      where: { id },
      data: {
        isEnabled: true,
        status: "scheduled",
        nextRunAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Job "${job.name}" triggered. It will execute on the next scheduler tick.`,
      job: updatedJob,
    });
  } catch (error) {
    console.error("[CronJobs Trigger API] POST error:", error);
    return NextResponse.json({ error: "Failed to trigger job" }, { status: 503 });
  }
}
