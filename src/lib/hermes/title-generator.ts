/**
 * Title Generator — TypeScript rewrite of agent/title_generator.py
 *
 * Auto-generates short session titles from the first user/assistant exchange.
 * Uses the auxiliary LLM client (cheapest/fastest available model).
 * Should be called asynchronously after the first response is delivered so
 * it never adds latency to the user-facing reply.
 *
 * Server-side only.
 */

import { getLLMConfig, resolveApiKey, maskApiKey } from "./config";

// ─── Constants ──────────────────────────────────────────────────────────────

const TITLE_PROMPT =
  "Generate a short, descriptive title (3-7 words) for a conversation that starts with the " +
  "following exchange. The title should capture the main topic or intent. " +
  "Return ONLY the title text, nothing else. No quotes, no punctuation at the end, no prefixes.";

/** Maximum characters per input snippet */
const MAX_SNIPPET_LENGTH = 500;

/** Maximum characters for the returned title */
const MAX_TITLE_LENGTH = 80;

/** Default max_tokens for title generation */
const DEFAULT_MAX_TOKENS = 30;

/** Default temperature for title generation */
const DEFAULT_TEMPERATURE = 0.3;

/** Default timeout in milliseconds */
const DEFAULT_TIMEOUT_MS = 30_000;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate a session title from the first exchange.
 *
 * Uses the auxiliary LLM client (cheapest/fastest available model).
 * Returns the title string or null on failure.
 *
 * @param userMessage      - The user's first message
 * @param assistantResponse - The assistant's first response
 * @param config           - Optional configuration overrides
 */
export async function generateTitle(
  userMessage: string,
  assistantResponse: string,
  config?: {
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
  },
): Promise<string | null> {
  // Truncate long messages to keep the request small
  const userSnippet = (userMessage || "").slice(0, MAX_SNIPPET_LENGTH);
  const assistantSnippet = (assistantResponse || "").slice(0, MAX_SNIPPET_LENGTH);

  const maxTokens = config?.maxTokens ?? DEFAULT_MAX_TOKENS;
  const temperature = config?.temperature ?? DEFAULT_TEMPERATURE;
  const timeoutMs = config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Resolve LLM config for the cheapest/fastest model
  let baseUrl = config?.baseUrl;
  let apiKey = config?.apiKey;
  let model = config?.model;

  if (!model || !apiKey) {
    try {
      const llmConfig = getLLMConfig(model, undefined);
      model = model || llmConfig.model;
      apiKey = apiKey || llmConfig.apiKey;
      baseUrl = baseUrl || llmConfig.baseUrl;
    } catch {
      // Fall back to environment
      apiKey = apiKey || resolveApiKey("openai") || process.env.OPENAI_API_KEY || "";
      baseUrl = baseUrl || "https://api.openai.com/v1";
      model = model || "gpt-4o-mini";
    }
  }

  if (!apiKey) {
    console.log("[hermes:title-generator] No API key available — skipping title generation");
    return null;
  }

  const messages = [
    { role: "system" as const, content: TITLE_PROMPT },
    {
      role: "user" as const,
      content: `User: ${userSnippet}\n\nAssistant: ${assistantSnippet}`,
    },
  ];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": "Hermes-Agent-Web/1.0",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.debug(
        `[hermes:title-generator] API returned ${response.status}: ${response.statusText}`,
      );
      return null;
    }

    const data = await response.json();
    const rawTitle = data.choices?.[0]?.message?.content || "";
    let title = rawTitle.trim();

    // Clean up: remove quotes, trailing punctuation, prefixes like "Title: "
    title = title.replace(/^["']|["']$/g, "");
    if (title.toLowerCase().startsWith("title:")) {
      title = title.slice(6).trim();
    }

    // Enforce reasonable length
    if (title.length > MAX_TITLE_LENGTH) {
      title = title.slice(0, MAX_TITLE_LENGTH - 3) + "...";
    }

    return title || null;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.debug("[hermes:title-generator] Title generation timed out");
    } else {
      console.debug(
        `[hermes:title-generator] Title generation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return null;
  }
}
