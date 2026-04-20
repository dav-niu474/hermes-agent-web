/**
 * Shared Model Catalog — Single Source of Truth
 *
 * All model definitions live here.  Both the backend (config.ts)
 * and the frontend (chat-view.tsx) import from this file so the
 * list is always in sync.
 *
 * Each entry carries:
 *   id        – model identifier passed to providers (must match MODEL_PROVIDER_MAP key)
 *   name      – human-readable short name shown in the UI
 *   provider  – provider slug used by getLLMConfig() ("nvidia" | "openai" | …)
 *   group     – display group name in the model selector dropdown
 *   desc      – one-line description shown below the name
 *   tags?     – optional tags like "reasoning", "fast", "vision"
 */

export interface ModelDef {
  id: string;
  name: string;
  provider: string;
  group: string;
  desc: string;
  tags?: string[];
}

// ────────────────────────────────────────────────────────────
//  Model Definitions
// ────────────────────────────────────────────────────────────

const MODELS: ModelDef[] = [
  // ── NVIDIA NIM ──────────────────────────────────────────
  { id: "meta/llama-3.3-70b-instruct",          name: "Llama 3.3 70B",                provider: "nvidia",     group: "NVIDIA NIM",          desc: "Meta Llama 3.3 70B Instruct" },
  { id: "meta/llama-3.1-405b-instruct",          name: "Llama 3.1 405B",               provider: "nvidia",     group: "NVIDIA NIM",          desc: "Meta Llama 3.1 405B Instruct" },
  { id: "meta/llama-3.1-8b-instruct",            name: "Llama 3.1 8B",                 provider: "nvidia",     group: "NVIDIA NIM",          desc: "Meta Llama 3.1 8B Instruct", tags: ["fast"] },
  { id: "mistralai/mixtral-8x22b-instruct-v0.1", name: "Mixtral 8x22B",                provider: "nvidia",     group: "NVIDIA NIM",          desc: "Mistral Mixtral 8x22B Instruct" },
  { id: "mistralai/mistral-large-instruct-2407",  name: "Mistral Large",                provider: "nvidia",     group: "NVIDIA NIM",          desc: "Mistral Large Instruct 2407" },
  { id: "google/gemma-2-27b-it",                  name: "Gemma 2 27B",                  provider: "nvidia",     group: "NVIDIA NIM",          desc: "Google Gemma 2 27B IT" },
  { id: "google/gemma-2-9b-it",                   name: "Gemma 2 9B",                   provider: "nvidia",     group: "NVIDIA NIM",          desc: "Google Gemma 2 9B IT", tags: ["fast"] },
  { id: "nvidia/nemotron-4-340b-instruct",        name: "Nemotron 4 340B",              provider: "nvidia",     group: "NVIDIA NIM",          desc: "NVIDIA Nemotron 4 340B Instruct" },
  { id: "nvidia/llama-3.1-nemotron-70b-instruct", name: "Nemotron 70B",                 provider: "nvidia",     group: "NVIDIA NIM",          desc: "NVIDIA Nemotron 70B Instruct" },
  { id: "nvidia/llama-3.1-nemotron-ultra-253b",   name: "Nemotron Ultra 253B",          provider: "nvidia",     group: "NVIDIA NIM",          desc: "NVIDIA Nemotron Ultra 253B" },
  { id: "nvidia/llama3-70b-instruct",             name: "Llama3 70B (NVIDIA)",          provider: "nvidia",     group: "NVIDIA NIM",          desc: "NVIDIA-tuned Llama3 70B Instruct" },
  { id: "nvidia/llama3-8b-instruct",              name: "Llama3 8B (NVIDIA)",           provider: "nvidia",     group: "NVIDIA NIM",          desc: "NVIDIA-tuned Llama3 8B Instruct", tags: ["fast"] },
  { id: "deepseek-ai/deepseek-r1",                name: "DeepSeek R1",                  provider: "nvidia",     group: "NVIDIA NIM",          desc: "DeepSeek R1 reasoning model", tags: ["reasoning"] },
  { id: "deepseek-ai/deepseek-r1-distill-llama-70b", name: "DeepSeek R1 Distill 70B",  provider: "nvidia",     group: "NVIDIA NIM",          desc: "DeepSeek R1 distilled to Llama 70B", tags: ["reasoning"] },
  { id: "qwen/qwen2.5-72b-instruct",              name: "Qwen 2.5 72B",                 provider: "nvidia",     group: "NVIDIA NIM",          desc: "Alibaba Qwen 2.5 72B Instruct" },
  { id: "qwen/qwq-32b",                           name: "QwQ 32B",                      provider: "nvidia",     group: "NVIDIA NIM",          desc: "Alibaba QwQ 32B reasoning model", tags: ["reasoning"] },
  { id: "z-ai/glm4.7",                            name: "GLM 4.7 (NIM)",                provider: "nvidia",     group: "NVIDIA NIM",          desc: "ZhipuAI GLM 4.7 coding & reasoning model", tags: ["reasoning"] },
  { id: "z-ai/glm5",                              name: "GLM 5 (NIM)",                  provider: "nvidia",     group: "NVIDIA NIM",          desc: "ZhipuAI GLM 5 744B MoE" },
  { id: "z-ai/glm-5.1",                           name: "GLM 5.1 (NIM)",                provider: "nvidia",     group: "NVIDIA NIM",          desc: "ZhipuAI GLM-5.1 flagship agentic coding model", tags: ["reasoning"] },
  { id: "minimaxai/minimax-m2.7",                 name: "MiniMax M2.7",                  provider: "nvidia",     group: "NVIDIA NIM",          desc: "MiniMax M2.7 230B MoE agentic model" },
  { id: "minimaxai/minimax-m2.5",                 name: "MiniMax M2.5",                  provider: "nvidia",     group: "NVIDIA NIM",          desc: "MiniMax M2.5 230B MoE coding & reasoning model" },

  // ── OpenAI ──────────────────────────────────────────────
  { id: "gpt-4o",                                  name: "GPT-4o",                       provider: "openai",     group: "OpenAI",              desc: "OpenAI GPT-4o multimodal" },
  { id: "gpt-4o-mini",                             name: "GPT-4o Mini",                  provider: "openai",     group: "OpenAI",              desc: "OpenAI GPT-4o Mini (fast)", tags: ["fast"] },
  { id: "gpt-4-turbo",                             name: "GPT-4 Turbo",                  provider: "openai",     group: "OpenAI",              desc: "OpenAI GPT-4 Turbo" },
  { id: "gpt-4",                                   name: "GPT-4",                        provider: "openai",     group: "OpenAI",              desc: "OpenAI GPT-4" },
  { id: "gpt-3.5-turbo",                           name: "GPT-3.5 Turbo",                provider: "openai",     group: "OpenAI",              desc: "OpenAI GPT-3.5 Turbo (fast)", tags: ["fast"] },
  { id: "o1-mini",                                 name: "o1-mini",                      provider: "openai",     group: "OpenAI",              desc: "OpenAI o1 reasoning model", tags: ["reasoning"] },
  { id: "o1",                                      name: "o1",                           provider: "openai",     group: "OpenAI",              desc: "OpenAI o1 reasoning model", tags: ["reasoning"] },
  { id: "o3-mini",                                 name: "o3-mini",                      provider: "openai",     group: "OpenAI",              desc: "OpenAI o3-mini reasoning", tags: ["reasoning", "fast"] },
  { id: "o3",                                      name: "o3",                           provider: "openai",     group: "OpenAI",              desc: "OpenAI o3 reasoning model", tags: ["reasoning"] },
  { id: "o4-mini",                                 name: "o4-mini",                      provider: "openai",     group: "OpenAI",              desc: "OpenAI o4-mini reasoning", tags: ["reasoning", "fast"] },

  // ── Anthropic ───────────────────────────────────────────
  { id: "claude-sonnet-4-20250514",                name: "Claude Sonnet 4",              provider: "anthropic",  group: "Anthropic",           desc: "Anthropic Claude Sonnet 4 (latest)" },
  { id: "claude-3-5-sonnet-20241022",              name: "Claude 3.5 Sonnet",            provider: "anthropic",  group: "Anthropic",           desc: "Anthropic Claude 3.5 Sonnet" },
  { id: "claude-3-5-haiku-20241022",               name: "Claude 3.5 Haiku",             provider: "anthropic",  group: "Anthropic",           desc: "Anthropic Claude 3.5 Haiku (fast)", tags: ["fast"] },
  { id: "claude-3-opus-20240229",                  name: "Claude 3 Opus",                provider: "anthropic",  group: "Anthropic",           desc: "Anthropic Claude 3 Opus" },
  { id: "claude-3-sonnet-20240229",                name: "Claude 3 Sonnet",              provider: "anthropic",  group: "Anthropic",           desc: "Anthropic Claude 3 Sonnet" },
  { id: "claude-3-haiku-20240307",                 name: "Claude 3 Haiku",               provider: "anthropic",  group: "Anthropic",           desc: "Anthropic Claude 3 Haiku (fast)", tags: ["fast"] },

  // ── Google Gemini ───────────────────────────────────────
  { id: "gemini-2.5-flash",                        name: "Gemini 2.5 Flash",             provider: "google",     group: "Google",              desc: "Google Gemini 2.5 Flash" },
  { id: "gemini-2.0-flash",                        name: "Gemini 2.0 Flash",             provider: "google",     group: "Google",              desc: "Google Gemini 2.0 Flash" },
  { id: "gemini-1.5-pro",                          name: "Gemini 1.5 Pro",               provider: "google",     group: "Google",              desc: "Google Gemini 1.5 Pro" },
  { id: "gemini-1.5-flash",                        name: "Gemini 1.5 Flash",             provider: "google",     group: "Google",              desc: "Google Gemini 1.5 Flash", tags: ["fast"] },
  { id: "gemini-pro",                              name: "Gemini Pro",                   provider: "google",     group: "Google",              desc: "Google Gemini Pro" },

  // ── GLM / ZhipuAI (direct) ─────────────────────────────
  { id: "glm-4-plus",                              name: "GLM-4 Plus",                   provider: "glm",        group: "GLM (ZhipuAI)",       desc: "ZhipuAI GLM-4 Plus" },
  { id: "glm-4-0520",                              name: "GLM-4 (0520)",                 provider: "glm",        group: "GLM (ZhipuAI)",       desc: "ZhipuAI GLM-4 0520 version" },
  { id: "glm-4",                                   name: "GLM-4",                        provider: "glm",        group: "GLM (ZhipuAI)",       desc: "ZhipuAI GLM-4" },
  { id: "glm-4-air",                               name: "GLM-4 Air",                    provider: "glm",        group: "GLM (ZhipuAI)",       desc: "ZhipuAI GLM-4 Air (fast)", tags: ["fast"] },
  { id: "glm-4-airx",                              name: "GLM-4 AirX",                   provider: "glm",        group: "GLM (ZhipuAI)",       desc: "ZhipuAI GLM-4 AirX (fast)", tags: ["fast"] },
  { id: "glm-4-flash",                             name: "GLM-4 Flash",                  provider: "glm",        group: "GLM (ZhipuAI)",       desc: "ZhipuAI GLM-4 Flash (fast)", tags: ["fast"] },
  { id: "glm-4-long",                              name: "GLM-4 Long",                   provider: "glm",        group: "GLM (ZhipuAI)",       desc: "ZhipuAI GLM-4 Long context" },
  { id: "glm-4.5-flash",                           name: "GLM-4.5 Flash",                provider: "glm",        group: "GLM (ZhipuAI)",       desc: "ZhipuAI GLM-4.5 Flash (fast)", tags: ["fast"] },
  { id: "glm-4v-plus",                             name: "GLM-4V Plus",                  provider: "glm",        group: "GLM (ZhipuAI)",       desc: "ZhipuAI GLM-4V Plus (vision)", tags: ["vision"] },
  { id: "glm-4v",                                  name: "GLM-4V",                       provider: "glm",        group: "GLM (ZhipuAI)",       desc: "ZhipuAI GLM-4V (vision)", tags: ["vision"] },
  { id: "glm-z1-air",                              name: "GLM-Z1 Air",                   provider: "glm",        group: "GLM (ZhipuAI)",       desc: "ZhipuAI GLM-Z1 Air reasoning", tags: ["reasoning"] },
  { id: "glm-z1-airx",                             name: "GLM-Z1 AirX",                  provider: "glm",        group: "GLM (ZhipuAI)",       desc: "ZhipuAI GLM-Z1 AirX reasoning", tags: ["reasoning"] },
  { id: "glm-z1-flash",                            name: "GLM-Z1 Flash",                 provider: "glm",        group: "GLM (ZhipuAI)",       desc: "ZhipuAI GLM-Z1 Flash reasoning", tags: ["reasoning", "fast"] },
  { id: "glm-z1-32b",                              name: "GLM-Z1 32B",                   provider: "glm",        group: "GLM (ZhipuAI)",       desc: "ZhipuAI GLM-Z1 32B reasoning", tags: ["reasoning"] },

  // ── OpenRouter ─────────────────────────────────────────
  { id: "anthropic/claude-sonnet-4",               name: "Claude Sonnet 4 (OR)",         provider: "openrouter", group: "OpenRouter",          desc: "Anthropic Claude Sonnet 4 via OpenRouter" },
  { id: "openai/gpt-4o",                           name: "GPT-4o (OR)",                  provider: "openrouter", group: "OpenRouter",          desc: "OpenAI GPT-4o via OpenRouter" },
  { id: "google/gemini-2.0-flash-001",             name: "Gemini 2.0 Flash (OR)",        provider: "openrouter", group: "OpenRouter",          desc: "Google Gemini 2.0 Flash via OpenRouter" },
  { id: "meta-llama/llama-3.1-70b-instruct",      name: "Llama 3.1 70B (OR)",           provider: "openrouter", group: "OpenRouter",          desc: "Meta Llama 3.1 70B via OpenRouter" },
  { id: "mistralai/mistral-large",                 name: "Mistral Large (OR)",           provider: "openrouter", group: "OpenRouter",          desc: "Mistral Large via OpenRouter" },
];

// ────────────────────────────────────────────────────────────
//  Derived structures
// ────────────────────────────────────────────────────────────

/** Flat list of all models */
export const ALL_MODELS = MODELS;

/** Default model for new conversations */
export const DEFAULT_MODEL = "glm-4-flash";

/** MODEL_PROVIDER_MAP: model-id → provider slug (used by backend config.ts) */
export const MODEL_PROVIDER_MAP: Record<string, string> = Object.fromEntries(
  MODELS.map((m) => [m.id, m.provider]),
);

/** Grouped for the model selector dropdown */
export interface ModelGroup {
  provider: string;
  models: ModelDef[];
}

export const MODEL_GROUPS: ModelGroup[] = (() => {
  const groupMap = new Map<string, ModelDef[]>();
  for (const m of MODELS) {
    const arr = groupMap.get(m.group) ?? [];
    arr.push(m);
    groupMap.set(m.group, arr);
  }
  return [...groupMap.entries()].map(([provider, models]) => ({
    provider,
    models,
  }));
})();

/** Lookup helpers */
export function getModelName(modelId: string): string {
  const found = MODELS.find((m) => m.id === modelId);
  if (found) return found.name;
  const parts = modelId.split("/");
  return parts[parts.length - 1] || modelId;
}

export function getModelDef(modelId: string): ModelDef | undefined {
  return MODELS.find((m) => m.id === modelId);
}
