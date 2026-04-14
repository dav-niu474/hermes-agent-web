/**
 * Cron Client — Server-side wrapper for cron job management.
 *
 * Provides a simple API for creating, listing, and deleting cron jobs
 * via the cron tool system. This module is used by registered-tools.ts
 * and the chat route's ToolRegistryAdapter.
 */

import { db } from '@/lib/db';

interface CreateCronJobParams {
  name: string;
  schedule: string;
  task: string;
}

interface CronJobInfo {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

/**
 * List all cron jobs from the database.
 */
export async function listCronJobs(): Promise<CronJobInfo[]> {
  try {
    const jobs = await db.cronJob.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return jobs.map((j) => ({
      id: j.id,
      name: j.name,
      schedule: j.schedule,
      enabled: j.isEnabled,
      lastRunAt: j.lastRunAt?.toISOString() || null,
      nextRunAt: j.nextRunAt?.toISOString() || null,
    }));
  } catch {
    return [];
  }
}

/**
 * Create a new cron job.
 */
export async function createCronJob(
  params: CreateCronJobParams,
): Promise<CronJobInfo> {
  const { name, schedule, task } = params;

  const job = await db.cronJob.create({
    data: {
      name,
      schedule,
      task: JSON.stringify({ kind: 'agentTurn', message: task }),
      isEnabled: true,
    },
  });

  return {
    id: job.id,
    name: job.name,
    schedule: job.schedule,
    enabled: job.isEnabled,
    lastRunAt: job.lastRunAt?.toISOString() || null,
    nextRunAt: job.nextRunAt?.toISOString() || null,
  };
}

/**
 * Get a single cron job by ID.
 */
export async function getCronJob(jobId: string): Promise<CronJobInfo | null> {
  const job = await db.cronJob.findUnique({ where: { id: jobId } });
  if (!job) return null;

  return {
    id: job.id,
    name: job.name,
    schedule: job.schedule,
    enabled: job.isEnabled,
    lastRunAt: job.lastRunAt?.toISOString() || null,
    nextRunAt: job.nextRunAt?.toISOString() || null,
  };
}

/**
 * Delete a cron job by ID.
 */
export async function deleteCronJob(jobId: string): Promise<void> {
  await db.cronJob.delete({ where: { id: jobId } });
}
