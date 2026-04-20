import { PrismaClient } from '@prisma/client'

// Detect serverless / readonly environments (Vercel, etc.)
const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Create PrismaClient with environment-specific configuration.
 *
 * - Local dev: uses DATABASE_URL from .env (e.g. file:./db/custom.db)
 * - Vercel serverless: uses /tmp for SQLite (writable ephemeral storage)
 *   Falls back to in-memory SQLite if /tmp is not available.
 */
function createPrismaClient(): PrismaClient {
  if (IS_SERVERLESS) {
    // In serverless, override DATABASE_URL to use /tmp (the only writable dir)
    const tmpDbUrl = process.env.DATABASE_URL?.replace(/file:.*/, 'file:/tmp/prisma-dev.db')
      || 'file:/tmp/prisma-dev.db';
    return new PrismaClient({
      datasourceUrl: tmpDbUrl,
      log: [],
    });
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error'] : [],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

// Cache in global scope for hot-reload in development, and cold-start reuse in serverless
if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = db;
}

/**
 * Ensure the database schema is initialized.
 * In serverless environments, SQLite file may not exist on cold start,
 * so we run a lightweight schema push to create tables.
 *
 * This is idempotent and safe to call multiple times.
 */
let _schemaInitialized = false;

export async function ensureDbSchema(): Promise<void> {
  if (_schemaInitialized) return;

  try {
    // Try a simple query to check if tables exist
    await db.$queryRaw`SELECT count(*) FROM sqlite_master WHERE type='table'`;
    _schemaInitialized = true;
    return;
  } catch {
    // Tables don't exist yet — need to push schema
  }

  if (IS_SERVERLESS) {
    try {
      // In Vercel, use the Prisma SDK to push schema
      const { execSync } = await import('child_process');
      const tmpDbUrl = process.env.DATABASE_URL?.replace(/file:.*/, 'file:/tmp/prisma-dev.db')
        || 'file:/tmp/prisma-dev.db';
      execSync(`npx prisma db push --skip-generate --accept-data-loss`, {
        env: { ...process.env, DATABASE_URL: tmpDbUrl },
        stdio: 'pipe',
        timeout: 30000,
      });
      console.log('[DB] Schema initialized in /tmp');
    } catch (err) {
      console.warn('[DB] Schema push failed, will retry on next request:', 
        err instanceof Error ? err.message : String(err));
    }
  }

  _schemaInitialized = true;
}
