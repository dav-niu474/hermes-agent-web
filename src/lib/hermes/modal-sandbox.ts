/**
 * Modal Sandbox Manager — Cloud-based gVisor sandbox via Modal (modal.com)
 *
 * Provides a serverless, isolated container environment for terminal command execution.
 * Manages sandbox lifecycle (create → execute → cleanup) with idle timeout tracking.
 *
 * Uses the official Modal JS SDK (modal npm package) API:
 *   - ModalClient → apps.fromName() → sandboxes.create()
 *   - sandbox.exec(['bash', '-c', cmd]) → ContainerProcess
 *   - process.stdout.readText() / process.stderr.readText()
 *
 * Server-side only. Import from API routes or registered-tools.
 */

import { loadConfig } from './config';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ModalSandboxConfig {
  /** Modal Token ID (from modal.com/settings) */
  tokenId: string;
  /** Modal Token Secret */
  tokenSecret: string;
  /** Container image (default: "python:3.11-slim") */
  image: string;
  /** CPU cores (0.25–8, default: 1) */
  cpu: number;
  /** Memory in MB (64–8192, default: 512) */
  memory: number;
  /** Idle timeout in seconds (default: 300). Sandbox auto-stops after inactivity. */
  idleTimeout: number;
  /** App name in Modal (default: "hermes-sandbox") */
  appName: string;
  /** Shell command to run after sandbox creation for provisioning (default: install git, curl, etc.) */
  setupCommand: string;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

interface SandboxState {
  /** Whether the ModalClient is initialized */
  initialized: boolean;
  /** Active sandbox instance (if running) */
  sandbox: any | null;
  /** Last activity timestamp */
  lastActivity: number;
  /** Idle cleanup timer */
  idleTimer: ReturnType<typeof setTimeout> | null;
  /** Execution counter for this sandbox */
  execCount: number;
  /** Whether the sandbox has been provisioned (setupCommand executed) */
  provisioned: boolean;
}

// ─── Singleton Manager ─────────────────────────────────────────────────────

class ModalSandboxManager {
  private state: SandboxState = {
    initialized: false,
    sandbox: null,
    lastActivity: Date.now(),
    idleTimer: null,
    execCount: 0,
    provisioned: false,
  };

  private config: ModalSandboxConfig | null = null;
  /** ModalClient instance */
  private client: any = null;
  /** Modal App instance (lazy-created) */
  private app: any = null;

  // ── Config resolution ──────────────────────────────────────────────

  /**
   * Resolve Modal configuration from:
   *   1. Environment variables (MODAL_TOKEN_ID, MODAL_TOKEN_SECRET)
   *   2. Hermes config.yaml (terminal.modal section)
   */
  private resolveConfig(): ModalSandboxConfig | null {
    const tokenId = process.env.MODAL_TOKEN_ID || '';
    const tokenSecret = process.env.MODAL_TOKEN_SECRET || '';

    const hermesConfig = loadConfig();
    const modalCfg = (hermesConfig.terminal as Record<string, unknown>)?.modal as Record<string, unknown> | undefined;

    const resolvedTokenId = tokenId || (modalCfg?.token_id as string) || '';
    const resolvedTokenSecret = tokenSecret || (modalCfg?.token_secret as string) || '';

    if (!resolvedTokenId || !resolvedTokenSecret) {
      return null;
    }

    return {
      tokenId: resolvedTokenId,
      tokenSecret: resolvedTokenSecret,
      image: (modalCfg?.image as string) || 'python:3.11-slim',
      cpu: Math.min(8, Math.max(0.25, Number(modalCfg?.cpu) || 1)),
      memory: Math.min(8192, Math.max(64, Number(modalCfg?.memory) || 512)),
      idleTimeout: Math.min(3600, Math.max(30, Number(modalCfg?.idle_timeout) || 300)),
      appName: (modalCfg?.app_name as string) || 'hermes-sandbox',
      setupCommand: (modalCfg?.setup_command as string) || 'apt-get update -qq && apt-get install -y -qq git curl wget jq zip unzip tree 2>/dev/null || pip install --quiet httpx 2>/dev/null; echo "Setup complete"',
    };
  }

  // ── Initialization ─────────────────────────────────────────────────

  /**
   * Initialize the Modal client. Must be called before execute().
   * Returns true on success, false if credentials are missing or init fails.
   */
  async initialize(): Promise<boolean> {
    if (this.state.initialized && this.client) {
      return true;
    }

    const config = this.resolveConfig();
    if (!config) {
      console.warn('[ModalSandbox] Missing MODAL_TOKEN_ID or MODAL_TOKEN_SECRET');
      return false;
    }

    this.config = config;

    try {
      // Dynamic import of Modal JS SDK
      const { ModalClient } = await import('modal');

      this.client = new ModalClient({
        tokenId: config.tokenId,
        tokenSecret: config.tokenSecret,
      });

      // Pre-resolve the App (creates if not exists)
      this.app = await this.client.apps.fromName(config.appName, {
        createIfMissing: true,
      });

      this.state.initialized = true;
      console.log(`[ModalSandbox] Initialized — app=${config.appName}, image=${config.image}, cpu=${config.cpu}, mem=${config.memory}MB`);
      return true;
    } catch (err) {
      console.error('[ModalSandbox] Failed to initialize:', err);
      this.state.initialized = false;
      this.client = null;
      this.app = null;
      return false;
    }
  }

  // ── Sandbox lifecycle ──────────────────────────────────────────────

  /**
   * Ensure a sandbox instance is running. Creates a new one if needed.
   */
  private async ensureSandbox(): Promise<any | null> {
    if (!this.client || !this.app) {
      console.error('[ModalSandbox] Not initialized');
      return null;
    }

    // Check if existing sandbox is still alive
    if (this.state.sandbox) {
      try {
        // Quick check: try to get sandboxId from the existing instance
        const sandboxId = this.state.sandbox.sandboxId;
        if (sandboxId) {
          this.resetIdleTimer();
          return this.state.sandbox;
        }
      } catch {
        // Sandbox object might be stale
        this.state.sandbox = null;
      }
    }

    try {
      console.log('[ModalSandbox] Creating new sandbox...');

      // Get the container image from Modal's registry
      const image = this.client.images.fromRegistry(this.config!.image);

      // Create sandbox with configured resources
      const sandbox = await this.client.sandboxes.create(this.app, image, {
        cpu: this.config!.cpu,
        memoryMiB: this.config!.memory,
        timeoutMs: (this.config!.idleTimeout + 60) * 1000, // lifetime > idle timeout
        idleTimeoutMs: this.config!.idleTimeout * 1000,
        // Keep sandbox alive with sleep command
        command: ['sleep', 'infinity'],
      });

      this.state.sandbox = sandbox;
      this.state.execCount = 0;
      this.state.lastActivity = Date.now();
      this.state.provisioned = false;
      this.resetIdleTimer();

      console.log(`[ModalSandbox] Sandbox created: ${sandbox.sandboxId}`);

      // Run setup/provisioning command on fresh sandbox
      await this.provisionSandbox();

      return sandbox;
    } catch (err) {
      console.error('[ModalSandbox] Failed to create sandbox:', err);
      return null;
    }
  }

  /**
   * Run setup command to provision the sandbox with common dev tools.
   * Only runs once per sandbox instance.
   */
  private async provisionSandbox(): Promise<void> {
    if (this.state.provisioned || !this.config?.setupCommand || !this.state.sandbox) return;

    try {
      console.log('[ModalSandbox] Running provisioning setup command...');
      const proc = await this.state.sandbox.exec(
        ['bash', '-c', this.config.setupCommand],
        { timeoutMs: 120_000 },
      );
      const exitCode = await proc.wait();
      this.state.provisioned = true;
      console.log(`[ModalSandbox] Provisioning complete (exit ${exitCode})`);
    } catch (err) {
      // Provisioning failure is non-fatal — log but continue
      console.warn('[ModalSandbox] Provisioning failed (non-fatal):', err);
      this.state.provisioned = true; // Don't retry
    }
  }

  /**
   * Reset the idle timer. Called on every successful execution.
   */
  private resetIdleTimer(): void {
    if (this.state.idleTimer) {
      clearTimeout(this.state.idleTimer);
    }
    this.state.lastActivity = Date.now();

    const timeout = this.config?.idleTimeout || 300;
    this.state.idleTimer = setTimeout(() => {
      console.log(`[ModalSandbox] Idle timeout (${timeout}s) — stopping sandbox`);
      this.stop();
    }, timeout * 1000);
  }

  /**
   * Stop the active sandbox and clean up resources.
   */
  async stop(): Promise<void> {
    if (this.state.idleTimer) {
      clearTimeout(this.state.idleTimer);
      this.state.idleTimer = null;
    }

    if (this.state.sandbox) {
      try {
        await this.state.sandbox.terminate();
        console.log(`[ModalSandbox] Sandbox terminated`);
      } catch (err) {
        console.warn('[ModalSandbox] Error terminating sandbox:', err);
      }
    }

    this.state.sandbox = null;
    this.state.execCount = 0;
    this.state.provisioned = false;
  }

  /**
   * Close the Modal client and release all resources.
   */
  async close(): Promise<void> {
    await this.stop();
    if (this.client) {
      try {
        this.client.close();
      } catch (err) {
        console.warn('[ModalSandbox] Error closing client:', err);
      }
      this.client = null;
      this.app = null;
    }
    this.state.initialized = false;
  }

  // ── Command execution ──────────────────────────────────────────────

  /**
   * Execute a shell command in the Modal sandbox.
   *
   * @param command - Shell command to execute
   * @param timeout - Max execution time in seconds (default: 60, max: 300)
   * @returns ExecResult with stdout, stderr, exitCode
   */
  async execute(command: string, timeout: number = 60): Promise<ExecResult> {
    if (!this.state.initialized) {
      const ok = await this.initialize();
      if (!ok) {
        return {
          stdout: '',
          stderr: 'Modal sandbox not configured. Set MODAL_TOKEN_ID and MODAL_TOKEN_SECRET in environment variables.',
          exitCode: 1,
          timedOut: false,
        };
      }
    }

    const sandbox = await this.ensureSandbox();
    if (!sandbox) {
      return {
        stdout: '',
        stderr: 'Failed to create Modal sandbox. Check credentials and network connectivity.',
        exitCode: 1,
        timedOut: false,
      };
    }

    const effectiveTimeoutMs = Math.min(300, Math.max(5, timeout)) * 1000;

    try {
      this.state.execCount++;
      const cmdPreview = command.length > 100 ? command.slice(0, 100) + '...' : command;
      console.log(`[ModalSandbox] Exec #${this.state.execCount} in ${sandbox.sandboxId}: ${cmdPreview}`);

      // Execute command via sandbox.exec() — takes string array, not a single string
      const proc = await sandbox.exec(
        ['bash', '-c', command],
        {
          timeoutMs: effectiveTimeoutMs,
          mode: 'text',
        },
      );

      // Read stdout and stderr concurrently, then wait for exit code
      const [stdout, stderr, exitCode] = await Promise.all([
        proc.stdout.readText().catch(() => ''),
        proc.stderr.readText().catch(() => ''),
        proc.wait().catch((err: any) => {
          if (err?.message?.includes('timeout') || err?.message?.includes('Timeout')) {
            return 124;
          }
          return 1;
        }),
      ]);

      this.resetIdleTimer();

      return {
        stdout: stdout.trimEnd(),
        stderr: stderr.trimEnd(),
        exitCode: typeof exitCode === 'number' ? exitCode : 1,
        timedOut: exitCode === 124,
      };
    } catch (err: any) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[ModalSandbox] Exec error: ${errMsg}`);

      // Handle timeout from SDK
      if (err.name === 'SandboxTimeoutError' || errMsg.includes('timeout') || errMsg.includes('Timeout')) {
        return {
          stdout: '',
          stderr: `Command timed out after ${timeout}s`,
          exitCode: 124,
          timedOut: true,
        };
      }

      // Sandbox might have expired — reset and retry once
      if (errMsg.includes('not found') || errMsg.includes('stopped') || errMsg.includes('expired') || errMsg.includes('SandboxTimeoutError')) {
        console.warn('[ModalSandbox] Sandbox expired, creating new one...');
        this.state.sandbox = null;

        const retrySandbox = await this.ensureSandbox();
        if (retrySandbox) {
          try {
            const proc = await retrySandbox.exec(
              ['bash', '-c', command],
              { timeoutMs: effectiveTimeoutMs, mode: 'text' },
            );
            const [stdout, stderr, exitCode] = await Promise.all([
              proc.stdout.readText().catch(() => ''),
              proc.stderr.readText().catch(() => ''),
              proc.wait().catch(() => 1),
            ]);
            return {
              stdout: stdout.trimEnd(),
              stderr: stderr.trimEnd(),
              exitCode: typeof exitCode === 'number' ? exitCode : 1,
              timedOut: false,
            };
          } catch (retryErr: any) {
            return {
              stdout: '',
              stderr: `Modal sandbox retry failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`,
              exitCode: 1,
              timedOut: false,
            };
          }
        }
      }

      return {
        stdout: '',
        stderr: errMsg || 'Modal sandbox execution failed',
        exitCode: 1,
        timedOut: false,
      };
    }
  }

  // ── File operations ────────────────────────────────────────────────

  /**
   * Write a file to the sandbox filesystem.
   */
  async writeFile(remotePath: string, content: string): Promise<boolean> {
    if (!this.state.initialized) {
      const ok = await this.initialize();
      if (!ok) return false;
    }

    const sandbox = await this.ensureSandbox();
    if (!sandbox) return false;

    try {
      // Use sandbox.exec to write file content via heredoc
      // The 'HERMES_EOF' delimiter is quoted to prevent variable expansion
      const writeCmd = `cat > '${remotePath}' << 'HERMES_EOF'\n${content}\nHERMES_EOF`;
      const proc = await sandbox.exec(['bash', '-c', writeCmd], { timeoutMs: 30_000, mode: 'text' });
      await proc.wait();
      this.resetIdleTimer();
      return true;
    } catch (err) {
      console.error(`[ModalSandbox] writeFile failed for ${remotePath}:`, err);
      return false;
    }
  }

  /**
   * Read a file from the sandbox filesystem.
   */
  async readFile(remotePath: string): Promise<string | null> {
    if (!this.state.initialized) {
      const ok = await this.initialize();
      if (!ok) return null;
    }

    const sandbox = await this.ensureSandbox();
    if (!sandbox) return null;

    try {
      const proc = await sandbox.exec(['bash', '-c', `cat '${remotePath}'`], { timeoutMs: 15_000, mode: 'text' });
      const stdout = await proc.stdout.readText();
      this.resetIdleTimer();
      // Return content as-is; empty string means empty file, null means read failed (caught below)
      return stdout;
    } catch (err) {
      console.error(`[ModalSandbox] readFile failed for ${remotePath}:`, err);
      return null;
    }
  }

  // ── Status / Info ──────────────────────────────────────────────────

  /**
   * Check if Modal sandbox is available and configured.
   */
  isAvailable(): boolean {
    return !!this.resolveConfig();
  }

  /**
   * Get current sandbox status.
   */
  getStatus(): {
    initialized: boolean;
    sandboxId: string | null;
    execCount: number;
    lastActivity: number;
    idleTimeout: number;
    config: ModalSandboxConfig | null;
  } {
    return {
      initialized: this.state.initialized,
      sandboxId: this.state.sandbox?.sandboxId || null,
      execCount: this.state.execCount,
      lastActivity: this.state.lastActivity,
      idleTimeout: this.config?.idleTimeout || 300,
      config: this.config,
    };
  }

  /**
   * Get the singleton instance's config (for UI display).
   */
  getConfig(): ModalSandboxConfig | null {
    return this.resolveConfig();
  }
}

// ─── Export singleton ──────────────────────────────────────────────────────

export const modalSandbox = new ModalSandboxManager();
