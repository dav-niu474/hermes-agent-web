/**
 * Cron Client — Server-side wrapper for cron job management.
 *
 * Provides a simple API for creating, listing, and deleting cron jobs
 * via the cron tool system. This module is used by the chat route's
 * ToolRegistryAdapter (handleCronjob).
 *
 * All create operations go through the same schedule-parsing pipeline
 * as the REST API (POST /api/cronjobs) so that scheduleKind, scheduleExpr,
 * nextRunAt, and repeatMax are always set correctly.
 */

import { parseSchedule, computeNextRun } from "@/lib/cron/scheduler";

async function getDb() {
  const { db } = await import('@/lib/db');
  return db;
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface CreateCronJobParams {
  name: string;
  schedule: string;
  task: string;
  repeat?: number;
}

interface UpdateCronJobParams {
  id: string;
  name?: string;
  schedule?: string;
  task?: string;
  repeat?: number;
}

interface CronJobInfo {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  status: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  repeatMax: number | null;
  repeatDone: number;
}

// ─── List ───────────────────────────────────────────────────────────────────

/**
 * List all cron jobs from the database.
 */
export async function listCronJobs(): Promise<CronJobInfo[]> {
  try {
    const db = await getDb();
    const jobs = await db.cronJob.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return jobs.map(toJobInfo);
  } catch {
    return [];
  }
}

// ─── Create ─────────────────────────────────────────────────────────────────

/**
 * Create a new cron job with proper schedule parsing.
 *
 * This mirrors the logic in POST /api/cronjobs so that:
 *   - scheduleKind is set correctly (once / interval / cron)
 *   - scheduleExpr is computed
 *   - nextRunAt is always set (jobs are immediately schedulable)
 *   - repeatMax defaults: 1 for one-shot, null (forever) for recurring
 *   - task is stored as plain text (NOT wrapped in JSON)
 */
export async function createCronJob(
  params: CreateCronJobParams,
): Promise<CronJobInfo> {
  const { name, schedule: rawSchedule, task, repeat } = params;

  // Parse schedule → derive scheduleKind, scheduleExpr, nextRunAt, repeatMax
  const parsed = parseSchedule(rawSchedule.trim());

  const scheduleKind = parsed.kind;
  const scheduleExpr =
    parsed.kind === 'cron'
      ? parsed.expr
      : parsed.kind === 'interval'
        ? String(parsed.minutes)
        : null;

  const nextRunAt = computeNextRun(parsed);

  // repeatMax: respect explicit value, otherwise default per kind
  const repeatMax = repeat !== undefined
    ? repeat
    : parsed.kind === 'once'
      ? 1
      : null;

  const db = await getDb();
  const job = await db.cronJob.create({
    data: {
      name: name.trim(),
      schedule: rawSchedule.trim(),
      scheduleKind,
      scheduleExpr,
      task: task.trim(),               // plain text — NOT JSON-wrapped
      isEnabled: true,
      status: 'scheduled',
      repeatMax,
      repeatDone: 0,
      nextRunAt,
      lastStatus: null,
      lastError: null,
      runCount: 0,
    },
  });

  return toJobInfo(job);
}

// ─── Update ─────────────────────────────────────────────────────────────────

/**
 * Update an existing cron job.
 *
 * If schedule changes, re-parses it and recomputes nextRunAt.
 */
export async function updateCronJob(
  params: UpdateCronJobParams,
): Promise<CronJobInfo> {
  const { id } = params;

  const db = await getDb();
  const existing = await db.cronJob.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`Cron job ${id} not found`);
  }

  const data: Record<string, unknown> = {};

  if (params.name !== undefined) {
    data.name = params.name.trim();
  }

  if (params.task !== undefined) {
    data.task = params.task.trim();
  }

  if (params.schedule !== undefined) {
    const parsed = parseSchedule(params.schedule.trim());
    data.schedule = params.schedule.trim();
    data.scheduleKind = parsed.kind;
    data.scheduleExpr =
      parsed.kind === 'cron'
        ? parsed.expr
        : parsed.kind === 'interval'
          ? String(parsed.minutes)
          : null;
    data.nextRunAt = computeNextRun(parsed, existing.lastRunAt);
  }

  if (params.repeat !== undefined) {
    data.repeatMax = params.repeat === null ? null : Number(params.repeat);
  }

  const updated = await db.cronJob.update({ where: { id }, data });
  return toJobInfo(updated);
}

// ─── Pause / Resume ─────────────────────────────────────────────────────────

/**
 * Pause a cron job (disable + set status).
 */
export async function pauseCronJob(jobId: string): Promise<CronJobInfo> {
  const db = await getDb();
  const job = await db.cronJob.update({
    where: { id: jobId },
    data: {
      isEnabled: false,
      status: 'paused',
      nextRunAt: null,
    },
  });
  return toJobInfo(job);
}

/**
 * Resume a paused cron job (enable + recompute nextRunAt).
 */
export async function resumeCronJob(jobId: string): Promise<CronJobInfo> {
  const db = await getDb();
  const existing = await db.cronJob.findUnique({ where: { id: jobId } });
  if (!existing) {
    throw new Error(`Cron job ${jobId} not found`);
  }

  // Recompute nextRunAt from stored schedule
  let nextRunAt: Date | null = null;
  try {
    const parsed = parseSchedule(existing.schedule);
    nextRunAt = computeNextRun(parsed, existing.lastRunAt);
  } catch {
    // If schedule can't be parsed, leave null
  }

  const job = await db.cronJob.update({
    where: { id: jobId },
    data: {
      isEnabled: true,
      status: 'scheduled',
      nextRunAt,
    },
  });
  return toJobInfo(job);
}

// ─── Trigger (Run Now) ──────────────────────────────────────────────────────

/**
 * Trigger a job to run immediately by setting nextRunAt to now.
 */
export async function triggerCronJob(jobId: string): Promise<CronJobInfo> {
  const { triggerJob } = await import('@/lib/cron/scheduler');
  const job = await triggerJob(jobId);
  if (!job) {
    throw new Error(`Cron job ${jobId} not found`);
  }
  return toJobInfo(job);
}

// ─── Delete ─────────────────────────────────────────────────────────────────

/**
 * Delete a cron job by ID.
 */
export async function deleteCronJob(jobId: string): Promise<void> {
  await (await getDb()).cronJob.delete({ where: { id: jobId } });
}

// ─── Helper ─────────────────────────────────────────────────────────────────

function toJobInfo(job: any): CronJobInfo {
  return {
    id: job.id,
    name: job.name,
    schedule: job.schedule,
    enabled: job.isEnabled,
    status: job.status || 'scheduled',
    lastRunAt: job.lastRunAt?.toISOString() || null,
    nextRunAt: job.nextRunAt?.toISOString() || null,
    runCount: job.runCount || 0,
    repeatMax: job.repeatMax,
    repeatDone: job.repeatDone || 0,
  };
}
