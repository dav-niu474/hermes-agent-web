import { NextRequest, NextResponse } from 'next/server';
import { modalSandbox } from '@/lib/hermes/modal-sandbox';

/**
 * GET /api/sandbox — Check Modal sandbox status and health
 *
 * Returns configuration, connection status, and optional test execution result.
 * Query params:
 *   - test=true : Run a quick test command ("echo hello") in the sandbox
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shouldTest = searchParams.get('test') === 'true';

    const config = modalSandbox.getConfig();
    const status = modalSandbox.getStatus();

    let testResult: {
      success: boolean;
      output?: string;
      error?: string;
      latencyMs?: number;
    } | null = null;

    // Run a quick test if requested
    if (shouldTest && config) {
      const startTime = Date.now();
      try {
        const result = await modalSandbox.execute('echo "hello from sandbox"', 15);
        const latency = Date.now() - startTime;
        testResult = {
          success: result.exitCode === 0,
          output: result.stdout || undefined,
          error: result.stderr || undefined,
          latencyMs: latency,
        };
      } catch (err: any) {
        testResult = {
          success: false,
          error: err instanceof Error ? err.message : String(err),
          latencyMs: Date.now() - startTime,
        };
      }
    }

    return NextResponse.json({
      status: 'ok',
      sandbox: {
        configured: !!config,
        initialized: status.initialized,
        sandboxId: status.sandboxId,
        execCount: status.execCount,
        lastActivity: status.lastActivity,
        provisioned: status.execCount > 0,
        config: config ? {
          appName: config.appName,
          image: config.image,
          cpu: config.cpu,
          memory: config.memory,
          idleTimeout: config.idleTimeout,
          hasTokenId: !!config.tokenId,
          hasTokenSecret: !!config.tokenSecret,
        } : null,
      },
      testResult,
      environment: {
        isVercel: !!process.env.VERCEL,
        hasModalTokenId: !!process.env.MODAL_TOKEN_ID,
        hasModalTokenSecret: !!process.env.MODAL_TOKEN_SECRET,
        nodeEnv: process.env.NODE_ENV || 'development',
      },
    });
  } catch (err: any) {
    console.error('[API/sandbox] Error:', err);
    return NextResponse.json({
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}

/**
 * POST /api/sandbox — Execute a command in the Modal sandbox
 *
 * Body:
 *   - command: string (required) — Shell command to execute
 *   - timeout?: number — Max execution time in seconds (default: 60)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const command = String(body.command ?? '').trim();
    const timeout = Math.min(300, Math.max(5, Number(body.timeout) || 60));

    if (!command) {
      return NextResponse.json({
        error: 'Missing required parameter: command',
      }, { status: 400 });
    }

    const config = modalSandbox.getConfig();
    if (!config) {
      return NextResponse.json({
        error: 'Modal sandbox not configured. Set MODAL_TOKEN_ID and MODAL_TOKEN_SECRET in environment variables.',
        configured: false,
      }, { status: 400 });
    }

    const startTime = Date.now();
    const result = await modalSandbox.execute(command, timeout);
    const latencyMs = Date.now() - startTime;

    return NextResponse.json({
      success: result.exitCode === 0,
      stdout: result.stdout || undefined,
      stderr: result.stderr || undefined,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      latencyMs,
      sandboxId: result.exitCode === 0 ? modalSandbox.getStatus().sandboxId : undefined,
    });
  } catch (err: any) {
    console.error('[API/sandbox] Exec error:', err);
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
