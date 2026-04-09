import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/cronjobs
 * List all cron jobs.
 */
export async function GET() {
  try {
    const jobs = await db.cronJob.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json(jobs);
  } catch (error) {
    console.error("[CronJobs API] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch cron jobs" }, { status: 500 });
  }
}

/**
 * POST /api/cronjobs
 * Create a new cron job.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, schedule, task, isEnabled } = body;

    if (!name?.trim() || !task?.trim()) {
      return NextResponse.json({ error: "Name and task are required" }, { status: 400 });
    }

    const job = await db.cronJob.create({
      data: {
        name: name.trim(),
        schedule: schedule || "0 9 * * *",
        task: task.trim(),
        isEnabled: isEnabled !== false,
        nextRunAt: isEnabled !== false ? new Date(Date.now() + 3600000) : null,
      },
    });

    return NextResponse.json(job);
  } catch (error) {
    console.error("[CronJobs API] POST error:", error);
    return NextResponse.json({ error: "Failed to create cron job" }, { status: 500 });
  }
}

/**
 * PUT /api/cronjobs
 * Update a cron job.
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const { id, ...data } = body;
    const job = await db.cronJob.update({
      where: { id },
      data: {
        ...data,
        status: data.isEnabled !== false ? "active" : "paused",
        nextRunAt: data.isEnabled !== false ? new Date(Date.now() + 3600000) : null,
      },
    });

    return NextResponse.json(job);
  } catch (error) {
    console.error("[CronJobs API] PUT error:", error);
    return NextResponse.json({ error: "Failed to update cron job" }, { status: 500 });
  }
}

/**
 * DELETE /api/cronjobs
 * Delete a cron job by id.
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }
    await db.cronJob.delete({ where: { id: body.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CronJobs API] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete cron job" }, { status: 500 });
  }
}
