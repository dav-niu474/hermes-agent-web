# Task ID: 2 — core-modules-agent

## Files Created

### 1. `/home/z/my-project/src/lib/hermes/context-compressor.ts` (~430 lines)
Ported from `hermes-agent/agent/context_compressor.py`.

**Exported types:**
- `CompressorConfig` — threshold, protect counts, summary target ratio
- `CompressionResult` — stats about a compression run
- `CompressorStatus` — current state (usage %, compression count)
- `SummarizeFn` — callback type for LLM-based summarization

**Exported class:**
- `ContextCompressor` — Full 5-phase compression algorithm:
  1. Prune old tool results (>200 chars) with cheap placeholder
  2. Protect head messages (configurable, default 3)
  3. Find tail boundary by token budget (scales with context window)
  4. Generate structured summary via `SummarizeFn` callback (iterative updates across compactions)
  5. Sanitize orphaned tool_call/result pairs post-compression

Key features:
- Accepts external `SummarizeFn` for LLM calls (decoupled from provider)
- Structured summary template: Goal, Constraints, Progress (Done/In Progress/Blocked), Key Decisions, Relevant Files, Next Steps, Critical Context
- Iterative summary updates preserve info across multiple compactions
- Boundary alignment prevents splitting tool_call/result groups
- Summary role selection avoids consecutive same-role messages

### 2. `/home/z/my-project/src/lib/hermes/title-generator.ts` (~110 lines)
Ported from `hermes-agent/agent/title_generator.py`.

**Exported function:**
- `generateTitle(userMessage, assistantResponse, config?)` → `Promise<string | null>`

Key features:
- Truncates inputs to 500 chars each
- Uses OpenAI-compatible API (configurable model, apiKey, baseUrl)
- Returns titles ≤80 chars
- max_tokens=30, temperature=0.3
- 30s timeout with AbortController
- Resolves config from hermes config system as fallback

### 3. `/home/z/my-project/src/lib/hermes/usage-pricing.ts` (~270 lines)
Ported from `hermes-agent/agent/usage_pricing.py`.

**Exported types:**
- `PricingEntry` — per-million costs for input, output, cache-read, cache-write
- `CostResult` — amountUsd, status, source, label

**Exported functions:**
- `estimateUsageCost(model, inputTokens, outputTokens, provider?, cacheRead?, cacheWrite?)` → `CostResult`
- `getPricingEntry(model, provider?)` → `PricingEntry | null`
- `hasKnownPricing(model, provider?)` → `boolean`
- `getPerMillionPricing(model, provider?)` → `{input, output}`
- `formatTokenCountCompact(value)` — "1.5M", "42K" formatting
- `formatDurationCompact(seconds)` — "45s", "2m", "1h 30m" formatting

Pricing table covers:
- **Anthropic**: Claude Opus 4, Sonnet 4, 3.5 Sonnet, 3.5 Haiku, 3 Opus, 3 Haiku
- **OpenAI**: GPT-4o, GPT-4o-mini, GPT-4 Turbo, GPT-4, o3, o3-mini
- **DeepSeek**: Chat, Reasoner
- **Google**: Gemini 2.5 Pro, 2.5 Flash, 2.0 Flash, 1.5 Pro, 1.5 Flash
- **GLM**: 4 Plus, 4, 4 Flash, 4V, 4V Plus, 4 Air, 4.5 Flash

### 4. `/home/z/my-project/src/lib/hermes/redact.ts` (~192 lines)
Ported from `hermes-agent/agent/redact.py`.

**Exported function:**
- `redactSensitiveText(text)` → `string`

Key features:
- 35 known API key prefix patterns (sk-, ghp_, AIza, AKIA, xox-, etc.)
- ENV assignment redaction (OPENAI_API_KEY=value)
- JSON field redaction ("apiKey": "value")
- Authorization header redaction (Bearer token)
- Telegram bot token redaction (bot<digits>:<token>)
- Private key block replacement
- Database connection string password masking
- E.164 phone number masking
- Short tokens (<18 chars) → fully masked as "***"
- Long tokens → preserve first 6 + last 4 chars
- Respects HERMES_REDACT_SECRETS env var for opt-out

### 5. Updated `/home/z/my-project/src/lib/hermes/index.ts`
Added barrel exports for all 4 new modules.

## Verification
- ESLint: 0 new errors (all 5 errors are pre-existing in hermes-agent/)
- Dev server compiles successfully (GET / 200)
