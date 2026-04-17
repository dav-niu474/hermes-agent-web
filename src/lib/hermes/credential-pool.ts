/**
 * Credential Pool — TypeScript rewrite of credential_pool.py (simplified for web)
 *
 * Manages API credential rotation and failover across multiple API keys
 * for the same provider.  Supports multiple selection strategies:
 *
 *   - fill_first: Use the highest-priority credential until exhausted
 *   - round_robin: Cycle through credentials in order
 *   - random: Pick a random available credential
 *   - least_used: Always pick the credential with fewest requests
 *
 * When a credential hits rate limits (429), auth errors (401/403), or
 * payment errors (402), it is marked as exhausted and put on cooldown.
 * The pool automatically rotates to the next available credential.
 *
 * Server-side only.  Import from API routes or server actions.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/** A single credential entry in the pool. */
export interface CredentialEntry {
  /** Unique identifier for this credential. */
  id: string;
  /** Provider slug (e.g. "openai", "anthropic"). */
  provider: string;
  /** Optional human-readable label (e.g. "Production Key"). */
  label?: string;
  /** The API key string. */
  apiKey: string;
  /** Optional custom base URL for this credential. */
  baseUrl?: string;
  /** Priority (lower = higher priority). Default: 0. */
  priority: number;
  /** Number of requests made with this credential. */
  requestCount: number;
  /** Last known status of this credential. */
  lastStatus?: "ok" | "exhausted" | "error";
  /** When the credential was last marked as errored. */
  lastErrorAt?: Date;
  /** When this credential becomes available again (after cooldown). */
  cooldownUntil?: Date;
}

/** Credential rotation strategy. */
export type RotationStrategy = "fill_first" | "round_robin" | "random" | "least_used";

/** Pool status summary. */
export interface PoolStatus {
  /** Total number of credentials in the pool. */
  total: number;
  /** Number of credentials currently available (not exhausted/cooldown). */
  available: number;
  /** Number of credentials currently exhausted or in cooldown. */
  exhausted: number;
  /** Active rotation strategy. */
  strategy: string;
  /** Detailed status of each credential. */
  entries: Array<{
    id: string;
    label?: string;
    provider: string;
    priority: number;
    requestCount: number;
    status: "available" | "exhausted" | "cooldown";
  }>;
}

/** Options for creating a CredentialPool. */
export interface CredentialPoolOptions {
  /** Default cooldown duration in milliseconds. Default: 60000 (1 min). */
  cooldownMs?: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default cooldown duration: 60 seconds. */
const DEFAULT_COOLDOWN_MS = 60_000;

/** HTTP status codes that trigger exhaustion. */
const EXHAUSTION_STATUS_CODES = new Set([401, 402, 403, 429]);

/** Environment variable patterns for seeding credentials. */
const ENV_KEY_PATTERNS: Array<{ pattern: RegExp; provider: string }> = [
  { pattern: /^OPENAI_API_KEY_(\d+)$/, provider: "openai" },
  { pattern: /^ANTHROPIC_API_KEY_(\d+)$/, provider: "anthropic" },
  { pattern: /^GOOGLE_API_KEY_(\d+)$/, provider: "google" },
  { pattern: /^GLM_API_KEY_(\d+)$/, provider: "glm" },
  { pattern: /^OPENROUTER_API_KEY_(\d+)$/, provider: "openrouter" },
  { pattern: /^NVIDIA_API_KEY_(\d+)$/, provider: "nvidia" },
];

// ─── CredentialPool ─────────────────────────────────────────────────────────

/**
 * Manages a pool of API credentials with rotation and failover.
 *
 * Usage:
 * ```ts
 * const pool = new CredentialPool("fill_first");
 * pool.add({ id: "key1", provider: "openai", apiKey: "sk-...", priority: 0 });
 * pool.add({ id: "key2", provider: "openai", apiKey: "sk-...", priority: 1 });
 *
 * const cred = pool.select(); // Returns the highest-priority available credential
 * // ... use cred.apiKey ...
 * pool.markUsed(); // Increment request count
 *
 * // If rate limited:
 * pool.markExhausted(429); // Rotate to next, put current on cooldown
 * ```
 */
export class CredentialPool {
  private entries: CredentialEntry[] = [];
  private currentIndex: number = 0;
  private strategy: RotationStrategy;
  private cooldownMs: number;

  constructor(
    strategy: RotationStrategy = "fill_first",
    options?: CredentialPoolOptions,
  ) {
    this.strategy = strategy;
    this.cooldownMs = options?.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  }

  /**
   * Add a credential to the pool.
   *
   * Credentials are sorted by priority (lower = higher priority) after insertion.
   *
   * @param entry - Credential data (without requestCount and lastStatus, which are auto-initialized)
   */
  add(entry: Omit<CredentialEntry, "requestCount" | "lastStatus">): void {
    const cred: CredentialEntry = {
      ...entry,
      requestCount: 0,
      lastStatus: "ok",
    };

    this.entries.push(cred);

    // Sort by priority (lower first), then by insertion order (stable)
    this.entries.sort((a, b) => a.priority - b.priority);

    // Reset current index to the first available credential
    this.currentIndex = 0;
  }

  /**
   * Select the next available credential based on the rotation strategy.
   *
   * Returns null if all credentials are exhausted or in cooldown.
   * Automatically refreshes cooldowns that have expired.
   *
   * @returns The selected credential, or null if none available
   */
  select(): CredentialEntry | null {
    this.refreshCooldowns();

    const available = this.getAvailable();

    if (available.length === 0) {
      return null;
    }

    switch (this.strategy) {
      case "fill_first":
        return this.selectFillFirst(available);

      case "round_robin":
        return this.selectRoundRobin(available);

      case "random":
        return this.selectRandom(available);

      case "least_used":
        return this.selectLeastUsed(available);

      default:
        return this.selectFillFirst(available);
    }
  }

  /**
   * Mark the current credential as exhausted and rotate to the next.
   *
   * The exhausted credential is put on cooldown for the configured duration.
   * Status codes 401, 402, 403, 429 trigger automatic exhaustion.
   *
   * @param statusCode - Optional HTTP status code that caused the exhaustion
   */
  markExhausted(statusCode?: number): void {
    const current = this.getCurrent();

    if (!current) return;

    const shouldCooldown =
      !statusCode || EXHAUSTION_STATUS_CODES.has(statusCode);

    if (shouldCooldown) {
      current.lastStatus = "exhausted";
      current.lastErrorAt = new Date();
      current.cooldownUntil = new Date(Date.now() + this.cooldownMs);
    }

    // Advance to next available credential
    this.advanceToNext();

    console.log(
      `[credential-pool] Credential "${current.id}" exhausted` +
        (statusCode ? ` (status ${statusCode})` : "") +
        ` — rotating to next. Pool status: ${this.getStatus().available}/${this.getStatus().total} available`,
    );
  }

  /**
   * Mark the current credential as used successfully.
   * Increments the request counter and sets status to "ok".
   */
  markUsed(): void {
    const current = this.getCurrent();

    if (current) {
      current.requestCount++;
      current.lastStatus = "ok";
      current.lastErrorAt = undefined;
      current.cooldownUntil = undefined;
    }
  }

  /**
   * Get the current credential (the one last selected).
   * Returns null if no credential has been selected yet.
   */
  getCurrent(): CredentialEntry | null {
    this.refreshCooldowns();

    if (this.currentIndex >= this.entries.length) {
      return null;
    }

    const cred = this.entries[this.currentIndex];

    // If current is exhausted, try to advance
    if (cred.lastStatus === "exhausted" && cred.cooldownUntil) {
      if (new Date() < cred.cooldownUntil) {
        return null;
      }
      // Cooldown expired — mark as available
      cred.lastStatus = "ok";
      cred.cooldownUntil = undefined;
    }

    return cred;
  }

  /**
   * Get a summary of the pool's current status.
   */
  getStatus(): PoolStatus {
    this.refreshCooldowns();

    const now = new Date();
    let available = 0;
    let exhausted = 0;

    const entrySummaries = this.entries.map((cred) => {
      const isCooldown =
        cred.lastStatus === "exhausted" &&
        cred.cooldownUntil &&
        now < cred.cooldownUntil;

      const status: "available" | "exhausted" | "cooldown" = isCooldown
        ? "cooldown"
        : cred.lastStatus === "exhausted"
          ? "exhausted"
          : "available";

      if (status === "available") available++;
      else exhausted++;

      return {
        id: cred.id,
        label: cred.label,
        provider: cred.provider,
        priority: cred.priority,
        requestCount: cred.requestCount,
        status,
      };
    });

    return {
      total: this.entries.length,
      available,
      exhausted,
      strategy: this.strategy,
      entries: entrySummaries,
    };
  }

  /**
   * Reset all credentials to available status.
   * Clears cooldowns and resets request counts.
   */
  reset(): void {
    for (const cred of this.entries) {
      cred.lastStatus = "ok";
      cred.requestCount = 0;
      cred.lastErrorAt = undefined;
      cred.cooldownUntil = undefined;
    }
    this.currentIndex = 0;
  }

  /**
   * Remove a credential from the pool by ID.
   *
   * @param id - The credential ID to remove
   * @returns true if removed, false if not found
   */
  remove(id: string): boolean {
    const index = this.entries.findIndex((c) => c.id === id);
    if (index === -1) return false;

    this.entries.splice(index, 1);

    // Adjust current index
    if (this.currentIndex >= this.entries.length) {
      this.currentIndex = 0;
    }

    return true;
  }

  /**
   * Get the total number of requests made across all credentials.
   */
  getTotalRequests(): number {
    return this.entries.reduce((sum, c) => sum + c.requestCount, 0);
  }

  /**
   * Seed credentials from environment variables.
   *
   * Looks for numbered environment variables like:
   *   OPENAI_API_KEY, OPENAI_API_KEY_2, OPENAI_API_KEY_3, ...
   *   ANTHROPIC_API_KEY, ANTHROPIC_API_KEY_2, ...
   *
   * The base key (without number) gets priority 0, numbered keys get
   * sequential priorities starting at 1.
   *
   * @param provider - Optional provider to filter for. If omitted, seeds all providers.
   * @returns A new CredentialPool with seeded credentials
   */
  static fromEnvironment(
    provider?: string,
    strategy: RotationStrategy = "fill_first",
  ): CredentialPool {
    const pool = new CredentialPool(strategy);
    const env = process.env;

    for (const { pattern, provider: prov } of ENV_KEY_PATTERNS) {
      // Skip if provider filter doesn't match
      if (provider && prov !== provider) continue;

      // Check base key (no number suffix)
      const baseKeyName = pattern.source.replace("(\\d+)", "").replace("^", "");
      const baseValue = env[baseKeyName];

      if (baseValue?.trim()) {
        pool.add({
          id: `${prov}:0`,
          provider: prov,
          apiKey: baseValue.trim(),
          priority: 0,
          label: `${prov.toUpperCase()} (primary)`,
        });
      }

      // Check numbered keys
      for (let i = 2; i <= 10; i++) {
        const keyName = `${baseKeyName}${i}`;
        const value = env[keyName];

        if (value?.trim()) {
          pool.add({
            id: `${prov}:${i}`,
            provider: prov,
            apiKey: value.trim(),
            priority: i - 1,
            label: `${prov.toUpperCase()} #${i}`,
          });
        }
      }
    }

    return pool;
  }

  // ─── Private Methods ────────────────────────────────────────────────────

  /**
   * Get all credentials that are currently available (not exhausted or in cooldown).
   */
  private getAvailable(): CredentialEntry[] {
    const now = new Date();
    return this.entries.filter((cred) => {
      if (cred.lastStatus !== "exhausted") return true;
      if (!cred.cooldownUntil) return true;
      return now >= cred.cooldownUntil;
    });
  }

  /**
   * Refresh expired cooldowns.
   */
  private refreshCooldowns(): void {
    const now = new Date();
    for (const cred of this.entries) {
      if (
        cred.lastStatus === "exhausted" &&
        cred.cooldownUntil &&
        now >= cred.cooldownUntil
      ) {
        cred.lastStatus = "ok";
        cred.cooldownUntil = undefined;
        console.log(
          `[credential-pool] Credential "${cred.id}" cooldown expired — back available`,
        );
      }
    }
  }

  /**
   * Advance currentIndex to the next available credential.
   */
  private advanceToNext(): void {
    const len = this.entries.length;
    if (len === 0) return;

    for (let i = 1; i <= len; i++) {
      const nextIdx = (this.currentIndex + i) % len;
      const cred = this.entries[nextIdx];
      if (
        cred.lastStatus !== "exhausted" ||
        !cred.cooldownUntil ||
        new Date() >= cred.cooldownUntil
      ) {
        this.currentIndex = nextIdx;
        return;
      }
    }

    // All exhausted — stay at current (select() will return null)
  }

  /**
   * Strategy: fill_first — always pick the first available (highest priority).
   */
  private selectFillFirst(available: CredentialEntry[]): CredentialEntry {
    const cred = available[0];
    // Update currentIndex to point to this credential
    const idx = this.entries.indexOf(cred);
    if (idx >= 0) this.currentIndex = idx;
    return cred;
  }

  /**
   * Strategy: round_robin — cycle through credentials in order.
   */
  private selectRoundRobin(available: CredentialEntry[]): CredentialEntry {
    // Try to find an available credential starting from currentIndex + 1
    const len = this.entries.length;
    for (let i = 0; i < len; i++) {
      const idx = (this.currentIndex + i) % len;
      const cred = this.entries[idx];
      if (available.includes(cred)) {
        this.currentIndex = idx;
        return cred;
      }
    }

    // Fallback
    return available[0];
  }

  /**
   * Strategy: random — pick a random available credential.
   */
  private selectRandom(available: CredentialEntry[]): CredentialEntry {
    const idx = Math.floor(Math.random() * available.length);
    const cred = available[idx];
    const poolIdx = this.entries.indexOf(cred);
    if (poolIdx >= 0) this.currentIndex = poolIdx;
    return cred;
  }

  /**
   * Strategy: least_used — pick the credential with the fewest requests.
   */
  private selectLeastUsed(available: CredentialEntry[]): CredentialEntry {
    let minCount = Infinity;
    let selected = available[0];

    for (const cred of available) {
      if (cred.requestCount < minCount) {
        minCount = cred.requestCount;
        selected = cred;
      }
    }

    const idx = this.entries.indexOf(selected);
    if (idx >= 0) this.currentIndex = idx;
    return selected;
  }
}
