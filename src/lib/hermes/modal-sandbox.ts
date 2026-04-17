/**
 * Modal Sandbox Manager — Cloud-based gVisor sandbox via Modal (modal.com)
 *
 * Provides a serverless, isolated container environment for terminal command execution.
 * Manages sandbox lifecycle (create → execute → cleanup) with idle timeout tracking.
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

interface SandboxState {
  /** Whether the sandbox client is initialized */
  initialized: boolean;
  /** Active sandbox ID (if running) */
  sandboxId: string | null;
  /** Last activity timestamp */
  lastActivity: number;
  /** Idle cleanup timer */
  idleTimer: ReturnType<typeof setTimeout> | null;
  /** Execution counter for this sandbox */
  execCount: number;
  /** Whether the sandbox has been provisioned (setupCommand executed) */
  provisioned: boolean;
}

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

// ─── Singleton Manager ─────────────────────────────────────────────────────

class ModalSandboxManager {
  private state: SandboxState = {
    initialized: false,
    sandboxId: null,
    lastActivity: Date.now(),
    idleTimer: null,
    execCount: 0,
    provisioned: false,
  };

  private config: ModalSandboxConfig | null = null;
  private modalClient: any = null;

  // ── Config resolution ──────────────────────────────────────────────

  /**
   * Resolve Modal configuration from:
   *   1. Environment variables (MODAL_TOKEN_ID, MODAL_TOKEN_SECRET)
   *   2. Hermes config.yaml (terminal.modal section)
   */
  private resolveConfig(): ModalSandboxConfig | null {
    // Check for token credentials first
    const tokenId = process.env.MODAL_TOKEN_ID || '';
    const tokenSecret = process.env.MODAL_TOKEN_SECRET || '';

    // Also check Hermes config for modal section
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
    if (this.state.initialized && this.modalClient) {
      return true;
    }

    const config = this.resolveConfig();
    if (!config) {
      console.warn('[ModalSandbox] Missing MODAL_TOKEN_ID or MODAL_TOKEN_SECRET');
      return false;
    }

    this.config = config;

    try {
      // Dynamic import of modal SDK
      const { Sandbox } = await import('modal');

      this.modalClient = new Sandbox({
        tokenId: config.tokenId,
        tokenSecret: config.tokenSecret,
      });

      this.state.initialized = true;
      console.log(`[ModalSandbox] Initialized — app=${config.appName}, image=${config.image}, cpu=${config.cpu}, mem=${config.memory}MB`);
      return true;
    } catch (err) {
      console.error('[ModalSandbox] Failed to initialize:', err);
      this.state.initialized = false;
      return false;
    }
  }

  // ── Sandbox lifecycle ──────────────────────────────────────────────

  /**
   * Ensure a sandbox is running. Creates a new one if needed.
   */
  private async ensureSandbox(): Promise<string | null> {
    if (!this.modalClient) {
      console.error('[ModalSandbox] Not initialized');
      return null;
    }

    // Check if existing sandbox is still alive
    if (this.state.sandboxId) {
      this.resetIdleTimer();
      return this.state.sandboxId;
    }

    try {
      console.log('[ModalSandbox] Creating new sandbox...');

      // Create sandbox via Modal's interactive API
      const sandbox = await this.modalClient.interactive.launch(
        this.config!.image,
        {
          cpu: this.config!.cpu,
          memory: this.config!.memory,
        },
      );

      const sandboxId = typeof sandbox === 'string' ? sandbox : sandbox?.id || `modal-${Date.now()}`;
      this.state.sandboxId = sandboxId;
      this.state.execCount = 0;
      this.state.lastActivity = Date.now();
      this.state.provisioned = false;
      this.resetIdleTimer();

      console.log(`[ModalSandbox] Sandbox created: ${sandboxId}`);

      // Run setup/provisioning command on fresh sandbox
      await this.provisionSandbox(sandboxId);

      return sandboxId;
    } catch (err) {
      console.error('[ModalSandbox] Failed to create sandbox:', err);
      return null;
    }
  }

  /**
   * Run setup command to provision the sandbox with common dev tools.
   * Only runs once per sandbox instance.
   */
  private async provisionSandbox(sandboxId: string): Promise<void> {
    if (this.state.provisioned || !this.config?.setupCommand) return;

    try {
      console.log('[ModalSandbox] Running provisioning setup command...');
      await this.modalClient.interactive.exec(sandboxId, this.config.setupCommand, { timeout: 120000 });
      this.state.provisioned = true;
      console.log('[ModalSandbox] Provisioning complete');
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

    if (this.state.sandboxId && this.modalClient) {
      try {
        await this.modalClient.stop(this.state.sandboxId);
        console.log(`[ModalSandbox] Sandbox stopped: ${this.state.sandboxId}`);
      } catch (err) {
        console.warn('[ModalSandbox] Error stopping sandbox:', err);
      }
    }

    this.state.sandboxId = null;
    this.state.execCount = 0;
    this.state.provisioned = false;
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
          stderr: 'Modal sandbox not configured. Set MODAL_TOKEN_ID and MODAL_TOKEN_SECRET in ~/.hermes/.env or system environment.',
          exitCode: 1,
          timedOut: false,
        };
      }
    }

    const sandboxId = await this.ensureSandbox();
    if (!sandboxId) {
      return {
        stdout: '',
        stderr: 'Failed to create Modal sandbox. Check credentials and network connectivity.',
        exitCode: 1,
        timedOut: false,
      };
    }

    const effectiveTimeout = Math.min(300, Math.max(5, timeout)) * 1000;

    try {
      this.state.execCount++;
      console.log(`[ModalSandbox] Exec #${this.state.execCount} in ${sandboxId}: ${command.slice(0, 100)}...`);

      // Execute command via Modal's exec API
      const result = await this.modalClient.interactive.exec(
        this.state.sandboxId!,
        command,
        { timeout: effectiveTimeout },
      );

      const stdout = (result?.stdout || '').trimEnd();
      const stderr = (result?.stderr || '').trimEnd();
      const exitCode = Number(result?.exitCode ?? 0);

      this.resetIdleTimer();

      return {
        stdout,
        stderr: stderr || undefined,
        exitCode,
        timedOut: false,
      };
    } catch (err: any) {
      // Handle timeout
      if (err?.message?.includes('timeout') || err?.message?.includes('Timeout') || err?.killed) {
        console.warn(`[ModalSandbox] Command timed out after ${effectiveTimeout}ms`);
        return {
          stdout: (err.stdout || '').trimEnd(),
          stderr: (err.stderr || `Command timed out after ${timeout}s`).trimEnd(),
          exitCode: err.code || 124,
          timedOut: true,
        };
      }

      // Sandbox might have died — reset and retry once
      if (err?.message?.includes('not found') || err?.message?.includes('stopped') || err?.message?.includes('expired')) {
        console.warn('[ModalSandbox] Sandbox expired, creating new one...');
        this.state.sandboxId = null;

        const retryId = await this.ensureSandbox();
        if (retryId) {
          try {
            const result = await this.modalClient.interactive.exec(retryId, command, { timeout: effectiveTimeout });
            return {
              stdout: (result?.stdout || '').trimEnd(),
              stderr: (result?.stderr || '').trimEnd(),
              exitCode: Number(result?.exitCode ?? 0),
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
        stdout: (err.stdout || '').trimEnd(),
        stderr: (err.stderr || err.message || 'Modal sandbox execution failed').trimEnd(),
        exitCode: err.code || 1,
        timedOut: false,
      };
    }
  }

  // ── File operations ────────────────────────────────────────────────

  /**
   * Upload a file to the sandbox.
   */
  async writeFile(remotePath: string, content: string): Promise<boolean> {
    if (!this.state.initialized || !this.state.sandboxId) {
      await this.initialize();
    }

    const sandboxId = await this.ensureSandbox();
    if (!sandboxId) return false;

    try {
      // Use exec to write file content via heredoc
      const escapedContent = content.replace(/'/g, "'\\''");
      await this.modalClient.interactive.exec(sandboxId, `cat > '${remotePath}' << 'HERMES_EOF'\n${content}\nHERMES_EOF`);
      this.resetIdleTimer();
      return true;
    } catch (err) {
      console.error(`[ModalSandbox] writeFile failed for ${remotePath}:`, err);
      return false;
    }
  }

  /**
   * Read a file from the sandbox.
   */
  async readFile(remotePath: string): Promise<string | null> {
    if (!this.state.initialized || !this.state.sandboxId) {
      await this.initialize();
    }

    const sandboxId = await this.ensureSandbox();
    if (!sandboxId) return null;

    try {
      const result = await this.modalClient.interactive.exec(sandboxId, `cat '${remotePath}'`);
      this.resetIdleTimer();
      return result?.stdout || null;
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
      sandboxId: this.state.sandboxId,
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
