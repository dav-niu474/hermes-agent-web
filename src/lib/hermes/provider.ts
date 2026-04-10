/**
 * Hermes Provider Abstraction Layer — TypeScript rewrite of run_agent.py AIAgent
 * and agent/auxiliary_client.py provider system.
 *
 * Provides a unified interface for multiple LLM providers (NVIDIA NIM, OpenAI,
 * OpenRouter, Anthropic, Google/GLM, etc.) using the OpenAI SDK as the HTTP
 * client.  All providers expose the OpenAI chat.completions format.
 *
 * Server-side only.  Import from API routes or server actions.
 */

import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageFunctionToolCall,
} from "openai/resources/chat/completions";
import { getLLMConfig, type LLMConfig, maskApiKey } from "./config";

// ─── Types ──────────────────────────────────────────────────────────────────

/** A single message in the conversation. */
export type Message = ChatCompletionMessageParam;

/** A tool definition in standard OpenAI function-calling format. */
export type ToolDef = ChatCompletionTool;

/** Options passed to createChatCompletion (beyond messages/tools/stream). */
export interface CompletionOptions {
  /** Override model name */
  model?: string;
  /** Override temperature (0–2) */
  temperature?: number;
  /** Max tokens for the response */
  maxTokens?: number;
  /** Stop sequences */
  stop?: string | string[];
  /** Whether to force tool usage ("auto", "required", "none") */
  toolChoice?: "auto" | "required" | "none" | { type: "function"; function: { name: string } };
  /** Extra headers merged into every request */
  extraHeaders?: Record<string, string>;
  /** Reasoning effort for supported models (e.g. OpenRouter) */
  reasoning?: { enabled?: boolean; effort?: string };
}

/** Non-streaming response shape. */
export interface CompletionResponse {
  /** The assistant's text content (may be null if only tool calls). */
  content: string | null;
  /** Tool calls returned by the model. */
  toolCalls: ToolCall[] | null;
  /** Reasoning/thinking content extracted from the response (if any). */
  reasoningContent: string | null;
  /** Finish reason ("stop", "tool_calls", "length"). */
  finishReason: string;
  /** Token usage. */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null;
  /** The raw model name returned by the provider. */
  model: string;
}

/** A tool call returned by the model. */
export interface ToolCall {
  /** Tool call ID (for submitting results back). */
  id: string;
  /** Function name. */
  name: string;
  /** JSON-stringified arguments. */
  arguments: string;
}

/** A streaming chunk emitted during SSE streaming. */
export interface StreamChunk {
  /** Type of chunk. */
  type: "content" | "reasoning" | "tool_call" | "tool_call_delta" | "done" | "error";
  /** Text delta for content/reasoning chunks. */
  delta?: string;
  /** Full tool call (emitted once complete). */
  toolCall?: ToolCall;
  /** Partial tool call delta (index, name fragment, args fragment). */
  toolCallDelta?: {
    index: number;
    name?: string;
    arguments?: string;
  };
  /** Finish reason (emitted with "done" type). */
  finishReason?: string;
  /** Usage stats (emitted with "done" type). */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Error message. */
  error?: string;
}

// ─── Provider Interface ────────────────────────────────────────────────────

/**
 * Unified provider interface for LLM backends.
 * All providers use the OpenAI chat.completions format internally.
 */
export interface Provider {
  /** Provider slug (e.g. "nvidia", "openai", "openrouter"). */
  readonly name: string;

  /**
   * Create a non-streaming chat completion.
   */
  createChatCompletion(
    messages: Message[],
    tools?: ToolDef[],
    options?: CompletionOptions,
  ): Promise<CompletionResponse>;

  /**
   * Create a streaming chat completion.
   * Returns a ReadableStream that emits StreamChunk objects as JSON lines.
   */
  createStreamingCompletion(
    messages: Message[],
    tools?: ToolDef[],
    options?: CompletionOptions,
  ): ReadableStream<Uint8Array>;
}

// ─── Base Provider (shared OpenAI client logic) ────────────────────────────

/**
 * Abstract base provider that wraps the OpenAI SDK.
 * Handles common concerns: client creation, error wrapping, reasoning extraction.
 */
abstract class BaseProvider implements Provider {
  abstract readonly name: string;
  protected client: OpenAI;
  protected defaultModel: string;
  protected defaultHeaders: Record<string, string>;

  constructor(config: LLMConfig, extraHeaders: Record<string, string> = {}) {
    this.defaultModel = config.model;
    this.defaultHeaders = {
      "User-Agent": "Hermes-Agent-Web/1.0",
      ...extraHeaders,
    };

    const clientOptions = {
      apiKey: config.apiKey || "no-key-required",
      baseURL: config.baseUrl,
      defaultHeaders: this.defaultHeaders,
      timeout: 120_000, // 2 minute default
      maxRetries: 2,
    };

    this.client = new OpenAI(clientOptions);
  }

  async createChatCompletion(
    messages: Message[],
    tools?: ToolDef[],
    options?: CompletionOptions,
  ): Promise<CompletionResponse> {
    const model = options?.model || this.defaultModel;
    const startTime = Date.now();

    try {
      const params: OpenAI.ChatCompletionCreateParamsNonStreaming = {
        model,
        messages,
        ...(tools && tools.length > 0 ? { tools } : {}),
        ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
        ...(options?.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
        ...(options?.stop ? { stop: options.stop } : {}),
        ...(options?.toolChoice ? { tool_choice: options.toolChoice } : {}),
      };

      const response = await this.client.chat.completions.create(params);
      const choice = response.choices[0];
      const message = choice?.message;

      // Extract reasoning content (GLM models, some OpenRouter models)
      const reasoningContent = this.extractReasoningContent(message, response);

      // Extract tool calls
      const toolCalls = message?.tool_calls?.map((tc) => {
        if (tc.type === "function") {
          const fn = tc as ChatCompletionMessageFunctionToolCall;
          return {
            id: fn.id,
            name: fn.function.name,
            arguments: fn.function.arguments,
          };
        }
        return { id: tc.id, name: "", arguments: "" };
      }) ?? null;

      const elapsed = Date.now() - startTime;
      console.log(
        `[hermes:provider] ${this.name} completion (${elapsed}ms)` +
          ` model=${model}` +
          ` tokens=${response.usage?.total_tokens ?? "?"}`,
      );

      return {
        content: message?.content ?? null,
        toolCalls,
        reasoningContent,
        finishReason: choice?.finish_reason ?? "stop",
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : null,
        model: response.model,
      };
    } catch (err: unknown) {
      throw this.wrapError(err);
    }
  }

  createStreamingCompletion(
    messages: Message[],
    tools?: ToolDef[],
    options?: CompletionOptions,
  ): ReadableStream<Uint8Array> {
    const model = options?.model || this.defaultModel;
    const encoder = new TextEncoder();

    return new ReadableStream<Uint8Array>({
      start: async (controller) => {
        try {
          const params: OpenAI.ChatCompletionCreateParamsStreaming = {
            model,
            messages,
            stream: true,
            ...(tools && tools.length > 0 ? { tools } : {}),
            ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
            ...(options?.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
            ...(options?.stop ? { stop: options.stop } : {}),
            ...(options?.toolChoice ? { tool_choice: options.toolChoice } : {}),
          };

          const stream = await this.client.chat.completions.create(params);

          // Track tool call accumulation for multi-chunk tool calls
          const toolCallBuffers: Map<number, { id?: string; name?: string; args: string }> = new Map();

          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;

            // Reasoning content (some providers put it in delta)
            const deltaAny = delta as unknown as Record<string, unknown>;
            if (deltaAny?.reasoning_content || deltaAny?.reasoning) {
              const reasoningText =
                (deltaAny.reasoning as string) ||
                (deltaAny.reasoning_content as string) ||
                "";
              if (reasoningText) {
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({ type: "reasoning", delta: reasoningText } as StreamChunk) + "\n",
                  ),
                );
              }
            }

            // Text content
            if (delta?.content) {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({ type: "content", delta: delta.content } as StreamChunk) + "\n",
                ),
              );
            }

            // Tool calls (accumulated across chunks)
            if (delta?.tool_calls) {
              for (const tcDelta of delta.tool_calls) {
                const idx = tcDelta.index;
                if (!toolCallBuffers.has(idx)) {
                  toolCallBuffers.set(idx, { args: "" });
                }
                const buf = toolCallBuffers.get(idx)!;

                if (tcDelta.id) buf.id = tcDelta.id;
                if (tcDelta.function?.name) buf.name = tcDelta.function.name;
                if (tcDelta.function?.arguments) {
                  buf.args += tcDelta.function.arguments;
                  // Emit incremental delta for progress
                  controller.enqueue(
                    encoder.encode(
                      JSON.stringify({
                        type: "tool_call_delta",
                        toolCallDelta: {
                          index: idx,
                          name: tcDelta.function?.name,
                          arguments: tcDelta.function.arguments,
                        },
                      } as StreamChunk) + "\n",
                    ),
                  );
                }

                // If this is the last chunk for this tool call, emit the complete call
                if (chunk.choices[0]?.finish_reason === "tool_calls" && tcDelta.id) {
                  if (buf.id && buf.name) {
                    controller.enqueue(
                      encoder.encode(
                        JSON.stringify({
                          type: "tool_call",
                          toolCall: {
                            id: buf.id,
                            name: buf.name,
                            arguments: buf.args,
                          },
                        } as StreamChunk) + "\n",
                      ),
                    );
                  }
                }
              }
            }

            // Finish reason
            if (chunk.choices[0]?.finish_reason) {
              const reason = chunk.choices[0].finish_reason;

              // If finish_reason is tool_calls, flush any remaining buffered tool calls
              if (reason === "tool_calls") {
                for (const [idx, buf] of toolCallBuffers) {
                  if (buf.id && buf.name) {
                    controller.enqueue(
                      encoder.encode(
                        JSON.stringify({
                          type: "tool_call",
                          toolCall: {
                            id: buf.id,
                            name: buf.name,
                            arguments: buf.args,
                          },
                        } as StreamChunk) + "\n",
                      ),
                    );
                  }
                }
              }

              // Final done chunk with usage
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: "done",
                    finishReason: reason,
                    usage: chunk.usage
                      ? {
                          promptTokens: chunk.usage.prompt_tokens,
                          completionTokens: chunk.usage.completion_tokens,
                          totalTokens: chunk.usage.total_tokens,
                        }
                      : undefined,
                    model: chunk.model,
                  } as StreamChunk & { model?: string }) + "\n",
                ),
              );
            }
          }
        } catch (err: unknown) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "error",
                error: err instanceof Error ? err.message : String(err),
              } as StreamChunk) + "\n",
            ),
          );
        } finally {
          controller.close();
        }
      },
    });
  }

  /**
   * Extract reasoning/thinking content from a response.
   * GLM models return reasoning_content; some OpenRouter models use custom fields.
   */
  protected extractReasoningContent(
    message: OpenAI.ChatCompletionMessage | undefined,
    _response: OpenAI.ChatCompletion,
  ): string | null {
    if (!message) return null;

    // GLM models (z.ai) put reasoning in message.reasoning_content
    const msgAny = message as unknown as Record<string, unknown>;
    if (typeof msgAny.reasoning_content === "string" && msgAny.reasoning_content) {
      return msgAny.reasoning_content;
    }
    if (typeof msgAny.reasoning === "string" && msgAny.reasoning) {
      return msgAny.reasoning;
    }

    return null;
  }

  /**
   * Wrap an error into a descriptive Error with provider context.
   */
  protected wrapError(err: unknown): Error {
    if (err instanceof OpenAI.APIError) {
      const status = err.status;
      const message = err.message;

      // Categorize common errors
      if (status === 401) {
        return new Error(`[${this.name}] Authentication failed: ${message}. Check your API key.`);
      }
      if (status === 429) {
        return new Error(`[${this.name}] Rate limited: ${message}. Please retry after a delay.`);
      }
      if (status === 402) {
        return new Error(`[${this.name}] Payment required / credits exhausted: ${message}`);
      }
      if (status === 404 && message.includes("model")) {
        return new Error(`[${this.name}] Model not found: ${message}. Check the model name.`);
      }

      return new Error(`[${this.name}] API error (${status}): ${message}`);
    }

    if (err instanceof Error) {
      return new Error(`[${this.name}] ${err.message}`);
    }

    return new Error(`[${this.name}] Unknown error: ${String(err)}`);
  }
}

// ─── NVIDIA NIM Provider ───────────────────────────────────────────────────

/**
 * NVIDIA NIM provider using https://integrate.api.nvidia.com/v1
 * OpenAI-compatible chat completions API.
 *
 * Supports tool calling and streaming.  Models include:
 * - meta/llama-3.3-70b-instruct
 * - nvidia/llama-3.1-nemotron-70b-instruct
 * - mistralai/mixtral-8x22b-instruct-v0.1
 * - z-ai/glm4.7 (GLM on NIM — returns reasoning_content)
 */
export class NvidiaProvider extends BaseProvider {
  readonly name = "nvidia";

  constructor(config: LLMConfig) {
    super(config, {
      "X-Requested-With": "hermes-agent-web",
    });
    console.log(
      `[hermes:provider] NvidiaProvider initialized: model=${config.model} baseUrl=${config.baseUrl} key=${maskApiKey(config.apiKey)}`,
    );
  }
}

// ─── OpenAI Provider ───────────────────────────────────────────────────────

/**
 * Standard OpenAI API provider.
 * Supports GPT-4o, GPT-4o-mini, o1, o3, etc.
 */
export class OpenAIProvider extends BaseProvider {
  readonly name = "openai";

  constructor(config: LLMConfig) {
    super(config);
    console.log(
      `[hermes:provider] OpenAIProvider initialized: model=${config.model} key=${maskApiKey(config.apiKey)}`,
    );
  }
}

// ─── OpenRouter Provider ───────────────────────────────────────────────────

/**
 * OpenRouter provider — aggregates many model providers via a single API.
 * Requires HTTP-Referer and X-Title headers for attribution.
 * Supports reasoning config for models like Claude.
 */
export class OpenRouterProvider extends BaseProvider {
  readonly name = "openrouter";

  constructor(config: LLMConfig) {
    const extraHeaders: Record<string, string> = {
      "HTTP-Referer": "https://hermes-agent.nousresearch.com",
      "X-Title": "Hermes Agent Web",
    };
    // Enable fine-grained tool streaming for Claude models on OpenRouter
    // (prevents upstream proxy timeouts during long thinking phases)
    if (config.model.toLowerCase().includes("claude")) {
      extraHeaders["x-anthropic-beta"] = "fine-grained-tool-streaming-2025-05-14";
    }
    super(config, extraHeaders);
    console.log(
      `[hermes:provider] OpenRouterProvider initialized: model=${config.model} key=${maskApiKey(config.apiKey)}`,
    );
  }
}

// ─── Anthropic Provider ────────────────────────────────────────────────────

/**
 * Anthropic provider using the Messages API via OpenAI-compatible adapter.
 *
 * Anthropic's native API differs from OpenAI, but many third-party providers
 * (OpenRouter, AWS Bedrock, etc.) expose Anthropic models via OpenAI format.
 * For native Anthropic API access, this provider uses the OpenAI SDK pointed
 * at the Anthropic Messages endpoint (which some proxies translate).
 *
 * For true native Anthropic Messages API, the API mode is set to
 * "anthropic_messages" in the LLMConfig — callers should check this and
 * use a dedicated Anthropic SDK client if needed.
 */
export class AnthropicProvider extends BaseProvider {
  readonly name = "anthropic";

  constructor(config: LLMConfig) {
    super(config, {
      "anthropic-version": "2023-06-01",
    });
    console.log(
      `[hermes:provider] AnthropicProvider initialized: model=${config.model} key=${maskApiKey(config.apiKey)}`,
    );
  }
}

// ─── Google / Gemini Provider ─────────────────────────────────────────────

/**
 * Google Gemini provider using the OpenAI-compatible endpoint.
 * Base URL: https://generativelanguage.googleapis.com/v1beta/openai
 */
export class GoogleProvider extends BaseProvider {
  readonly name = "google";

  constructor(config: LLMConfig) {
    super(config);
    console.log(
      `[hermes:provider] GoogleProvider initialized: model=${config.model} key=${maskApiKey(config.apiKey)}`,
    );
  }
}

// ─── GLM / Z.AI Provider ──────────────────────────────────────────────────

/**
 * GLM (Z.AI) provider — supports GLM-4 series models.
 * GLM models may return reasoning_content field with chain-of-thought.
 * The provider wraps reasoning content in <think /> tags for display.
 *
 * Base URL: https://open.bigmodel.cn/api/paas/v4
 */
export class GlmProvider extends BaseProvider {
  readonly name = "glm";

  constructor(config: LLMConfig) {
    super(config);
    console.log(
      `[hermes:provider] GlmProvider initialized: model=${config.model} key=${maskApiKey(config.apiKey)}`,
    );
  }

  /**
   * GLM models return reasoning_content — wrap it in <think /> tags.
   */
  protected extractReasoningContent(
    message: OpenAI.ChatCompletionMessage | undefined,
    _response: OpenAI.ChatCompletion,
  ): string | null {
    const base = super.extractReasoningContent(message, _response);
    if (base) {
      // Wrap reasoning in think tags for display
      return `<think summary="reasoning">\n${base}\n</think summaries="reasoning">`;
    }
    return null;
  }
}

// ─── Provider Resolution ───────────────────────────────────────────────────

/** Provider class registry keyed by provider slug. */
const PROVIDER_CLASSES: Record<string, new (config: LLMConfig) => Provider> = {
  nvidia: NvidiaProvider,
  openai: OpenAIProvider,
  openrouter: OpenRouterProvider,
  anthropic: AnthropicProvider,
  google: GoogleProvider,
  gemini: GoogleProvider,
  glm: GlmProvider,
  zai: GlmProvider,
};

/**
 * Auto-detect and resolve the best provider from the current config + env.
 *
 * Creates a Provider instance ready for API calls.  The provider is
 * selected based on:
 *   1. Explicit provider override
 *   2. Config file model.provider
 *   3. HERMES_INFERENCE_PROVIDER env var
 *   4. Auto-detect from available API keys (priority: NVIDIA → OpenAI → Anthropic → OpenRouter → GLM → Google)
 *   5. Fall back to nvidia
 *
 * @param overrideModel - Optional model name override
 * @param overrideProvider - Optional provider slug override
 * @returns A Provider instance
 */
export function resolveProvider(overrideModel?: string, overrideProvider?: string): Provider {
  const config = getLLMConfig(overrideModel, overrideProvider);
  const providerClass = PROVIDER_CLASSES[config.provider];

  if (providerClass) {
    return new providerClass(config);
  }

  // Unknown provider — fall back to generic OpenAI-compatible provider
  console.warn(
    `[hermes:provider] Unknown provider "${config.provider}", using generic OpenAI-compatible client at ${config.baseUrl}`,
  );
  return new GenericProvider(config);
}

/**
 * Resolve a provider specifically for the chat route (non-streaming).
 * Shorthand for resolveProvider() when you only need completion calls.
 */
export function resolveChatProvider(overrideModel?: string, overrideProvider?: string): Provider {
  return resolveProvider(overrideModel, overrideProvider);
}

// ─── Generic Provider (fallback for custom/unknown endpoints) ──────────────

/**
 * Generic OpenAI-compatible provider for custom endpoints.
 * Used when the provider slug doesn't match any known provider.
 */
class GenericProvider extends BaseProvider {
  readonly name = "custom";

  constructor(config: LLMConfig) {
    super(config);
    console.log(
      `[hermes:provider] GenericProvider initialized: model=${config.model} baseUrl=${config.baseUrl} key=${maskApiKey(config.apiKey)}`,
    );
  }
}

// ─── SSE Stream Utilities ──────────────────────────────────────────────────

/**
 * Parse a stream of JSON-line chunks from a ReadableStream.
 *
 * @param stream - The ReadableStream<Uint8Array> from createStreamingCompletion
 * @param onChunk - Callback for each parsed StreamChunk
 * @returns Promise that resolves when the stream ends
 */
export async function consumeStream(
  stream: ReadableStream<Uint8Array>,
  onChunk: (chunk: StreamChunk) => void | Promise<void>,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const chunk = JSON.parse(trimmed) as StreamChunk;
          await onChunk(chunk);
        } catch {
          // Skip malformed lines
          console.debug(`[hermes:provider] Skipping malformed stream line: ${trimmed.slice(0, 100)}`);
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      try {
        const chunk = JSON.parse(buffer.trim()) as StreamChunk;
        await onChunk(chunk);
      } catch {
        // Ignore
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Merge reasoning content with response content for display.
 * Wraps reasoning in collapsible <think /> tags if present.
 *
 * GLM models return reasoning_content separately; this helper
 * merges it into the main content for the chat UI.
 */
export function mergeReasoningContent(
  content: string | null,
  reasoningContent: string | null,
): string {
  if (!reasoningContent) return content || "";

  // If reasoning is already wrapped in tags, don't double-wrap
  if (reasoningContent.includes("<think")) {
    return reasoningContent + "\n\n" + (content || "");
  }

  const wrapped = `<think summary="reasoning">\n${reasoningContent}\n</think summaries="reasoning">`;
  return wrapped + "\n\n" + (content || "");
}
