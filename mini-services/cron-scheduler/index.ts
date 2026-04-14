/**
 * Cron Scheduler Mini-Service
 *
 * Runs a background cron scheduler that periodically checks for due jobs
 * and executes them. Provides HTTP endpoints for health monitoring and
 * manual triggering.
 *
 * Port: 3031
 *
 * Imports the scheduler library directly from the main project
 * (Bun supports TypeScript imports from relative paths).
 */

import {
  tick,
  triggerJob,
  getSchedulerStats,
  TICK_INTERVAL_MS,
} from '../../src/lib/cron/scheduler';
import type { TickResult } from '../../src/lib/cron/scheduler';

// ─── Configuration ─────────────────────────────────────────────────────────

const PORT = 3031;

// ─── State ─────────────────────────────────────────────────────────────────

const startTime = Date.now();
let lastTickAt: string | null = null;
let jobsExecuted = 0;
let tickInProgress = false;
let tickIntervalId: ReturnType<typeof setInterval> | null = null;

// ─── Utility ───────────────────────────────────────────────────────────────

function uptimeSeconds(): number {
  return Math.floor((Date.now() - startTime) / 1000);
}

function nextTickInSeconds(): number {
  if (!tickIntervalId) return 0;
  if (!lastTickAt) return Math.floor(TICK_INTERVAL_MS / 1000);
  const lastTickTime = new Date(lastTickAt).getTime();
  const elapsed = Date.now() - lastTickTime;
  return Math.max(0, Math.floor((TICK_INTERVAL_MS - elapsed) / 1000));
}

function log(level: string, message: string): void {
  const ts = new Date().toISOString();
  switch (level) {
    case 'error':
      console.error(`[cron-svc ${ts}] ERROR: ${message}`);
      break;
    case 'warn':
      console.warn(`[cron-svc ${ts}] WARN: ${message}`);
      break;
    default:
      console.log(`[cron-svc ${ts}] ${level.toUpperCase()}: ${message}`);
  }
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Tick Logic ────────────────────────────────────────────────────────────

async function performTick(): Promise<TickResult> {
  if (tickInProgress) {
    log('tick', 'Tick already in progress, skipping');
    return { executed: 0, skipped: 1, errors: 0, details: [] };
  }

  tickInProgress = true;

  try {
    const result = await tick();
    jobsExecuted += result.executed;
    lastTickAt = new Date().toISOString();
    return result;
  } finally {
    tickInProgress = false;
  }
}

// ─── HTTP Handlers ─────────────────────────────────────────────────────────

async function handleHealth(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const stats = await getSchedulerStats();

    return jsonResponse({
      status: 'ok',
      uptime: uptimeSeconds(),
      lastTick: lastTickAt,
      jobsExecuted,
      nextTickIn: nextTickInSeconds(),
      stats: {
        totalJobs: stats.totalJobs,
        enabledJobs: stats.enabledJobs,
        dueJobs: stats.dueJobs,
      },
    });
  } catch (err) {
    log('error', `Health check failed: ${err instanceof Error ? err.message : String(err)}`);
    return jsonResponse({
      status: 'error',
      uptime: uptimeSeconds(),
      lastTick: lastTickAt,
      jobsExecuted,
      nextTickIn: nextTickInSeconds(),
      error: 'Failed to fetch scheduler stats',
    }, 503);
  }
}

async function handleTick(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  log('api', 'Manual tick requested');

  try {
    const result = await performTick();
    return jsonResponse({
      executed: result.executed,
      errors: result.errors,
      skipped: result.skipped,
      jobs: result.details.map((d) => ({
        jobId: d.jobId,
        jobName: d.jobName,
        status: d.status,
        error: d.error,
      })),
    });
  } catch (err) {
    log('error', `Manual tick failed: ${err instanceof Error ? err.message : String(err)}`);
    return jsonResponse({ error: 'Tick failed' }, 500);
  }
}

async function handleTrigger(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const url = new URL(request.url, `http://localhost:${PORT}`);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const jobId = pathParts[1]; // After /trigger/

  if (!jobId) {
    return jsonResponse({ error: 'Job ID is required' }, 400);
  }

  log('api', `Trigger requested for job ${jobId}`);

  try {
    const job = await triggerJob(jobId);
    if (!job) {
      return jsonResponse({ error: 'Job not found' }, 404);
    }

    return jsonResponse({
      id: job.id,
      name: job.name,
      schedule: job.schedule,
      enabled: job.isEnabled,
      status: job.status,
      nextRunAt: job.nextRunAt?.toISOString() || null,
    });
  } catch (err) {
    log('error', `Trigger failed for job ${jobId}: ${err instanceof Error ? err.message : String(err)}`);
    return jsonResponse({ error: 'Trigger failed' }, 500);
  }
}

function handleNotFound(): Response {
  return jsonResponse(
    { error: 'Not found', availableEndpoints: ['/health', '/tick', '/trigger/:jobId'] },
    404,
  );
}

// ─── Router ────────────────────────────────────────────────────────────────

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  try {
    if (pathname === '/health') {
      return await handleHealth(request);
    } else if (pathname === '/tick') {
      return await handleTick(request);
    } else if (pathname.startsWith('/trigger/')) {
      return await handleTrigger(request);
    } else {
      return handleNotFound();
    }
  } catch (err) {
    log('error', `Unhandled request error: ${err instanceof Error ? err.message : String(err)}`);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}

// ─── Server Startup ────────────────────────────────────────────────────────

function startServer(): void {
  const server = Bun.serve({
    port: PORT,
    fetch: handleRequest,
  });

  log('startup', `Cron Scheduler running on port ${PORT}`);
  log('startup', `Health: http://localhost:${PORT}/health`);
  log('startup', `Manual tick: POST http://localhost:${PORT}/tick`);
  log('startup', `Trigger job: POST http://localhost:${PORT}/trigger/:jobId`);

  // Start background tick interval
  log('startup', `Background tick interval: ${TICK_INTERVAL_MS / 1000}s`);

  // Perform an initial tick after a short delay to let the system warm up
  setTimeout(async () => {
    log('startup', 'Performing initial tick...');
    try {
      const result = await performTick();
      log('startup', `Initial tick complete: ${result.executed} jobs executed`);
    } catch (err) {
      log('error', `Initial tick failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, 5_000); // 5 second warm-up delay

  // Set up recurring tick
  tickIntervalId = setInterval(async () => {
    try {
      const result = await performTick();
      if (result.executed > 0) {
        log('tick', `Scheduled tick: ${result.executed} job(s) executed`);
      }
    } catch (err) {
      log('error', `Scheduled tick failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, TICK_INTERVAL_MS);

  // Graceful shutdown
  const shutdown = (signal: string) => {
    log('shutdown', `Received ${signal}, shutting down...`);
    if (tickIntervalId) {
      clearInterval(tickIntervalId);
      tickIntervalId = null;
    }
    server.stop();
    log('shutdown', 'Server stopped');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGHUP', () => shutdown('SIGHUP'));

  // Unhandled rejection handler — never crash
  process.on('unhandledRejection', (reason) => {
    log('error', `Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
  });

  // Uncaught exception handler — never crash
  process.on('uncaughtException', (err) => {
    log('error', `Uncaught exception: ${err instanceof Error ? err.message : String(err)}`);
  });
}

// ─── Start ─────────────────────────────────────────────────────────────────

startServer();
