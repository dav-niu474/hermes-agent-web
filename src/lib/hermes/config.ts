/**
 * Hermes Configuration Manager — TypeScript rewrite of hermes_cli/config.py
 *
 * Manages the ~/.hermes configuration directory, config.yaml loading,
 * environment variable resolution, and provider/key routing for the
 * Next.js-embedded Hermes Agent backend.
 *
 * Server-side only.  Import from API routes or server actions.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import * as yaml from "js-yaml";
import { MODEL_PROVIDER_MAP } from "./models";

// Detect serverless/readonly environments (Vercel, etc.)
const IS_SERVERLESS = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY;

/** Safe wrapper around fs operations — no-ops in serverless environments. */
function safeExistsSync(path: string): boolean {
  if (IS_SERVERLESS) return false;
  try { return existsSync(path); } catch { return false; }
}
function safeReadFileSync(path: string, encoding: string): string | undefined {
  if (IS_SERVERLESS) return undefined;
  try { return readFileSync(path, encoding as BufferEncoding); } catch { return undefined; }
}
function safeWriteFileSync(path: string, data: string): void {
  if (IS_SERVERLESS) return;
  try { writeFileSync(path, data, "utf-8"); } catch { /* ignore */ }
}
function safeMkdirSync(path: string, options?: { recursive?: boolean }): void {
  if (IS_SERVERLESS) return;
  try { mkdirSync(path, options); } catch { /* ignore */ }
}

// ─── Types ──────────────────────────────────────────────────────────────────

/** Shape of the `model` section in config.yaml. */
export interface ModelConfig {
  /** Model identifier (e.g. "meta/llama-3.3-70b-instruct") */
  default?: string;
  /** Provider slug ("nvidia", "openai", "openrouter", "anthropic", "google", …) */
  provider?: string;
  /** Custom OpenAI-compatible base URL */
  base_url?: string;
  /** Explicit API key (prefer env vars) */
  api_key?: string;
  /** API mode: "chat_completions" | "anthropic_messages" */
  api_mode?: string;
  /** Context window override (tokens) */
  context_length?: number;
}

/** Provider routing info returned by getLLMConfig(). */
export interface LLMConfig {
  /** Resolved model identifier */
  model: string;
  /** Resolved provider slug */
  provider: string;
  /** Resolved API base URL */
  baseUrl: string;
  /** Resolved API key (masked in logs) */
  apiKey: string;
  /** API protocol mode */
  apiMode: "chat_completions" | "anthropic_messages";
  /** Source of the configuration ("env", "config", "default") */
  source: string;
}

/** Full Hermes configuration shape (a subset of the Python DEFAULT_CONFIG). */
export interface HermesConfig {
  model: string | ModelConfig;
  providers?: Record<string, Record<string, unknown>>;
  fallback_providers?: Record<string, unknown>[];
  toolsets?: string[];
  enabled_toolsets?: string[];
  disabled_toolsets?: string[];
  agent?: {
    max_turns?: number;
    gateway_timeout?: number;
    tool_use_enforcement?: string;
  };
  terminal?: Record<string, unknown>;
  browser?: Record<string, unknown>;
  memory?: Record<string, unknown>;
  display?: Record<string, unknown>;
  compression?: Record<string, unknown>;
  auxiliary?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENAI_BASE_URL = "https://api.openai.com/v1";
const ANTHROPIC_BASE_URL = "https://api.anthropic.com";

const DEFAULT_CONFIG: HermesConfig = {
  model: "",
  providers: {},
  fallback_providers: [],
  toolsets: ["hermes-cli"],
  enabled_toolsets: [],
  disabled_toolsets: [],
  agent: {
    max_turns: 90,
    gateway_timeout: 1800,
    tool_use_enforcement: "auto",
  },
  terminal: {
    backend: "local",
    timeout: 180,
    modal: {
      token_id: "${MODAL_TOKEN_ID}",
      token_secret: "${MODAL_TOKEN_SECRET}",
      app_name: "hermes-sandbox",
      image: "python:3.11-slim",
      cpu: 1,
      memory: 512,
      idle_timeout: 300,
    },
  },
  browser: {
    inactivity_timeout: 120,
    command_timeout: 30,
  },
  memory: {
    memory_enabled: true,
    user_profile_enabled: true,
    memory_char_limit: 2200,
    user_char_limit: 1375,
  },
  display: {
    compact: false,
    personality: "kawaii",
    streaming: false,
    show_reasoning: false,
  },
  compression: {
    enabled: true,
    threshold: 0.5,
    target_ratio: 0.2,
    protect_last_n: 20,
  },
};

/** Environment-variable → config-key mappings for provider auto-detection. */
const PROVIDER_ENV_MAP: Record<string, { key: string; provider: string; baseUrl: string }> = {
  NVIDIA_API_KEY: { key: "NVIDIA_API_KEY", provider: "nvidia", baseUrl: NVIDIA_NIM_BASE_URL },
  GLM_API_KEY: { key: "GLM_API_KEY", provider: "glm", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  ZAI_API_KEY: { key: "ZAI_API_KEY", provider: "glm", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  Z_AI_API_KEY: { key: "Z_AI_API_KEY", provider: "glm", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  OPENAI_API_KEY: { key: "OPENAI_API_KEY", provider: "openai", baseUrl: OPENAI_BASE_URL },
  ANTHROPIC_API_KEY: { key: "ANTHROPIC_API_KEY", provider: "anthropic", baseUrl: ANTHROPIC_BASE_URL },
  ANTHROPIC_TOKEN: { key: "ANTHROPIC_TOKEN", provider: "anthropic", baseUrl: ANTHROPIC_BASE_URL },
  OPENROUTER_API_KEY: { key: "OPENROUTER_API_KEY", provider: "openrouter", baseUrl: OPENROUTER_BASE_URL },
  GOOGLE_API_KEY: { key: "GOOGLE_API_KEY", provider: "google", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  GEMINI_API_KEY: { key: "GEMINI_API_KEY", provider: "google", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
};

/** Priority order for provider auto-detection when HERMES_INFERENCE_PROVIDER=auto. */
const PROVIDER_AUTO_ORDER = [
  "NVIDIA_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_TOKEN",
  "OPENROUTER_API_KEY",
  "GLM_API_KEY",
  "ZAI_API_KEY",
  "Z_AI_API_KEY",
  "GOOGLE_API_KEY",
  "GEMINI_API_KEY",
];

// ─── Hermes Home ────────────────────────────────────────────────────────────

/**
 * Return the Hermes home directory (default: ~/.hermes).
 * Reads HERMES_HOME env var, falls back to ~/.hermes.
 */
export function getHermesHome(): string {
  if (IS_SERVERLESS) return "/tmp/.hermes";
  return process.env.HERMES_HOME || join(homedir(), ".hermes");
}

/**
 * Return the path to config.yaml inside HERMES_HOME.
 */
export function getConfigPath(): string {
  return join(getHermesHome(), "config.yaml");
}

/**
 * Return the path to the .env file inside HERMES_HOME.
 */
export function getEnvPath(): string {
  return join(getHermesHome(), ".env");
}

/**
 * Ensure ~/.hermes directory exists (idempotent).
 */
export function ensureHermesHome(): void {
  if (IS_SERVERLESS) return;
  const home = getHermesHome();
  safeMkdirSync(home, { recursive: true });
  // Ensure subdirectories
  for (const subdir of ["sessions", "logs", "skills", "memory"]) {
    const p = join(home, subdir);
    safeMkdirSync(p, { recursive: true });
  }
}

// ─── Config Loading ─────────────────────────────────────────────────────────

/** In-memory config cache. undefined = not loaded yet. */
let _configCache: HermesConfig | undefined = undefined;

/**
 * Deep-merge a user config over the default config.
 * Arrays are replaced, not concatenated (matching Python behavior).
 */
function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const baseVal = base[key];
    const overVal = override[key];
    if (
      baseVal !== null &&
      typeof baseVal === "object" &&
      !Array.isArray(baseVal) &&
      overVal !== null &&
      typeof overVal === "object" &&
      !Array.isArray(overVal)
    ) {
      result[key] = deepMerge(baseVal as Record<string, unknown>, overVal as Record<string, unknown>);
    } else {
      result[key] = overVal;
    }
  }
  return result;
}

/**
 * Normalize legacy config keys (e.g. top-level "max_turns" → agent.max_turns).
 */
function normalizeConfig(cfg: HermesConfig): HermesConfig {
  const result = { ...cfg };
  // Move top-level max_turns into agent section
  if (typeof (result as Record<string, unknown>).max_turns === "number" && result.agent) {
    if (result.agent.max_turns === undefined) {
      result.agent = { ...result.agent, max_turns: (result as Record<string, unknown>).max_turns as number };
    }
    delete (result as Record<string, unknown>).max_turns;
  }
  // Normalize model string → ModelConfig object
  if (typeof result.model === "string") {
    result.model = result.model.trim() ? { default: result.model } : { default: "" };
  }
  return result;
}

/**
 * Expand ${ENV_VAR} references in string values (mirrors _expand_env_vars in Python).
 */
function expandEnvVars(obj: unknown): unknown {
  if (typeof obj === "string") {
    return obj.replace(/\$\{([^}]+)\}/g, (_, varName) => {
      return process.env[varName] || "";
    });
  }
  if (Array.isArray(obj)) {
    return obj.map(expandEnvVars);
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = expandEnvVars(v);
    }
    return result;
  }
  return obj;
}

/**
 * Load configuration from ~/.hermes/config.yaml.
 *
 * Merges user config over DEFAULT_CONFIG, normalizes legacy keys,
 * and expands ${ENV_VAR} references.  Results are cached in-process.
 */
export function loadConfig(forceReload = false): HermesConfig {
  if (!forceReload && _configCache !== undefined) {
    return _configCache!;
  }

  ensureHermesHome();

  let userConfig: Record<string, unknown> = {};
  const configPath = getConfigPath();

  const raw = safeReadFileSync(configPath, "utf-8");
  if (raw) {
    try {
      const parsed = yaml.load(raw) as Record<string, unknown> | undefined;
      if (parsed && typeof parsed === "object") {
        userConfig = parsed;
      }
    } catch (err) {
      console.warn(`[hermes:config] Failed to load ${configPath}:`, err);
    }
  }

  const merged = deepMerge(
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
    userConfig,
  ) as unknown as HermesConfig;

  const normalized = normalizeConfig(merged);
  _configCache = expandEnvVars(normalized) as HermesConfig;
  return _configCache!;
}

/**
 * Invalidate the in-memory config cache so next loadConfig() reads from disk.
 */
export function invalidateConfigCache(): void {
  _configCache = undefined;
}

/**
 * Get a value from the loaded config by dot-separated key path.
 *
 * @example getConfigValue("agent.max_turns") // → 90
 */
export function getConfigValue(key: string, defaultValue?: unknown): unknown {
  const config = loadConfig();
  const parts = key.split(".");
  let current: unknown = config;
  for (const part of parts) {
    if (current === null || typeof current !== "object") {
      return defaultValue;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current !== undefined ? current : defaultValue;
}

/**
 * Update config values and persist to config.yaml.
 *
 * @param updates - Object of key → value pairs to merge into config
 */
export function updateConfig(updates: Record<string, unknown>): HermesConfig {
  const config = loadConfig();
  const configPath = getConfigPath();

  // Merge updates into config — deep-merge for all nested objects
  for (const [key, value] of Object.entries(updates)) {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      // Deep-merge: existing[key] ← { ...existing[key], ...value }
      const existing = (config as Record<string, unknown>)[key];
      if (
        existing !== null &&
        typeof existing === "object" &&
        !Array.isArray(existing)
      ) {
        (config as Record<string, unknown>)[key] = {
          ...(existing as Record<string, unknown>),
          ...(value as Record<string, unknown>),
        };
      } else {
        (config as Record<string, unknown>)[key] = value;
      }
    } else {
      // Primitive values or arrays: direct assignment
      (config as Record<string, unknown>)[key] = value;
    }
  }

  // Write back to disk
  try {
    const yamlStr = yaml.dump(config as unknown as Record<string, unknown>, {
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
    });
    ensureHermesHome();
    safeWriteFileSync(configPath, yamlStr);
  } catch (err) {
    console.error("[hermes:config] Failed to write config:", err);
  }

  // Update cache
  _configCache = config;
  return config;
}

// ─── Provider Detection ─────────────────────────────────────────────────────

/**
 * Detect available providers from environment variables.
 * Returns an array of provider slugs that have API keys set.
 */
export function detectAvailableProviders(): string[] {
  const available: string[] = [];
  for (const envVar of PROVIDER_AUTO_ORDER) {
    const val = process.env[envVar];
    if (val && val.trim()) {
      const info = PROVIDER_ENV_MAP[envVar];
      if (info && !available.includes(info.provider)) {
        available.push(info.provider);
      }
    }
  }
  return available;
}

/**
 * Resolve the effective provider slug.
 *
 * Order of precedence (mirrors hermes-agent's runtime_provider.py):
 *   1. Explicit provider override passed to this function
 *   2. Config file model.provider
 *   3. HERMES_INFERENCE_PROVIDER env var
 *   4. Auto-detect from available API keys
 *   5. Fall back to "nvidia"
 */
export function resolveProvider(override?: string): string {
  // 1. Explicit override
  if (override && override.trim() && override !== "auto") {
    return override.trim().toLowerCase();
  }

  // 2. Config file
  const config = loadConfig();
  const modelCfg = config.model as ModelConfig;
  if (modelCfg?.provider && modelCfg.provider.trim() && modelCfg.provider !== "auto") {
    return modelCfg.provider.trim().toLowerCase();
  }

  // 3. HERMES_INFERENCE_PROVIDER env var
  const envProvider = process.env.HERMES_INFERENCE_PROVIDER?.trim().toLowerCase();
  if (envProvider && envProvider !== "auto") {
    return envProvider;
  }

  // 4. Auto-detect from env vars
  const available = detectAvailableProviders();
  if (available.length > 0) {
    return available[0];
  }

  // 5. Default to nvidia
  return "nvidia";
}

/**
 * Resolve the API key for a given provider.
 *
 * Checks provider-specific env vars first, then falls back to OPENAI_API_KEY.
 */
export function resolveApiKey(provider: string): string {
  // Check provider-specific keys first
  for (const [envVar, info] of Object.entries(PROVIDER_ENV_MAP)) {
    if (info.provider === provider) {
      const val = process.env[envVar];
      if (val?.trim()) return val.trim();
    }
  }

  // Aliases
  if (provider === "glm" || provider === "zai") {
    return process.env.GLM_API_KEY?.trim() || process.env.ZAI_API_KEY?.trim() || process.env.Z_AI_API_KEY?.trim() || "";
  }
  if (provider === "google" || provider === "gemini") {
    return process.env.GOOGLE_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim() || "";
  }
  if (provider === "anthropic") {
    return process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_TOKEN?.trim() || "";
  }

  // Generic fallback
  return process.env.OPENAI_API_KEY?.trim() || "";
}

/**
 * Resolve the base URL for a given provider.
 */
export function resolveBaseUrl(provider: string): string {
  // Check config.yaml model.base_url first
  const config = loadConfig();
  const modelCfg = config.model as ModelConfig;
  if (modelCfg?.base_url?.trim()) {
    return modelCfg.base_url.trim().replace(/\/+$/, "");
  }

  // Provider defaults
  switch (provider) {
    case "nvidia":
      return process.env.NVIDIA_BASE_URL?.trim() || NVIDIA_NIM_BASE_URL;
    case "openai":
      return process.env.OPENAI_BASE_URL?.trim() || OPENAI_BASE_URL;
    case "openrouter":
      return process.env.OPENROUTER_BASE_URL?.trim() || OPENROUTER_BASE_URL;
    case "anthropic":
      return ANTHROPIC_BASE_URL;
    case "google":
    case "gemini":
      return process.env.GEMINI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta/openai";
    case "glm":
    case "zai":
      return process.env.GLM_BASE_URL?.trim() || "https://open.bigmodel.cn/api/paas/v4";
    default:
      return "";
  }
}

// ─── Model → Provider Mapping ─────────────────────────────────────────────
// Imported from ./models.ts — single source of truth

/**
 * Auto-detect the provider slug from a model ID.
 * Checks the explicit map first, then falls back to heuristic patterns.
 */
export function detectProviderFromModel(modelId: string): string | null {
  // 1. Explicit map lookup
  const mapped = MODEL_PROVIDER_MAP[modelId];
  if (mapped) return mapped;

  // 2. Heuristic: model IDs with known org prefixes
  if (modelId.startsWith("meta/") || modelId.startsWith("nvidia/") ||
      modelId.startsWith("mistralai/") || modelId.startsWith("google/") ||
      modelId.startsWith("deepseek-ai/") || modelId.startsWith("qwen/") ||
      modelId.startsWith("z-ai/")) {
    return "nvidia";
  }
  if (modelId.startsWith("anthropic/")) return "openrouter";
  if (modelId.startsWith("openai/")) return "openrouter";
  if (modelId.startsWith("meta-llama/") || modelId.startsWith("mistralai/")) return "openrouter";

  // 3. Known model name prefixes
  if (modelId.startsWith("gpt-") || modelId.startsWith("o1") || modelId.startsWith("o3") || modelId.startsWith("o4")) {
    return "openai";
  }
  if (modelId.startsWith("claude-")) return "anthropic";
  if (modelId.startsWith("gemini-")) return "google";
  if (modelId.startsWith("glm-") || modelId.startsWith("glmz")) return "glm";

  return null;
}

// ─── LLM Config ────────────────────────────────────────────────────────────

/**
 * Get the fully-resolved LLM configuration for making API calls.
 *
 * Resolves model, provider, baseUrl, and apiKey from:
 *   1. Config file (model section)
 *   2. Environment variables
 *   3. Built-in defaults
 *
 * @param overrideModel - Optional model override (e.g. from request body)
 * @param overrideProvider - Optional provider override
 */
export function getLLMConfig(overrideModel?: string, overrideProvider?: string): LLMConfig {
  const config = loadConfig();
  const modelCfg = config.model as ModelConfig;

  // Model resolution:
  // 1. Explicit override
  // 2. Config default
  // 3. Provider-specific defaults
  let model = "";
  if (overrideModel?.trim()) {
    model = overrideModel.trim();
  } else if (modelCfg?.default?.trim()) {
    model = modelCfg.default.trim();
  }

  // Provider resolution — now model-aware:
  // 1. Explicit provider override
  // 2. Model → provider map lookup
  // 3. Config file / env var / auto-detect
  // 4. Fall back to "nvidia"
  let provider: string;
  if (overrideProvider?.trim() && overrideProvider !== "auto") {
    provider = overrideProvider.trim().toLowerCase();
  } else if (model) {
    const detected = detectProviderFromModel(model);
    if (detected) {
      provider = detected;
    } else {
      provider = resolveProvider();
    }
  } else {
    provider = resolveProvider();
  }

  const baseUrl = resolveBaseUrl(provider);
  const apiKey = resolveApiKey(provider);

  // Provider-specific default models
  if (!model) {
    switch (provider) {
      case "nvidia":
        model = "meta/llama-3.3-70b-instruct";
        break;
      case "openai":
        model = "gpt-4o";
        break;
      case "anthropic":
        model = "claude-sonnet-4-20250514";
        break;
      case "openrouter":
        model = "anthropic/claude-sonnet-4";
        break;
      case "google":
      case "gemini":
        model = "gemini-2.5-flash";
        break;
      case "glm":
      case "zai":
        model = "glm-4.5-flash";
        break;
      default:
        model = "gpt-4o-mini";
    }
  }

  // Determine API mode
  let apiMode: "chat_completions" | "anthropic_messages" = "chat_completions";
  if (modelCfg?.api_mode === "anthropic_messages") {
    apiMode = "anthropic_messages";
  } else if (provider === "anthropic") {
    apiMode = "anthropic_messages";
  }

  // Detect source
  let source = "default";
  if (overrideModel || overrideProvider) {
    source = "override";
  } else if (modelCfg?.default || modelCfg?.provider || modelCfg?.base_url) {
    source = "config";
  } else {
    // Check if we found keys in env
    for (const envVar of PROVIDER_AUTO_ORDER) {
      if (process.env[envVar]?.trim()) {
        source = "env";
        break;
      }
    }
  }

  return { model, provider, baseUrl, apiKey, apiMode, source };
}

// ─── Toolset Filtering ──────────────────────────────────────────────────────

/**
 * Get the list of enabled toolsets, filtered by config.
 *
 * @returns Object with enabled, disabled, and effective toolset lists.
 */
export function getToolsetFilter(): {
  enabled: string[];
  disabled: string[];
  effective: string[];
} {
  const config = loadConfig();

  // These come from the model config / agent config level
  const enabledToolsets: string[] = (config as Record<string, unknown>).enabled_toolsets as string[] || [];
  const disabledToolsets: string[] = (config as Record<string, unknown>).disabled_toolsets as string[] || [];

  // Base toolsets from config
  const baseToolsets: string[] = config.toolsets || ["hermes-cli"];

  // Apply filtering
  let effective = [...baseToolsets];

  if (enabledToolsets.length > 0) {
    // If enabled list is set, only include those that are also in the base list
    const enabledSet = new Set(enabledToolsets);
    effective = effective.filter((t) => enabledSet.has(t));
    // Also add any explicitly enabled toolsets not in base
    for (const t of enabledToolsets) {
      if (!effective.includes(t)) {
        effective.push(t);
      }
    }
  }

  if (disabledToolsets.length > 0) {
    const disabledSet = new Set(disabledToolsets);
    effective = effective.filter((t) => !disabledSet.has(t));
  }

  return {
    enabled: enabledToolsets,
    disabled: disabledToolsets,
    effective,
  };
}

// ─── Utility ────────────────────────────────────────────────────────────────

/**
 * Mask an API key for safe logging (shows first 8 and last 4 chars).
 */
export function maskApiKey(key: string): string {
  if (!key || key.length < 16) return "***";
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

/**
 * Get a summary of the current configuration for the health endpoint.
 */
export function getConfigSummary(): {
  hermesHome: string;
  model: string;
  provider: string;
  baseUrl: string;
  hasApiKey: boolean;
  apiMode: string;
  toolsets: string[];
  configVersion: number;
} {
  const llm = getLLMConfig();
  const toolsets = getToolsetFilter();
  return {
    hermesHome: getHermesHome(),
    model: llm.model,
    provider: llm.provider,
    baseUrl: llm.baseUrl,
    hasApiKey: !!llm.apiKey,
    apiMode: llm.apiMode,
    toolsets: toolsets.effective,
    configVersion: (getConfigValue("_config_version") as number) || 0,
  };
}
