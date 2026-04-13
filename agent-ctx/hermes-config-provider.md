# Task: Hermes Config & Provider TypeScript Rewrite

**Status**: ✅ Completed
**Date**: 2025-07-11

## Summary
Created 2 TypeScript files implementing the hermes-agent configuration manager and provider abstraction layer, rewritten from the Python source (`hermes_cli/config.py`, `hermes_constants.py`, `run_agent.py`, `agent/auxiliary_client.py`, `hermes_cli/runtime_provider.py`).

## Files Created

### 1. `src/lib/hermes/config.ts` — Configuration Manager (~450 lines)

Mirrors the Python config system for the Next.js backend:

**Path & Home Management:**
- `getHermesHome()` → reads `HERMES_HOME` env var, falls back to `~/.hermes`
- `getConfigPath()` → `~/.hermes/config.yaml`
- `getEnvPath()` → `~/.hermes/.env`
- `ensureHermesHome()` → creates directory structure with subdirs (sessions, logs, skills, memory)

**Config Loading:**
- `loadConfig(forceReload?)` → reads config.yaml via `js-yaml`, merges over `DEFAULT_CONFIG`, normalizes legacy keys, expands `${ENV_VAR}` references, in-process cache
- `invalidateConfigCache()` → forces next loadConfig() to re-read disk
- `getConfigValue(key, defaultValue?)` → dot-path access (e.g. `"agent.max_turns"`)
- `updateConfig(updates)` → merges updates and persists to config.yaml

**Provider Resolution:**
- `detectAvailableProviders()` → scans env vars for API keys, returns provider slugs
- `resolveProvider(override?)` → precedence: explicit override → config model.provider → HERMES_INFERENCE_PROVIDER env → auto-detect from API keys → fallback to "nvidia"
- `resolveApiKey(provider)` → provider-specific env var lookup with fallbacks
- `resolveBaseUrl(provider)` → config base_url override → env var → provider defaults

**LLM Config:**
- `getLLMConfig(overrideModel?, overrideProvider?)` → returns `{ model, provider, baseUrl, apiKey, apiMode, source }` with full resolution chain

**Toolset Filtering:**
- `getToolsetFilter()` → returns `{ enabled, disabled, effective }` toolset lists from config

**Environment Variables Supported:**
- `NVIDIA_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_TOKEN`, `OPENROUTER_API_KEY`, `GLM_API_KEY`, `ZAI_API_KEY`, `Z_AI_API_KEY`, `GOOGLE_API_KEY`, `GEMINI_API_KEY`
- `HERMES_INFERENCE_PROVIDER`, `HERMES_HOME`

**Provider Constants:**
- NVIDIA NIM: `https://integrate.api.nvidia.com/v1`
- OpenRouter: `https://openrouter.ai/api/v1`
- OpenAI: `https://api.openai.com/v1`
- Anthropic: `https://api.anthropic.com`
- GLM/Z.AI: `https://open.bigmodel.cn/api/paas/v4`
- Google/Gemini: `https://generativelanguage.googleapis.com/v1beta/openai`

### 2. `src/lib/hermes/provider.ts` — Provider Abstraction Layer (~735 lines)

Mirrors `run_agent.py` AIAgent.__init__ and `agent/auxiliary_client.py` provider routing:

**Core Interface:**
- `Provider` interface with `name`, `createChatCompletion()`, `createStreamingCompletion()`
- `CompletionOptions` → model, temperature, maxTokens, stop, toolChoice, extraHeaders, reasoning
- `CompletionResponse` → content, toolCalls, reasoningContent, finishReason, usage, model
- `StreamChunk` → type union (content | reasoning | tool_call | tool_call_delta | done | error)
- `ToolCall` → id, name, arguments (standard OpenAI format)

**Base Provider (abstract):**
- Wraps OpenAI SDK as HTTP client for all providers
- Handles error categorization (401 auth, 429 rate limit, 402 payment, 404 model)
- Extracts `reasoning_content` from GLM/nonstandard model responses
- Streaming via `ReadableStream<Uint8Array>` with JSON-line protocol
- Tool call accumulation across streaming chunks with buffer tracking

**Concrete Providers:**
- `NvidiaProvider` — NVIDIA NIM API with attribution header
- `OpenAIProvider` — Standard OpenAI API
- `OpenRouterProvider` — Attribution headers + fine-grained tool streaming for Claude models
- `AnthropicProvider` — Messages API version header
- `GoogleProvider` — Gemini via OpenAI-compatible endpoint
- `GlmProvider` — GLM/Z.AI with `<think />` tag wrapping for reasoning_content
- `GenericProvider` — Fallback for unknown/custom endpoints

**Resolution:**
- `resolveProvider(overrideModel?, overrideProvider?)` → auto-detects and instantiates correct provider
- Provider registry maps slugs → classes (nvidia, openai, openrouter, anthropic, google, gemini, glm, zai)

**Stream Utilities:**
- `consumeStream(stream, onChunk)` → async parser for JSON-line ReadableStream
- `mergeReasoningContent(content, reasoningContent)` → merges thinking into display content with `<think />` tags

## Dependencies Installed
- `openai@6.34.0` — HTTP client / SDK for all providers
- `js-yaml@4.1.1` — YAML config file parsing

## Technical Notes
- ESLint: zero new errors in both files (5 pre-existing in hermes-agent/ unrelated)
- TypeScript: zero type errors in config.ts and provider.ts
- Dev server compiles and runs successfully (no import/module errors)
- Server-side only — no client-side imports
- All providers use OpenAI chat.completions format (matching hermes-agent's approach)
- Streaming uses JSON-line protocol over ReadableStream (compatible with SSE consumers)
