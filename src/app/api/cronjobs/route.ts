import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/cronjobs
 * List all cron jobs. Returns empty array when database is not configured.
 */
export async function GET() {
  try {
    const { db } = await import("@/lib/db");
    const jobs = await db.cronJob.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json(jobs);
  } catch (error) {
    console.error("[CronJobs API] GET error:", error);
    return NextResponse.json([]);
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

    const { db } = await import("@/lib/db");
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
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
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
    const { db } = await import("@/lib/db");
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
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
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
    const { db } = await import("@/lib/db");
    await db.cronJob.delete({ where: { id: body.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CronJobs API] DELETE error:", error);
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
}
