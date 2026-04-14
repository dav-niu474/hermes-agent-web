/**
 * Cron Scheduler — Core scheduling engine for Hermes Agent.
 *
 * Ported from the Python hermes-agent cron system to TypeScript/Next.js.
 * Handles schedule parsing, next-run computation, job execution, and the
 * main tick loop that drives all cron jobs.
 *
 * All functions are async and server-side only.
 */

/**
 * Lazy-loaded Prisma client.
 *
 * Using a getter function instead of a top-level import so that the module
 * can be loaded without triggering Prisma initialization (which validates
 * env vars). This is critical for instrumentation.ts which loads the
 * scheduler at server startup — if the DB env var is missing we want a
 * graceful warning, not a process crash.
 */
async function getDb() {
  const { db } = await import("../db");
  return db;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Discriminated union for a parsed schedule. */
export type ParsedSchedule =
  | { kind: "once"; runAt: Date; display: string }
  | { kind: "interval"; minutes: number; display: string }
  | { kind: "cron"; expr: string; display: string };

/** A cron job row from the database (subset of fields used by the scheduler). */
export type CronJobRow = {
  id: string;
  name: string;
  schedule: string;
  scheduleKind: string;
  scheduleExpr: string | null;
  task: string;
  isEnabled: boolean;
  status: string;
  repeatMax: number | null;
  repeatDone: number;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  runCount: number;
};

/** Result returned by the tick function. */
export interface TickResult {
  executed: number;
  skipped: number;
  errors: number;
  details: Array<{
    jobId: string;
    jobName: string;
    status: "executed" | "skipped" | "error";
    error?: string;
  }>;
}

// ---------------------------------------------------------------------------
// 1. Schedule Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a human-readable schedule string into a structured ParsedSchedule.
 *
 * Supported formats:
 *   - Duration:     "30m", "2h", "1d"           → one-shot, runs after that duration
 *   - Interval:     "every 30m", "every 2h"      → recurring every N minutes
 *   - Cron:         "0 9 * * *"                  → standard 5-field cron expression
 *   - ISO timestamp: "2026-02-03T14:00"          → one-shot at that time
 */
export function parseSchedule(input: string): ParsedSchedule {
  const raw = (input || "").trim();
  if (!raw) {
    throw new Error("Schedule string is empty");
  }

  // ── ISO timestamp (one-shot) ──
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (isoMatch) {
    const date = new Date(raw);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid ISO timestamp: ${raw}`);
    }
    return {
      kind: "once",
      runAt: date,
      display: `Once at ${formatDateTime(date)}`,
    };
  }

  // ── Interval: "every N<unit>" ──
  const intervalMatch = raw.match(
    /^every\s+(\d+)\s*(m(?:in(?:ute)?s?)?|h(?:ours?)?|d(?:ays?)?)$/i,
  );
  if (intervalMatch) {
    const minutes = durationToMinutes(
      Number(intervalMatch[1]),
      intervalMatch[2].toLowerCase(),
    );
    return {
      kind: "interval",
      minutes,
      display: `Every ${formatInterval(minutes)}`,
    };
  }

  // ── Duration: "N<unit>" (one-shot) ──
  const durationMatch = raw.match(
    /^(\d+)\s*(m(?:in(?:ute)?s?)?|h(?:ours?)?|d(?:ays?)?)$/i,
  );
  if (durationMatch) {
    const minutes = durationToMinutes(
      Number(durationMatch[1]),
      durationMatch[2].toLowerCase(),
    );
    const runAt = new Date(Date.now() + minutes * 60_000);
    return {
      kind: "once",
      runAt,
      display: `Once in ${formatInterval(minutes)} (${formatDateTime(runAt)})`,
    };
  }

  // ── Cron expression (5 fields) ──
  if (isCronExpression(raw)) {
    return {
      kind: "cron",
      expr: raw,
      display: `Cron: ${raw} → ${describeCron(raw)}`,
    };
  }

  throw new Error(
    `Unrecognised schedule format: "${raw}". ` +
      `Supported: duration (30m, 2h, 1d), interval (every 30m), cron (0 9 * * *), ISO timestamp.`,
  );
}

/**
 * Parse a short duration string and return the number of minutes.
 * E.g. "30m" → 30, "2h" → 120, "1d" → 1440.
 */
export function parseDuration(input: string): number {
  const raw = input.trim();
  const match = raw.match(/^(\d+)\s*(m(?:in(?:ute)?s?)?|h(?:ours?)?|d(?:ays?)?)$/i);
  if (!match) {
    throw new Error(`Invalid duration: "${raw}". Use format like 30m, 2h, 1d.`);
  }
  return durationToMinutes(Number(match[1]), match[2].toLowerCase());
}

// ---------------------------------------------------------------------------
// 2. Compute Next Run Time
// ---------------------------------------------------------------------------

/**
 * Compute the next time a job should run.
 *
 * @param schedule  - Parsed schedule object.
 * @param lastRunAt - When the job was last executed (undefined/null for never).
 * @returns The Date when the job should next run, or null if it should never run.
 */
export function computeNextRun(
  schedule: ParsedSchedule,
  lastRunAt?: Date | null,
): Date | null {
  const now = new Date();

  switch (schedule.kind) {
    case "once": {
      // One-shot: return runAt only if it's in the future and has never been run.
      if (lastRunAt) return null; // already ran
      if (schedule.runAt <= now) return null; // past due, too late
      return schedule.runAt;
    }

    case "interval": {
      const base = lastRunAt || now;
      const next = new Date(base.getTime() + schedule.minutes * 60_000);
      // If the computed next is still in the past (shouldn't happen with || now),
      // push forward from now.
      if (next <= now) {
        return new Date(now.getTime() + schedule.minutes * 60_000);
      }
      return next;
    }

    case "cron": {
      return getNextCronOccurrence(schedule.expr, lastRunAt);
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Get Due Jobs
// ---------------------------------------------------------------------------

/** Grace window multiplier — if a job is overdue by more than this × its
 *  normal interval, we fast-forward instead of firing. */
const GRACE_WINDOW_MULTIPLIER = 2;

/** Maximum absolute grace window for cron jobs (in ms): 2 hours. */
const CRON_GRACE_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * Find all enabled jobs that are due to run.
 * For recurring jobs past their grace window, fast-forward to next occurrence.
 *
 * @returns Array of jobs that should actually be executed now.
 */
export async function getDueJobs(): Promise<CronJobRow[]> {
  const now = new Date();
  const db = await getDb();

  const jobs = await db.cronJob.findMany({
    where: {
      isEnabled: true,
      nextRunAt: { lte: now },
      status: { not: "completed" },
    },
  });

  const toExecute: CronJobRow[] = [];

  for (const job of jobs) {
    const schedule = buildParsedScheduleFromJob(job);
    if (!schedule) continue;

    let isWithinGraceWindow = true;

    if (schedule.kind === "interval" && schedule.minutes > 0) {
      const intervalMs = schedule.minutes * 60_000;
      const graceMs = intervalMs * GRACE_WINDOW_MULTIPLIER;
      const overdue = now.getTime() - (job.nextRunAt?.getTime() ?? now.getTime());
      if (overdue > graceMs) {
        isWithinGraceWindow = false;
      }
    } else if (schedule.kind === "cron") {
      const overdue = now.getTime() - (job.nextRunAt?.getTime() ?? now.getTime());
      if (overdue > CRON_GRACE_WINDOW_MS) {
        isWithinGraceWindow = false;
      }
    }

    if (isWithinGraceWindow) {
      toExecute.push(job);
    } else {
      // Fast-forward: compute next occurrence and update DB.
      const nextRun = computeNextRun(schedule, now);
      if (nextRun) {
        await db.cronJob
          .update({
            where: { id: job.id },
            data: { nextRunAt: nextRun },
          })
          .catch((err) => {
            console.error(
              `[CronScheduler] Failed to fast-forward job ${job.id}:`,
              err,
            );
          });
        console.log(
          `[CronScheduler] Fast-forwarded overdue job "${job.name}" (${job.id}) to ${formatDateTime(nextRun)}`,
        );
      } else {
        // No next run possible (e.g. one-shot past due) — mark completed.
        await db.cronJob
          .update({
            where: { id: job.id },
            data: { status: "completed", isEnabled: false, nextRunAt: null },
          })
          .catch(() => {});
      }
    }
  }

  return toExecute;
}

// ---------------------------------------------------------------------------
// 4. Execute a Job
// ---------------------------------------------------------------------------

/** System hint prepended to every cron job's task prompt. */
const CRON_SYSTEM_HINT =
  "[CRON JOB — AUTONOMOUS EXECUTION]\n" +
  "You are running as a scheduled task. No user is present. " +
  "You cannot ask questions or wait for follow-up. " +
  "Execute the task fully and autonomously, making reasonable decisions where needed.\n\n";

/**
 * Execute a single cron job by invoking the internal /api/chat endpoint.
 *
 * Steps:
 *  1. Update job status to "running"
 *  2. Build the prompt with cron system hint
 *  3. Call /api/chat internally (non-streaming)
 *  4. Capture the full response
 *  5. Save a CronJobLog record
 *  6. Update the job (lastRunAt, lastStatus, runCount++, etc.)
 *  7. If repeatMax reached, mark as "completed"
 */
export async function executeJob(job: CronJobRow): Promise<{
  success: boolean;
  output: string;
  duration: number;
  error?: string;
}> {
  const startTime = Date.now();
  const jobUpdate: Record<string, unknown> = {
    status: "running",
  };

  // 1. Mark as running
  try {
    await (await getDb()).cronJob.update({ where: { id: job.id }, data: jobUpdate });
  } catch (err) {
    console.error(`[CronScheduler] Failed to mark job ${job.id} as running:`, err);
  }

  let output = "";
  let error: string | undefined;
  let success = false;

  try {
    // 2. Build the prompt
    const fullTask = CRON_SYSTEM_HINT + job.task;

    // 3. Call /api/chat internally (non-streaming)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: fullTask }],
        stream: false,
      }),
      // Give cron jobs a generous timeout (5 minutes)
      signal: AbortSignal.timeout(5 * 60 * 1000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new Error(
        `Chat API returned ${response.status}: ${errorBody.slice(0, 500)}`,
      );
    }

    // 4. Capture the response
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("text/event-stream") || contentType.includes("text/plain")) {
      // Streaming SSE response — collect all data lines
      output = await collectSSEContent(response);
    } else {
      // JSON response
      const json = await response.json();
      // The chat API may return { choices: [{ message: { content } }] } or
      // a plain { content } / { response } depending on the path taken.
      output = extractContentFromChatResponse(json);
    }

    success = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    error = msg;
    console.error(`[CronScheduler] Job "${job.name}" (${job.id}) failed:`, msg);
  }

  const duration = Math.round((Date.now() - startTime) / 1000); // seconds

  // 5. Save CronJobLog
  try {
    await (await getDb()).cronJobLog.create({
      data: {
        jobId: job.id,
        status: success ? "success" : "error",
        output: output.slice(0, 50_000), // cap output size
        error: error?.slice(0, 10_000),
        duration,
      },
    });
  } catch (err) {
    console.error(`[CronScheduler] Failed to save log for job ${job.id}:`, err);
  }

  // 6. Update the job
  const schedule = buildParsedScheduleFromJob(job);
  const newRepeatDone = job.repeatDone + 1;
  const newRunCount = job.runCount + 1;
  const reachedMax = job.repeatMax !== null && newRepeatDone >= job.repeatMax;

  const nextRun = reachedMax
    ? null
    : schedule
      ? computeNextRun(schedule, new Date(startTime))
      : null;

  const updateData: Record<string, unknown> = {
    lastRunAt: new Date(startTime),
    lastStatus: success ? "success" : "error",
    lastError: error ?? null,
    runCount: newRunCount,
    repeatDone: newRepeatDone,
    status: reachedMax ? "completed" : "scheduled",
    nextRunAt: nextRun,
  };

  // 7. If repeatMax reached, disable the job
  if (reachedMax) {
    updateData.isEnabled = false;
  }

  try {
    await (await getDb()).cronJob.update({ where: { id: job.id }, data: updateData });
  } catch (err) {
    console.error(`[CronScheduler] Failed to update job ${job.id}:`, err);
  }

  return { success, output, duration, error };
}

// ---------------------------------------------------------------------------
// 5. Tick Function
// ---------------------------------------------------------------------------

/** In-memory lock to prevent concurrent ticks. */
let tickLocked = false;

/**
 * Main scheduler tick — finds due jobs and executes them.
 *
 * Uses a simple in-memory lock to prevent concurrent execution.
 * Returns a TickResult with execution counts and per-job details.
 */
export async function tick(): Promise<TickResult> {
  const result: TickResult = {
    executed: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  // Acquire lock
  if (tickLocked) {
    console.log("[CronScheduler] Tick skipped — another tick is already running");
    result.skipped = 1;
    return result;
  }
  tickLocked = true;

  try {
    // 1. Find due jobs
    const dueJobs = await getDueJobs();

    if (dueJobs.length === 0) {
      return result;
    }

    console.log(`[CronScheduler] Tick: ${dueJobs.length} due job(s)`);

    // 2. For each job: advance nextRunAt (at-most-once), then execute
    for (const job of dueJobs) {
      try {
        // Advance nextRunAt before execution (at-most-once guarantee)
        const schedule = buildParsedScheduleFromJob(job);
        const nextRun = schedule
          ? computeNextRun(schedule, new Date())
          : null;

        await (await getDb()).cronJob
          .update({
            where: { id: job.id },
            data: {
              // For one-shot: clear nextRunAt (it was the current one)
              // For recurring: set to the next occurrence
              nextRunAt:
                schedule?.kind === "once" ? null : nextRun,
            },
          })
          .catch((err) => {
            console.error(
              `[CronScheduler] Failed to advance nextRunAt for job ${job.id}:`,
              err,
            );
          });

        // Execute the job
        const execResult = await executeJob(job);

        if (execResult.success) {
          result.executed++;
          result.details.push({
            jobId: job.id,
            jobName: job.name,
            status: "executed",
          });
        } else {
          result.errors++;
          result.details.push({
            jobId: job.id,
            jobName: job.name,
            status: "error",
            error: execResult.error,
          });
        }
      } catch (err) {
        // Never let one job failure crash the scheduler
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[CronScheduler] Unhandled error for job "${job.name}" (${job.id}):`,
          msg,
        );
        result.errors++;
        result.details.push({
          jobId: job.id,
          jobName: job.name,
          status: "error",
          error: msg,
        });
      }
    }
  } finally {
    tickLocked = false;
  }

  console.log(
    `[CronScheduler] Tick complete: ${result.executed} executed, ${result.errors} errors`,
  );
  return result;
}

// ---------------------------------------------------------------------------
// 6. Trigger Job
// ---------------------------------------------------------------------------

/**
 * Trigger a job to run immediately by setting its nextRunAt to now.
 *
 * @param jobId - The ID of the job to trigger.
 * @returns The updated job, or null if not found.
 */
export async function triggerJob(
  jobId: string,
): Promise<CronJobRow | null> {
  const now = new Date();

  try {
    const db = await getDb();
    const job = await db.cronJob.update({
      where: { id: jobId },
      data: {
        nextRunAt: now,
        isEnabled: true,
        status: "scheduled",
      },
    });
    console.log(
      `[CronScheduler] Job "${job.name}" (${jobId}) triggered to run at ${formatDateTime(now)}`,
    );
    return job as unknown as CronJobRow;
  } catch (err) {
    console.error(`[CronScheduler] Failed to trigger job ${jobId}:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cron Expression Parsing — 5-field standard cron
// ---------------------------------------------------------------------------

/**
 * A parsed cron field containing the set of valid values for that field.
 */
interface CronField {
  values: Set<number>;
  min: number;
  max: number;
}

/**
 * Check whether a string looks like a valid 5-field cron expression.
 * Does not validate field values — just checks structure.
 */
function isCronExpression(input: string): boolean {
  // 5 fields separated by spaces. Each field can contain digits, *, -, /, comma
  const parts = input.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const cronFieldPattern = /^[\d\*,\/\-]+$/;
  return parts.every((p) => cronFieldPattern.test(p));
}

/**
 * Parse a single cron field into a set of valid values.
 *
 * Supports: asterisk, specific values, ranges (1-5), steps (every Nth),
 * and comma-separated lists (1,3,5).
 */
function parseCronField(
  field: string,
  min: number,
  max: number,
): Set<number> {
  const values = new Set<number>();

  for (const part of field.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Handle step: <range>/<step>
    const stepParts = trimmed.split("/");
    const step = stepParts.length > 1 ? parseInt(stepParts[1], 10) : 1;

    if (isNaN(step) || step < 1) continue;

    // Handle range or wildcard
    const rangePart = stepParts[0];
    let rangeStart: number;
    let rangeEnd: number;

    if (rangePart === "*") {
      rangeStart = min;
      rangeEnd = max;
    } else if (rangePart.includes("-")) {
      const [startStr, endStr] = rangePart.split("-", 2);
      rangeStart = parseInt(startStr, 10);
      rangeEnd = parseInt(endStr, 10);
      if (isNaN(rangeStart) || isNaN(rangeEnd)) continue;
    } else {
      rangeStart = parseInt(rangePart, 10);
      rangeEnd = rangeStart;
      if (isNaN(rangeStart)) continue;
    }

    // Clamp to valid range
    rangeStart = Math.max(min, Math.min(max, rangeStart));
    rangeEnd = Math.max(min, Math.min(max, rangeEnd));

    // Generate values with step
    for (let v = rangeStart; v <= rangeEnd; v += step) {
      values.add(v);
    }
  }

  return values;
}

/**
 * Parse a full 5-field cron expression into individual CronField objects.
 *
 * Fields: minute, hour, day-of-month, month, day-of-week (0=Sunday).
 */
function parseCronExpression(expr: string): {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
} {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: expected 5 fields, got ${parts.length}`);
  }

  return {
    minute: { values: parseCronField(parts[0], 0, 59), min: 0, max: 59 },
    hour: { values: parseCronField(parts[1], 0, 23), min: 0, max: 23 },
    dayOfMonth: { values: parseCronField(parts[2], 1, 31), min: 1, max: 31 },
    month: { values: parseCronField(parts[3], 1, 12), min: 1, max: 12 },
    dayOfWeek: { values: parseCronField(parts[4], 0, 6), min: 0, max: 6 },
  };
}

/**
 * Compute the next occurrence of a cron expression.
 *
 * Algorithm: starting from now (or lastRunAt), iterate forward minute by
 * minute until a match is found. Uses smart field-level advancement for
 * efficiency.
 *
 * @param expr      - The 5-field cron expression.
 * @param lastRunAt - If provided, the next run must be after this time.
 * @returns The next Date matching the cron expression, or null if none found within 4 years.
 */
function getNextCronOccurrence(
  expr: string,
  lastRunAt?: Date | null,
): Date | null {
  const cron = parseCronExpression(expr);

  // Start searching from now or lastRunAt, rounded up to the next minute
  const base = lastRunAt && lastRunAt > new Date() ? lastRunAt : new Date();
  let candidate = new Date(base.getTime());
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1); // start from next minute

  // Maximum search window: 4 years (covers leap year edge cases)
  const maxTime = candidate.getTime() + 4 * 365.25 * 24 * 60 * 60 * 1000;

  // Iterate — advance month-by-month for efficiency
  while (candidate.getTime() <= maxTime) {
    // Check month
    if (!cron.month.values.has(candidate.getMonth() + 1)) {
      // Advance to next valid month
      advanceToNextInSet(candidate, cron.month, "month");
      candidate.setDate(1);
      candidate.setHours(0, 0, 0, 0);
      continue;
    }

    // Check day (either dayOfMonth or dayOfWeek must match)
    const domMatch = cron.dayOfMonth.values.has(candidate.getDate());
    const dowMatch = cron.dayOfWeek.values.has(candidate.getDay());
    if (!domMatch && !dowMatch) {
      // Advance one day
      candidate.setDate(candidate.getDate() + 1);
      candidate.setHours(0, 0, 0, 0);
      continue;
    }

    // Check hour
    if (!cron.hour.values.has(candidate.getHours())) {
      advanceToNextInSet(candidate, cron.hour, "hour");
      candidate.setMinutes(0, 0, 0);
      continue;
    }

    // Check minute
    if (!cron.minute.values.has(candidate.getMinutes())) {
      advanceToNextInSet(candidate, cron.minute, "minute");
      candidate.setSeconds(0, 0);
      continue;
    }

    // All fields match
    return candidate;
  }

  console.warn(`[CronScheduler] No cron occurrence found for "${expr}" within 4 years`);
  return null;
}

/**
 * Advance a Date to the next value in the given set for the specified field.
 * If the current value is at or past the max in the set, roll over to the next
 * higher unit and set the field to the minimum value in the set.
 */
function advanceToNextInSet(
  date: Date,
  field: CronField,
  unit: "minute" | "hour" | "month",
): void {
  const sorted = Array.from(field.values).sort((a, b) => a - b);
  let current: number;

  switch (unit) {
    case "minute":
      current = date.getMinutes();
      break;
    case "hour":
      current = date.getHours();
      break;
    case "month":
      current = date.getMonth() + 1;
      break;
  }

  // Find the next value greater than current
  const next = sorted.find((v) => v > current);
  if (next !== undefined) {
    // Set to next value within same higher unit
    switch (unit) {
      case "minute":
        date.setMinutes(next);
        break;
      case "hour":
        date.setHours(next);
        break;
      case "month":
        date.setMonth(next - 1);
        break;
    }
  } else {
    // Roll over: advance the higher unit and set to first value in set
    switch (unit) {
      case "minute":
        date.setMinutes(sorted[0]!);
        date.setHours(date.getHours() + 1);
        break;
      case "hour":
        date.setHours(sorted[0]!);
        date.setDate(date.getDate() + 1);
        break;
      case "month":
        date.setMonth(sorted[0]! - 1);
        date.setFullYear(date.getFullYear() + 1);
        break;
    }
  }
}

/**
 * Generate a human-readable description for a cron expression.
 */
function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;

  const [min, hour, dom, mon, dow] = parts;

  // Common patterns
  if (min === "0" && hour === "0" && dom === "*" && mon === "*" && dow === "*") {
    return "midnight daily";
  }
  if (
    min === "0" &&
    hour !== "*" &&
    dom === "*" &&
    mon === "*" &&
    dow === "*"
  ) {
    const h = parseInt(hour, 10);
    const ampm = h < 12 ? "AM" : "PM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:00 ${ampm} daily`;
  }
  if (dow === "1" && dom === "*" && mon === "*" && hour === "9" && min === "0") {
    return "9:00 AM on Mondays";
  }
  if (dow === "5" && dom === "*" && mon === "*" && hour === "9" && min === "0") {
    return "9:00 AM on Fridays";
  }
  if ((dow === "1" || dow === "5") && dom === "*" && mon === "*") {
    return "weekdays";
  }

  // Fallback: just describe the fields
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let desc = "";

  if (min === "*" && hour === "*") {
    desc = "every minute";
  } else if (hour === "*") {
    desc = `minute ${min}`;
  } else {
    const h = parseInt(hour, 10);
    const ampm = h < 12 ? "AM" : "PM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    desc = `${h12}:${min.padStart(2, "0")} ${ampm}`;
  }

  if (dow !== "*") {
    const days = dow.split(",").map((d) => dayNames[parseInt(d, 10) % 7]);
    desc += ` on ${days.join(", ")}`;
  }
  if (dom !== "*" && dom !== dow) {
    desc += ` on day ${dom}`;
  }
  if (mon !== "*") {
    const monthNames = [
      "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const months = mon.split(",").map((m) => monthNames[parseInt(m, 10)]);
    desc += ` in ${months.join(", ")}`;
  }

  return desc;
}

// ---------------------------------------------------------------------------
// 7. Scheduler Stats
// ---------------------------------------------------------------------------

/** Default tick interval in milliseconds (60 seconds). */
export const TICK_INTERVAL_MS = 60_000;

/** Scheduler statistics for health endpoint. */
export interface SchedulerStats {
  totalJobs: number;
  enabledJobs: number;
  dueJobs: number;
}

/**
 * Get basic scheduler statistics from the database.
 */
export async function getSchedulerStats(): Promise<SchedulerStats> {
  const now = new Date();
  const db = await getDb();
  const [totalJobs, enabledJobs, dueJobs] = await Promise.all([
    db.cronJob.count(),
    db.cronJob.count({ where: { isEnabled: true } }),
    db.cronJob.count({
      where: {
        isEnabled: true,
        nextRunAt: { lte: now },
        status: { not: "completed" },
      },
    }),
  ]);
  return { totalJobs, enabledJobs, dueJobs };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a numeric value + unit suffix to minutes.
 */
function durationToMinutes(value: number, unit: string): number {
  switch (unit.charAt(0)) {
    case "m":
      return value;
    case "h":
      return value * 60;
    case "d":
      return value * 24 * 60;
    default:
      return value;
  }
}

/**
 * Format a minutes count into a human-readable interval string.
 */
function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

/**
 * Format a Date for display.
 */
function formatDateTime(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Build a ParsedSchedule from a CronJobRow, using the stored schedule string.
 * Returns null if the schedule cannot be parsed (graceful degradation).
 */
function buildParsedScheduleFromJob(job: CronJobRow): ParsedSchedule | null {
  try {
    return parseSchedule(job.schedule);
  } catch (err) {
    console.warn(
      `[CronScheduler] Cannot parse schedule for job "${job.name}" (${job.id}): "${job.schedule}"`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Collect content from an SSE (Server-Sent Events) stream response.
 * Parses "data:" lines and extracts content deltas.
 */
async function collectSSEContent(response: Response): Promise<string> {
  const chunks: string[] = [];
  const text = await response.text();

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;

    const data = trimmed.slice(5).trim();
    if (data === "[DONE]") continue;

    try {
      const parsed = JSON.parse(data);
      // OpenAI streaming format: choices[0].delta.content
      const delta =
        parsed.choices?.[0]?.delta?.content ??
        parsed.content ??
        parsed.text ??
        "";
      if (delta) chunks.push(delta);
    } catch {
      // Non-JSON data line — append as-is if it looks like text
      if (data && !data.startsWith("{") && !data.startsWith("[")) {
        chunks.push(data);
      }
    }
  }

  return chunks.join("");
}

/**
 * Extract content from a non-streaming chat API JSON response.
 */
function extractContentFromChatResponse(json: Record<string, unknown>): string {
  // OpenAI format: { choices: [{ message: { content } }] }
  const choices = json.choices as
    | Array<{ message?: { content?: string }; delta?: { content?: string } }>
    | undefined;

  if (Array.isArray(choices) && choices.length > 0) {
    const msg = choices[0]?.message?.content;
    if (msg) return msg;
    const delta = choices[0]?.delta?.content;
    if (delta) return delta;
  }

  // Direct content field
  if (typeof json.content === "string") return json.content;
  if (typeof json.response === "string") return json.response;
  if (typeof json.output === "string") return json.output;
  if (typeof json.text === "string") return json.text;

  // Fallback: stringify
  return JSON.stringify(json, null, 2);
}
