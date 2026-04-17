/**
 * Usage Pricing — TypeScript rewrite of agent/usage_pricing.py
 *
 * Estimates token costs across providers using a hardcoded pricing table
 * derived from official documentation. Provides cost estimates in USD for
 * input/output tokens (and optionally cache read/write tokens).
 *
 * Server-side only. Pure calculation — no external dependencies.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PricingEntry {
  /** Cost per million input tokens in USD */
  inputCostPerMillion: number;
  /** Cost per million output tokens in USD */
  outputCostPerMillion: number;
  /** Cost per million cache-read tokens in USD (optional) */
  cacheReadCostPerMillion?: number;
  /** Cost per million cache-write tokens in USD (optional) */
  cacheWriteCostPerMillion?: number;
  /** Source of this pricing data */
  source: string;
}

export interface CostResult {
  /** Estimated cost in USD */
  amountUsd: number;
  /** Whether this is actual, estimated, or unknown */
  status: "actual" | "estimated" | "unknown";
  /** Where the pricing data came from */
  source: string;
  /** Human-readable label (e.g., "~$0.05") */
  label: string;
}

// ─── Pricing Table ──────────────────────────────────────────────────────────
//
// Keyed by (provider, model_id_lower). Sources are official docs snapshots
// from provider pricing pages (2025 pricing).

type PricingKey = [string, string];

const OFFICIAL_DOCS_PRICING: Map<PricingKey, PricingEntry> = new Map([
  // ── Anthropic ────────────────────────────────────────────────────────
  [
    ["anthropic", "claude-opus-4-20250514"],
    {
      inputCostPerMillion: 15.0,
      outputCostPerMillion: 75.0,
      cacheReadCostPerMillion: 1.5,
      cacheWriteCostPerMillion: 18.75,
      source: "official_docs_snapshot",
    },
  ],
  [
    ["anthropic", "claude-sonnet-4-20250514"],
    {
      inputCostPerMillion: 3.0,
      outputCostPerMillion: 15.0,
      cacheReadCostPerMillion: 0.3,
      cacheWriteCostPerMillion: 3.75,
      source: "official_docs_snapshot",
    },
  ],
  [
    ["anthropic", "claude-3-5-sonnet-20241022"],
    {
      inputCostPerMillion: 3.0,
      outputCostPerMillion: 15.0,
      cacheReadCostPerMillion: 0.3,
      cacheWriteCostPerMillion: 3.75,
      source: "official_docs_snapshot",
    },
  ],
  [
    ["anthropic", "claude-3-5-haiku-20241022"],
    {
      inputCostPerMillion: 0.8,
      outputCostPerMillion: 4.0,
      cacheReadCostPerMillion: 0.08,
      cacheWriteCostPerMillion: 1.0,
      source: "official_docs_snapshot",
    },
  ],
  [
    ["anthropic", "claude-3-opus-20240229"],
    {
      inputCostPerMillion: 15.0,
      outputCostPerMillion: 75.0,
      cacheReadCostPerMillion: 1.5,
      cacheWriteCostPerMillion: 18.75,
      source: "official_docs_snapshot",
    },
  ],
  [
    ["anthropic", "claude-3-haiku-20240307"],
    {
      inputCostPerMillion: 0.25,
      outputCostPerMillion: 1.25,
      cacheReadCostPerMillion: 0.03,
      cacheWriteCostPerMillion: 0.30,
      source: "official_docs_snapshot",
    },
  ],

  // ── OpenAI ───────────────────────────────────────────────────────────
  [
    ["openai", "gpt-4o"],
    {
      inputCostPerMillion: 2.5,
      outputCostPerMillion: 10.0,
      cacheReadCostPerMillion: 1.25,
      source: "official_docs_snapshot",
    },
  ],
  [
    ["openai", "gpt-4o-mini"],
    {
      inputCostPerMillion: 0.15,
      outputCostPerMillion: 0.6,
      cacheReadCostPerMillion: 0.075,
      source: "official_docs_snapshot",
    },
  ],
  [
    ["openai", "gpt-4-turbo"],
    {
      inputCostPerMillion: 10.0,
      outputCostPerMillion: 30.0,
      source: "official_docs_snapshot",
    },
  ],
  [
    ["openai", "gpt-4"],
    {
      inputCostPerMillion: 30.0,
      outputCostPerMillion: 60.0,
      source: "official_docs_snapshot",
    },
  ],
  [
    ["openai", "o3"],
    {
      inputCostPerMillion: 10.0,
      outputCostPerMillion: 40.0,
      cacheReadCostPerMillion: 2.5,
      source: "official_docs_snapshot",
    },
  ],
  [
    ["openai", "o3-mini"],
    {
      inputCostPerMillion: 1.1,
      outputCostPerMillion: 4.4,
      cacheReadCostPerMillion: 0.55,
      source: "official_docs_snapshot",
    },
  ],

  // ── DeepSeek ─────────────────────────────────────────────────────────
  [
    ["deepseek", "deepseek-chat"],
    {
      inputCostPerMillion: 0.14,
      outputCostPerMillion: 0.28,
      source: "official_docs_snapshot",
    },
  ],
  [
    ["deepseek", "deepseek-reasoner"],
    {
      inputCostPerMillion: 0.55,
      outputCostPerMillion: 2.19,
      source: "official_docs_snapshot",
    },
  ],

  // ── Google Gemini ────────────────────────────────────────────────────
  [
    ["google", "gemini-2.5-pro"],
    {
      inputCostPerMillion: 1.25,
      outputCostPerMillion: 10.0,
      source: "official_docs_snapshot",
    },
  ],
  [
    ["google", "gemini-2.5-flash"],
    {
      inputCostPerMillion: 0.15,
      outputCostPerMillion: 0.6,
      source: "official_docs_snapshot",
    },
  ],
  [
    ["google", "gemini-2.0-flash"],
    {
      inputCostPerMillion: 0.1,
      outputCostPerMillion: 0.4,
      source: "official_docs_snapshot",
    },
  ],
  [
    ["google", "gemini-1.5-pro"],
    {
      inputCostPerMillion: 1.25,
      outputCostPerMillion: 5.0,
      source: "official_docs_snapshot",
    },
  ],
  [
    ["google", "gemini-1.5-flash"],
    {
      inputCostPerMillion: 0.075,
      outputCostPerMillion: 0.3,
      source: "official_docs_snapshot",
    },
  ],

  // ── GLM / ZhipuAI ────────────────────────────────────────────────────
  [
    ["glm", "glm-4-plus"],
    {
      inputCostPerMillion: 0.5,
      outputCostPerMillion: 0.5,
      source: "official_docs_snapshot",
    },
  ],
  [
    ["glm", "glm-4"],
    {
      inputCostPerMillion: 0.1,
      outputCostPerMillion: 0.1,
      source: "official_docs_snapshot",
    },
  ],
  [
    ["glm", "glm-4-flash"],
    {
      inputCostPerMillion: 0.01,
      outputCostPerMillion: 0.01,
      source: "official_docs_snapshot",
    },
  ],
  [
    ["glm", "glm-4v"],
    {
      inputCostPerMillion: 0.1,
      outputCostPerMillion: 0.1,
      source: "official_docs_snapshot",
    },
  ],
  [
    ["glm", "glm-4v-plus"],
    {
      inputCostPerMillion: 0.5,
      outputCostPerMillion: 0.5,
      source: "official_docs_snapshot",
    },
  ],
  [
    ["glm", "glm-4-air"],
    {
      inputCostPerMillion: 0.01,
      outputCostPerMillion: 0.01,
      source: "official_docs_snapshot",
    },
  ],
  [
    ["glm", "glm-4.5-flash"],
    {
      inputCostPerMillion: 0.02,
      outputCostPerMillion: 0.02,
      source: "official_docs_snapshot",
    },
  ],
]);

// ─── Provider Detection ─────────────────────────────────────────────────────

/**
 * Resolve the provider slug and clean model name from a model identifier.
 */
function resolveBillingRoute(
  model: string,
  provider?: string,
): { provider: string; model: string } {
  let resolvedProvider = (provider || "").trim().toLowerCase();
  let resolvedModel = (model || "").trim();

  // Infer provider from model prefix
  if (!resolvedProvider && "/" in resolvedModel) {
    const parts = resolvedModel.split("/");
    if (parts.length === 2) {
      const inferredProvider = parts[0].toLowerCase();
      if (["anthropic", "openai", "google"].includes(inferredProvider)) {
        resolvedProvider = inferredProvider;
        resolvedModel = parts[1];
      }
    }
  }

  // Heuristic fallback based on model name
  if (!resolvedProvider) {
    if (resolvedModel.startsWith("claude-")) resolvedProvider = "anthropic";
    else if (resolvedModel.startsWith("gpt-") || resolvedModel.startsWith("o1") || resolvedModel.startsWith("o3") || resolvedModel.startsWith("o4"))
      resolvedProvider = "openai";
    else if (resolvedModel.startsWith("gemini-")) resolvedProvider = "google";
    else if (resolvedModel.startsWith("glm-") || resolvedModel.startsWith("glmz")) resolvedProvider = "glm";
    else if (resolvedModel.includes("deepseek")) resolvedProvider = "deepseek";
  }

  // Strip provider prefix from model name for lookup
  if (resolvedProvider && resolvedModel.startsWith(`${resolvedProvider}/`)) {
    resolvedModel = resolvedModel.slice(resolvedProvider.length + 1);
  }

  // For models with org prefix like "meta/llama-3.3-70b-instruct",
  // extract just the base model name
  if (resolvedModel.includes("/")) {
    resolvedModel = resolvedModel.split("/").pop() || resolvedModel;
  }

  return { provider: resolvedProvider || "unknown", model: resolvedModel.toLowerCase() };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Look up pricing entry for a model+provider combination.
 */
export function getPricingEntry(
  model: string,
  provider?: string,
): PricingEntry | null {
  const route = resolveBillingRoute(model, provider);

  // Direct lookup
  const entry = OFFICIAL_DOCS_PRICING.get([route.provider, route.model]);
  if (entry) return entry;

  // Try with full model name (lowercase) from the original input
  const lowerModel = (model || "").trim().toLowerCase();
  const fallback = OFFICIAL_DOCS_PRICING.get([route.provider, lowerModel]);
  if (fallback) return fallback;

  return null;
}

/**
 * Estimate the cost of an LLM API call.
 *
 * @param model         - Model identifier (e.g., "gpt-4o", "claude-sonnet-4-20250514")
 * @param inputTokens   - Number of input (prompt) tokens
 * @param outputTokens  - Number of output (completion) tokens
 * @param provider      - Optional provider slug for disambiguation
 * @param cacheReadTokens  - Optional cache-read tokens (for Anthropic/OpenAI prompt caching)
 * @param cacheWriteTokens - Optional cache-write tokens
 * @returns CostResult with estimated USD amount, status, and label
 */
export function estimateUsageCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  provider?: string,
  cacheReadTokens?: number,
  cacheWriteTokens?: number,
): CostResult {
  const entry = getPricingEntry(model, provider);

  if (!entry) {
    return {
      amountUsd: 0,
      status: "unknown",
      source: "none",
      label: "n/a",
    };
  }

  const ONE_MILLION = 1_000_000;
  let amount = 0;

  amount += (inputTokens * entry.inputCostPerMillion) / ONE_MILLION;
  amount += (outputTokens * entry.outputCostPerMillion) / ONE_MILLION;

  if (cacheReadTokens && entry.cacheReadCostPerMillion !== undefined) {
    amount += (cacheReadTokens * entry.cacheReadCostPerMillion) / ONE_MILLION;
  }
  if (cacheWriteTokens && entry.cacheWriteCostPerMillion !== undefined) {
    amount += (cacheWriteTokens * entry.cacheWriteCostPerMillion) / ONE_MILLION;
  }

  const label = amount === 0 ? "included" : `~$${amount.toFixed(4)}`;
  const status: CostResult["status"] = amount === 0 && entry.inputCostPerMillion === 0 ? "actual" : "estimated";

  return {
    amountUsd: amount,
    status,
    source: entry.source,
    label,
  };
}

/**
 * Check whether we have pricing data for a model+provider combination.
 */
export function hasKnownPricing(
  model: string,
  provider?: string,
): boolean {
  return getPricingEntry(model, provider) !== null;
}

/**
 * Backward-compatible helper: get pricing per million tokens for input/output.
 * Returns zeroes for unknown models.
 */
export function getPerMillionPricing(
  model: string,
  provider?: string,
): { input: number; output: number } {
  const entry = getPricingEntry(model, provider);
  if (!entry) return { input: 0, output: 0 };
  return {
    input: entry.inputCostPerMillion,
    output: entry.outputCostPerMillion,
  };
}

/**
 * Format a token count in compact form (e.g., "1.5M", "42K").
 */
export function formatTokenCountCompact(value: number): string {
  const abs = Math.abs(Math.round(value));
  const sign = value < 0 ? "-" : "";

  if (abs < 1_000) return `${sign}${abs}`;

  const units: [number, string][] = [
    [1_000_000_000, "B"],
    [1_000_000, "M"],
    [1_000, "K"],
  ];

  for (const [threshold, suffix] of units) {
    if (abs >= threshold) {
      const scaled = abs / threshold;
      const text =
        scaled < 10
          ? scaled.toFixed(2)
          : scaled < 100
            ? scaled.toFixed(1)
            : scaled.toFixed(0);
      return `${sign}${text.replace(/\.?0+$/, "")}${suffix}`;
    }
  }

  return `${value.toLocaleString()}`;
}

/**
 * Format a duration in compact form (e.g., "45s", "2m", "1h 30m", "2.5d").
 */
export function formatDurationCompact(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) {
    const rem = Math.round(minutes % 60);
    return rem > 0 ? `${Math.round(hours)}h ${rem}m` : `${Math.round(hours)}h`;
  }
  return `${(hours / 24).toFixed(1)}d`;
}
