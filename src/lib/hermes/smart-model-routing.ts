/**
 * Smart Model Routing — TypeScript rewrite of smart_model_routing.py
 *
 * Provides intelligent model selection for simple vs complex queries.
 * Routes trivially simple turns to a cheaper/faster model to save cost
 * while preserving full capability for complex tasks.
 *
 * Conservative gate: only routes to cheap model when ALL criteria pass:
 *   - Message is short (< 160 chars, < 28 words)
 *   - Contains no code blocks (``` or ```)
 *   - Contains no URLs (http://, https://)
 *   - Contains no newlines
 *   - Contains no complex task keywords
 *
 * Server-side only.  Import from API routes or server actions.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/** Configuration for smart model routing. */
export interface RoutingConfig {
  /** Enable/disable smart routing. Default: false */
  enabled?: boolean;
  /** Model to use for simple turns (e.g. "gpt-4o-mini") */
  cheapModel?: string;
  /** Provider for the cheap model (e.g. "openai") */
  cheapProvider?: string;
  /** Maximum character length for a simple turn. Default: 160 */
  maxSimpleChars?: number;
  /** Maximum word count for a simple turn. Default: 28 */
  maxSimpleWords?: number;
}

/** Result of a routing decision. */
export interface RoutingDecision {
  /** The model to use for this turn */
  model: string;
  /** The provider for this turn */
  provider: string;
  /** Why this model was selected */
  routingReason?: "simple_turn" | "complex_turn";
  /** The original/primary model that was considered */
  originalModel: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Keywords that indicate a complex task requiring the primary model. */
const COMPLEX_KEYWORDS = new Set([
  "debug",
  "implement",
  "refactor",
  "test",
  "write",
  "create",
  "build",
  "fix",
  "deploy",
  "analyze",
  "explain",
  "compare",
  "optimize",
  "configure",
  "setup",
  "install",
  "migrate",
  "convert",
  "translate",
  "code",
  "function",
  "class",
  "script",
  "program",
  "api",
  "database",
  "server",
  "client",
  "component",
  "module",
  "package",
  "library",
  "framework",
  "algorithm",
  "architecture",
  "design",
  "review",
  "document",
  "tutorial",
  "guide",
  "how to",
]);

/** Regex patterns that indicate complexity. */
const COMPLEX_PATTERNS = [
  /```[\s\S]*?```/g, // Code fences (triple backticks)
  /``[^`]+``/g, // Inline code (double backticks)
  /https?:\/\/[^\s]+/gi, // URLs
];

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Count words in a string. Words are sequences of non-whitespace characters.
 */
function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Check if the message contains any code fences or inline code.
 */
function hasCodeBlocks(text: string): boolean {
  return /```[\s\S]*?```/g.test(text) || /``[^`]+``/g.test(text);
}

/**
 * Check if the message contains any URLs.
 */
function hasUrls(text: string): boolean {
  return /https?:\/\/[^\s]+/gi.test(text);
}

/**
 * Check if the message contains newlines (indicating multi-line input).
 */
function hasNewlines(text: string): boolean {
  return text.includes("\n");
}

/**
 * Check if the message contains any complex task keywords.
 * Uses word-boundary matching to avoid false positives (e.g. "address" should
 * not match "dress").
 */
function hasComplexKeywords(text: string): boolean {
  const lower = text.toLowerCase();

  // Check for complex keywords with word boundaries
  for (const keyword of COMPLEX_KEYWORDS) {
    // Use a regex with word boundaries for multi-char keywords
    if (keyword.length > 2) {
      const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i");
      if (regex.test(lower)) return true;
    } else {
      // Short keywords: just check inclusion (e.g. "fix" in "fix it")
      if (lower.includes(keyword)) return true;
    }
  }

  return false;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Core Functions ─────────────────────────────────────────────────────────

/**
 * Conservative gate: decide whether a user message is simple enough to
 * route to a cheaper model.
 *
 * Returns a RoutingDecision if routing should happen, or null if the
 * message should be handled by the primary model.
 *
 * @param userMessage - The user's message text
 * @param config - Routing configuration (cheapModel and cheapProvider required)
 * @returns RoutingDecision if simple, null if complex
 */
export function chooseCheapModelRoute(
  userMessage: string,
  config?: RoutingConfig,
): RoutingDecision | null {
  // Config must specify cheap model and provider
  if (!config?.cheapModel || !config?.cheapProvider) {
    return null;
  }

  const maxChars = config.maxSimpleChars ?? 160;
  const maxWords = config.maxSimpleWords ?? 28;

  // --- Conservative gate checks ---
  // Any single check failing means we use the primary model

  // 1. Length check
  if (userMessage.length > maxChars) {
    return null;
  }

  // 2. Word count check
  if (countWords(userMessage) > maxWords) {
    return null;
  }

  // 3. No code blocks
  if (hasCodeBlocks(userMessage)) {
    return null;
  }

  // 4. No URLs
  if (hasUrls(userMessage)) {
    return null;
  }

  // 5. No newlines (multi-line input is likely complex)
  if (hasNewlines(userMessage)) {
    return null;
  }

  // 6. No complex keywords
  if (hasComplexKeywords(userMessage)) {
    return null;
  }

  // All checks passed — route to cheap model
  return {
    model: config.cheapModel,
    provider: config.cheapProvider,
    routingReason: "simple_turn",
    originalModel: config.cheapModel,
  };
}

/**
 * Main entry point: decide whether to use the cheap model for this turn.
 *
 * If smart routing is disabled or the message doesn't qualify, returns
 * a decision pointing to the primary model/provider.
 *
 * @param userMessage - The user's message text
 * @param config - Routing configuration
 * @param primaryModel - The primary/default model to fall back to
 * @param primaryProvider - The primary/default provider to fall back to
 * @returns RoutingDecision indicating which model/provider to use
 */
export function resolveTurnRoute(
  userMessage: string,
  config?: RoutingConfig,
  primaryModel?: string,
  primaryProvider?: string,
): RoutingDecision {
  const effectiveModel = primaryModel || "default";
  const effectiveProvider = primaryProvider || "default";

  // If routing is not enabled, always use primary
  if (!config?.enabled) {
    return {
      model: effectiveModel,
      provider: effectiveProvider,
      routingReason: "complex_turn",
      originalModel: effectiveModel,
    };
  }

  // Try the cheap model route
  const cheapRoute = chooseCheapModelRoute(userMessage, config);

  if (cheapRoute) {
    // Amend the decision with the original primary model info
    return {
      ...cheapRoute,
      originalModel: effectiveModel,
    };
  }

  // Message is complex — use primary model
  return {
    model: effectiveModel,
    provider: effectiveProvider,
    routingReason: "complex_turn",
    originalModel: effectiveModel,
  };
}

/**
 * Log a routing decision for debugging/monitoring.
 * Returns a formatted string suitable for structured logging.
 */
export function formatRoutingDecision(decision: RoutingDecision): string {
  const parts = [
    `route=${decision.routingReason}`,
    `model=${decision.model}`,
    `provider=${decision.provider}`,
  ];
  if (decision.routingReason === "simple_turn") {
    parts.push(`saved_from=${decision.originalModel}`);
  }
  return `[smart-routing] ${parts.join(" ")}`;
}
