import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseSchedule, computeNextRun } from "@/lib/cron/scheduler";

// ---------------------------------------------------------------------------
// GET /api/cronjobs
// List all cron jobs ordered by createdAt desc.
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const jobs = await db.cronJob.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        schedule: true,
        scheduleKind: true,
        scheduleExpr: true,
        task: true,
        isEnabled: true,
        status: true,
        repeatMax: true,
        repeatDone: true,
        lastRunAt: true,
        nextRunAt: true,
        lastStatus: true,
        lastError: true,
        runCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(jobs);
  } catch (error) {
    console.error("[CronJobs API] GET error:", error);
    return NextResponse.json([]);
  }
}

// ---------------------------------------------------------------------------
// POST /api/cronjobs
// Create a new cron job with schedule parsing.
//
// Body: { name, schedule, task }
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, schedule: rawSchedule, task } = body;

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 },
      );
    }
    if (!rawSchedule?.trim()) {
      return NextResponse.json(
        { error: "Schedule is required" },
        { status: 400 },
      );
    }
    if (!task?.trim()) {
      return NextResponse.json(
        { error: "Task is required" },
        { status: 400 },
      );
    }

    // Parse the schedule string
    const parsed = parseSchedule(rawSchedule.trim());

    // Derive scheduleKind and scheduleExpr from the parsed result
    const scheduleKind = parsed.kind;
    const scheduleExpr =
      parsed.kind === "cron"
        ? parsed.expr
        : parsed.kind === "interval"
          ? String(parsed.minutes)
          : null;

    // Compute the first nextRunAt
    const nextRunAt = computeNextRun(parsed);

    // Determine repeatMax: "once" jobs default to 1, recurring jobs run forever
    const repeatMax = parsed.kind === "once" ? 1 : null;

    const job = await db.cronJob.create({
      data: {
        name: name.trim(),
        schedule: rawSchedule.trim(),
        scheduleKind,
        scheduleExpr,
        task: task.trim(),
        isEnabled: true,
        status: "scheduled",
        repeatMax,
        repeatDone: 0,
        nextRunAt,
        lastStatus: null,
        lastError: null,
        runCount: 0,
      },
    });

    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[CronJobs API] POST error:", error);

    // Distinguish validation errors from DB errors
    if (message.includes("Schedule string") || message.includes("Unrecognised schedule") || message.includes("Invalid")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Failed to create cron job" },
      { status: 503 },
    );
  }
}

// ---------------------------------------------------------------------------
// PUT /api/cronjobs
// Update a cron job. Supports updating: name, schedule, task, isEnabled, repeatMax.
//
// Body: { id, name?, schedule?, task?, isEnabled?, repeatMax? }
// ---------------------------------------------------------------------------
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, schedule, task, isEnabled, repeatMax } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID is required" },
        { status: 400 },
      );
    }

    // Fetch the existing job first
    const existing = await db.cronJob.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Cron job not found" },
        { status: 404 },
      );
    }

    // Build the update data
    const data: Record<string, unknown> = {};

    if (name !== undefined) {
      if (!name?.trim()) {
        return NextResponse.json(
          { error: "Name cannot be empty" },
          { status: 400 },
        );
      }
      data.name = name.trim();
    }

    if (task !== undefined) {
      if (!task?.trim()) {
        return NextResponse.json(
          { error: "Task cannot be empty" },
          { status: 400 },
        );
      }
      data.task = task.trim();
    }

    // If schedule changes, re-parse and update derived fields
    if (schedule !== undefined) {
      if (!schedule?.trim()) {
        return NextResponse.json(
          { error: "Schedule cannot be empty" },
          { status: 400 },
        );
      }

      try {
        const parsed = parseSchedule(schedule.trim());
        data.schedule = schedule.trim();
        data.scheduleKind = parsed.kind;
        data.scheduleExpr =
          parsed.kind === "cron"
            ? parsed.expr
            : parsed.kind === "interval"
              ? String(parsed.minutes)
              : null;
        data.nextRunAt = computeNextRun(parsed, existing.lastRunAt);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Invalid schedule";
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    // Handle isEnabled toggle
    if (isEnabled !== undefined) {
      data.isEnabled = isEnabled;

      if (isEnabled) {
        // Enabling: set status to scheduled and compute nextRunAt if not set
        if (existing.status === "paused" || existing.status === "completed") {
          data.status = "scheduled";
        }
        if (!existing.nextRunAt && !data.nextRunAt) {
          // Recompute nextRunAt from stored schedule
          try {
            const parsed = parseSchedule(existing.schedule);
            data.nextRunAt = computeNextRun(parsed, existing.lastRunAt);
          } catch {
            // If schedule can't be parsed, leave nextRunAt null
          }
        }
      } else {
        // Disabling: set status to paused
        data.status = "paused";
        data.nextRunAt = null;
      }
    }

    // Handle repeatMax update
    if (repeatMax !== undefined) {
      data.repeatMax = repeatMax === null || repeatMax === undefined
        ? null
        : Number(repeatMax);
    }

    const job = await db.cronJob.update({
      where: { id },
      data,
    });

    return NextResponse.json(job);
  } catch (error) {
    console.error("[CronJobs API] PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update cron job" },
      { status: 503 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/cronjobs
// Delete a cron job by id.
//
// Body: { id }
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID is required" },
        { status: 400 },
      );
    }

    await db.cronJob.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CronJobs API] DELETE error:", error);

    // Check if it's a "record not found" error
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Record to delete not found") || message.includes("No CronJob found")) {
      return NextResponse.json(
        { error: "Cron job not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { error: "Failed to delete cron job" },
      { status: 503 },
    );
  }
}
