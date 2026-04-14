/**
 * Prompt Caching — TypeScript rewrite of prompt_caching.py
 *
 * Implements Anthropic prompt caching to reduce costs and latency on
 * repeated API calls.  When sending messages to Anthropic, cache control
 * headers can be attached to static portions (system prompt, early
 * conversation turns) so they are cached server-side for 5 minutes or 1 hour.
 *
 * Strategy: system_and_3 — cache the system prompt and the last 3 messages.
 *
 * Server-side only.  Import from API routes or server actions.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/** Anthropic cache control directive. */
export interface CacheControl {
  type: "ephemeral";
  /** Time-to-live for the cached content. Default: "5m" */
  ttl?: "5m" | "1h";
}

/** A message in the Anthropic API format (may have structured content blocks). */
export interface ApiMessage {
  role: string;
  content: string | Array<ApiContentBlock>;
  /** Cache control on the message itself (used for system messages). */
  cache_control?: CacheControl;
}

/** A structured content block inside an Anthropic message. */
export interface ApiContentBlock {
  type: string;
  text?: string;
  /** Cache control on individual content blocks. */
  cache_control?: CacheControl;
  [key: string]: unknown;
}

/** Caching strategy identifier. */
export type CacheStrategy = "system_and_3" | "all_but_last" | "system_only" | "disabled";

/** Options for applyAnthropicCacheControl. */
export interface CachingOptions {
  /** Cache TTL. Default: "5m" */
  cacheTtl?: "5m" | "1h";
  /**
   * Whether this is a native Anthropic API call (vs OpenAI-compatible proxy).
   * Native Anthropic uses top-level cache_control on content blocks;
   * proxy providers may use different conventions.
   * Default: false
   */
  nativeAnthropic?: boolean;
  /** Caching strategy. Default: "system_and_3" */
  strategy?: CacheStrategy;
  /**
   * Number of trailing messages to leave uncached (for "all_but_last" strategy).
   * Default: 1
   */
  uncachedTail?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Deep-clone a message and attach cache_control to it.
 * Does not mutate the original message.
 */
function withCacheControl(
  message: ApiMessage,
  ttl: "5m" | "1h",
): ApiMessage {
  const control: CacheControl = { type: "ephemeral", ttl };

  if (typeof message.content === "string") {
    // String content: attach cache_control at message level
    return {
      ...message,
      cache_control: control,
    };
  }

  // Array content: attach cache_control to each content block
  const newContent = message.content.map((block) => ({
    ...block,
    cache_control: control,
  }));

  return {
    ...message,
    content: newContent,
  };
}

/**
 * Deep-clone a message without any cache_control (removes existing caches).
 * Useful for re-sending messages without caching.
 */
function stripCacheControl(message: ApiMessage): ApiMessage {
  if (typeof message.content === "string") {
    const { cache_control: _, ...rest } = message;
    return rest;
  }

  const newContent = message.content.map((block) => {
    const { cache_control: _, ...rest } = block;
    return rest;
  });

  return {
    ...message,
    content: newContent,
  };
}

// ─── Core Functions ─────────────────────────────────────────────────────────

/**
 * Apply Anthropic cache control to a list of messages.
 *
 * Strategy: system_and_3 (default)
 *   - Caches the system message (role === "system")
 *   - Caches the first 3 messages in the conversation
 *   - Leaves remaining messages uncached
 *
 * This reduces API costs on repeated calls because Anthropic caches
 * the prompt prefix server-side and doesn't re-process it.
 *
 * @param messages - Array of messages in Anthropic API format
 * @param cacheTtl - Cache TTL ("5m" or "1h"). Default: "5m"
 * @param nativeAnthropic - Whether to use native Anthropic format. Default: false
 * @returns New array with cache_control applied (originals not mutated)
 */
export function applyAnthropicCacheControl(
  messages: ApiMessage[],
  cacheTtl: "5m" | "1h" = "5m",
  nativeAnthropic: boolean = false,
): ApiMessage[] {
  return applyCacheControlWithOptions(messages, {
    cacheTtl,
    nativeAnthropic,
    strategy: "system_and_3",
  });
}

/**
 * Apply Anthropic cache control with full options.
 *
 * Supported strategies:
 *   - system_and_3: Cache system prompt + first 3 messages (default)
 *   - all_but_last: Cache all messages except the last N
 *   - system_only: Only cache the system message
 *   - disabled: Remove all cache controls
 *
 * @param messages - Array of messages in Anthropic API format
 * @param options - Caching options (strategy, TTL, native mode)
 * @returns New array with cache_control applied (originals not mutated)
 */
export function applyCacheControlWithOptions(
  messages: ApiMessage[],
  options: CachingOptions = {},
): ApiMessage[] {
  const {
    cacheTtl = "5m",
    strategy = "system_and_3",
    uncachedTail = 1,
  } = options;

  if (strategy === "disabled" || messages.length === 0) {
    // Strip all cache controls
    return messages.map(stripCacheControl);
  }

  const result: ApiMessage[] = [];
  let cachedCount = 0;

  switch (strategy) {
    case "system_only": {
      for (const msg of messages) {
        if (msg.role === "system") {
          result.push(withCacheControl(msg, cacheTtl));
        } else {
          result.push(stripCacheControl(msg));
        }
      }
      break;
    }

    case "all_but_last": {
      const splitIndex = Math.max(0, messages.length - uncachedTail);
      for (let i = 0; i < messages.length; i++) {
        if (i < splitIndex) {
          result.push(withCacheControl(messages[i], cacheTtl));
        } else {
          result.push(stripCacheControl(messages[i]));
        }
      }
      break;
    }

    case "system_and_3":
    default: {
      for (const msg of messages) {
        if (msg.role === "system") {
          // Always cache system messages
          result.push(withCacheControl(msg, cacheTtl));
        } else if (cachedCount < 3) {
          // Cache first 3 non-system messages
          result.push(withCacheControl(msg, cacheTtl));
          cachedCount++;
        } else {
          // Leave the rest uncached
          result.push(stripCacheControl(msg));
        }
      }
      break;
    }
  }

  return result;
}

/**
 * Build an Anthropic-compatible system prompt with cache control.
 *
 * Returns a message object suitable for placing at the start of the
 * messages array with cache_control attached.
 *
 * @param systemPrompt - The system prompt text
 * @param cacheTtl - Cache TTL. Default: "5m"
 * @returns System message with cache control
 */
export function buildCachedSystemMessage(
  systemPrompt: string,
  cacheTtl: "5m" | "1h" = "5m",
): ApiMessage {
  return {
    role: "system",
    content: systemPrompt,
    cache_control: { type: "ephemeral", ttl: cacheTtl },
  };
}

/**
 * Estimate the token savings from caching.
 *
 * This is a rough heuristic based on the cached message count and
 * average characters per token (≈4 for English text). Not precise,
 * but useful for logging and cost estimation.
 *
 * @param messages - The full message array (before caching)
 * @param cachedMessageCount - Number of messages that would be cached
 * @returns Estimated tokens saved per subsequent call
 */
export function estimateCacheSavings(
  messages: ApiMessage[],
  cachedMessageCount: number,
): number {
  let totalCachedChars = 0;

  for (let i = 0; i < Math.min(cachedMessageCount, messages.length); i++) {
    const msg = messages[i];
    if (typeof msg.content === "string") {
      totalCachedChars += msg.content.length;
    } else {
      for (const block of msg.content) {
        if (block.text) {
          totalCachedChars += block.text.length;
        }
      }
    }
  }

  // Rough estimate: ~4 characters per token
  return Math.ceil(totalCachedChars / 4);
}

/**
 * Format a caching summary for logging.
 *
 * @param messages - The messages array after caching is applied
 * @returns Summary string
 */
export function formatCacheSummary(messages: ApiMessage[]): string {
  let cachedCount = 0;
  let uncachedCount = 0;

  for (const msg of messages) {
    const hasCache =
      msg.cache_control?.type === "ephemeral" ||
      (Array.isArray(msg.content) &&
        msg.content.some((b) => b.cache_control?.type === "ephemeral"));

    if (hasCache) {
      cachedCount++;
    } else {
      uncachedCount++;
    }
  }

  return `[prompt-cache] cached=${cachedCount} uncached=${uncachedCount} total=${messages.length}`;
}
