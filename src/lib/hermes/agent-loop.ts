/**
 * Hermes Agent — Core Agent Loop
 *
 * Implements the hermes-agent tool-calling loop in TypeScript.
 * This is THE MOST CRITICAL file — it drives the entire agent lifecycle:
 *
 *   1. Build system prompt (identity + memory + skills + tools guidance)
 *   2. Send messages + tool definitions to the LLM
 *   3. If response has tool_calls → execute each tool → append results → loop
 *   4. If no tool_calls → return final response
 *   5. Streaming support via callback events
 *
 * Ported from hermes-agent/run_agent.py (AIAgent) and
 * hermes-agent/environments/agent_loop.py (HermesAgentLoop).
 */

import OpenAI from "openai";
import { buildSystemPrompt } from "./prompt-builder";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentConfig {
  /** Model identifier (e.g. "meta/llama-3.3-70b-instruct") */
  model: string;
  /** Maximum tool-calling iterations (default: 90) */
  maxIterations?: number;
  /** Only enable tools from these toolsets */
  enabledToolsets?: string[];
  /** Disable tools from these toolsets */
  disabledToolsets?: string[];
  /** Provider identifier (for telemetry/routing) */
  provider?: string;
  /** API key for the LLM service */
  apiKey?: string;
  /** Base URL for the LLM API */
  baseUrl?: string;
  /** Custom system prompt override */
  systemPrompt?: string;
  /** Platform the user is on (e.g. "web", "cli", "api_server") */
  platform?: string;
  /** Maximum tokens per response (null = model default) */
  maxTokens?: number;
  /** Session ID for tracking */
  sessionId?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface AgentMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  reasoning_content?: string;
}

/** SSE event types for streaming responses */
export interface SSEEvent {
  type: "delta" | "tool_start" | "tool_end" | "reasoning" | "done" | "error";
  data: string | object;
}

/** Token usage returned by the API */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** Return type of AgentLoop.run() */
export interface AgentResult {
  /** Full conversation history in OpenAI message format */
  messages: AgentMessage[];
  /** The final text response from the model */
  finalResponse: string;
  /** How many LLM calls were made */
  turnsUsed: number;
  /** True if the model stopped naturally (vs hitting budget) */
  finishedNaturally: boolean;
  /** Token usage across all API calls */
  usage: TokenUsage;
}

// ---------------------------------------------------------------------------
// Tool Registry interface
// ---------------------------------------------------------------------------

/** Context passed to tool handlers */
export interface ToolContext {
  /** Unique task/session identifier */
  taskId: string;
  /** The user's original task description */
  userTask?: string;
  /** Current session ID */
  sessionId?: string;
}

/**
 * Tool handler function signature.
 * Takes parsed arguments and context, returns a string result.
 */
export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolContext,
) => string | Promise<string>;

/** Interface for the tool registry used by the agent loop */
export interface ToolRegistry {
  /** Get OpenAI-format tool definitions for the API call */
  getToolDefinitions(): OpenAI.ChatCompletionTool[];
  /** Get the set of valid tool names */
  getValidToolNames(): Set<string>;
  /** Dispatch a tool call by name */
  dispatch(
    name: string,
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<string>;
}

/**
 * Minimal interface for memory context injection.
 * The agent loop calls `getMemoryContext()` once before the tool loop
 * to get the memory block for the system prompt.
 */
export interface MemoryManager {
  getMemoryContext(query?: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Iteration Budget
// ---------------------------------------------------------------------------

/**
 * Tracks how many iterations the agent has consumed.
 * Mirrors hermes-agent's IterationBudget class.
 */
export class IterationBudget {
  maxTotal: number;
  private _used = 0;

  constructor(maxTotal: number) {
    this.maxTotal = maxTotal;
  }

  /** Try to consume one iteration. Returns true if allowed. */
  consume(): boolean {
    if (this._used >= this.maxTotal) return false;
    this._used += 1;
    return true;
  }

  /** Refund one iteration (e.g. for execute_code turns). */
  refund(): void {
    if (this._used > 0) this._used -= 1;
  }

  get used(): number {
    return this._used;
  }

  get remaining(): number {
    return Math.max(0, this.maxTotal - this._used);
  }
}

// ---------------------------------------------------------------------------
// Parallel execution helpers
// ---------------------------------------------------------------------------

/** Tools that must NEVER run concurrently (interactive / user-facing). */
const NEVER_PARALLEL_TOOLS = new Set(["clarify"]);

/** Read-only tools with no shared mutable session state. */
const PARALLEL_SAFE_TOOLS = new Set([
  "ha_get_state",
  "ha_list_entities",
  "ha_list_services",
  "read_file",
  "search_files",
  "session_search",
  "skill_view",
  "skills_list",
  "vision_analyze",
  "web_extract",
  "web_search",
]);

/** File tools can run concurrently when they target independent paths. */
const PATH_SCOPED_TOOLS = new Set(["read_file", "write_file", "patch"]);

/** Max concurrent workers for parallel tool execution. */
const MAX_TOOL_WORKERS = 8;

/**
 * Check whether a batch of tool calls is safe to run in parallel.
 * Mirrors hermes-agent's `_should_parallelize_tool_batch()`.
 */
function shouldParallelizeToolBatch(toolCalls: ToolCall[]): boolean {
  if (toolCalls.length <= 1) return false;

  const toolNames = toolCalls.map((tc) => tc.function.name);
  if (toolNames.some((name) => NEVER_PARALLEL_TOOLS.has(name))) return false;

  const reservedPaths: string[] = [];

  for (const toolCall of toolCalls) {
    const toolName = toolCall.function.name;
    let functionArgs: Record<string, unknown>;

    try {
      functionArgs = JSON.parse(toolCall.function.arguments);
    } catch {
      // Can't parse args — default to sequential
      return false;
    }

    if (!functionArgs || typeof functionArgs !== "object" || Array.isArray(functionArgs)) {
      return false;
    }

    if (PATH_SCOPED_TOOLS.has(toolName)) {
      const rawPath = functionArgs["path"];
      if (typeof rawPath !== "string" || !rawPath.trim()) return false;
      const normalised = rawPath.replace(/^~/, process.env.HOME ?? "/");
      if (reservedPaths.some((existing) => pathsOverlap(normalised, existing))) {
        return false;
      }
      reservedPaths.push(normalised);
      continue;
    }

    if (!PARALLEL_SAFE_TOOLS.has(toolName)) return false;
  }

  return true;
}

/**
 * Simple overlap check: two file paths are considered overlapping if one
 * is a prefix of the other (separated by /).
 */
function pathsOverlap(a: string, b: string): boolean {
  const aParts = a.replace(/\/+$/, "").split("/");
  const bParts = b.replace(/\/+$/, "").split("/");
  const commonLen = Math.min(aParts.length, bParts.length);
  return aParts.slice(0, commonLen).join("/") === bParts.slice(0, commonLen).join("/");
}

// ---------------------------------------------------------------------------
// Budget pressure
// ---------------------------------------------------------------------------

const BUDGET_CAUTION_THRESHOLD = 0.7;
const BUDGET_WARNING_THRESHOLD = 0.9;

/**
 * Return a budget pressure string to inject into the last tool result,
 * or null if not yet needed.
 *
 * Two-tier system:
 *   - Caution (70%): nudge to consolidate work
 *   - Warning (90%): urgent, must respond now
 */
function getBudgetWarning(
  currentIteration: number,
  maxIterations: number,
): string | null {
  if (maxIterations <= 0) return null;

  const progress = currentIteration / maxIterations;
  const remaining = maxIterations - currentIteration;

  if (progress >= BUDGET_WARNING_THRESHOLD) {
    return (
      `[BUDGET WARNING: Iteration ${currentIteration}/${maxIterations}. ` +
      `Only ${remaining} iteration(s) left. ` +
      "Provide your final response NOW. No more tool calls unless absolutely critical.]"
    );
  }

  if (progress >= BUDGET_CAUTION_THRESHOLD) {
    return (
      `[BUDGET: Iteration ${currentIteration}/${maxIterations}. ` +
      `${remaining} iterations left. Start consolidating your work.]`
    );
  }

  return null;
}

/**
 * Inject a budget warning into the last tool-result message.
 * Appends as text if the content is not valid JSON, or as a `_budget_warning`
 * key if it is a JSON object.
 */
function injectBudgetWarning(
  messages: AgentMessage[],
  warning: string,
): void {
  if (!messages.length) return;
  const last = messages[messages.length - 1];
  if (last.role !== "tool") return;

  const content = last.content;
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      parsed._budget_warning = warning;
      last.content = JSON.stringify(parsed);
      return;
    }
  } catch {
    // Not JSON — append as text
  }

  last.content = content + "\n\n" + warning;
}

// ---------------------------------------------------------------------------
// Sanitise surrogates (invalid UTF-8 that crashes JSON.stringify)
// ---------------------------------------------------------------------------

const SURROGATE_RE = /[\ud800-\udfff]/g;

function sanitizeSurrogates(text: string): string {
  if (SURROGATE_RE.test(text)) {
    return text.replace(SURROGATE_RE, "\ufffd");
  }
  return text;
}

// ---------------------------------------------------------------------------
// Agent Loop
// ---------------------------------------------------------------------------

export class AgentLoop {
  private readonly config: Required<
    Pick<AgentConfig, "maxIterations" | "platform">
  > & AgentConfig;
  private readonly toolRegistry: ToolRegistry;
  private readonly memoryManager?: MemoryManager;
  private readonly taskId: string;
  private readonly validToolNames: Set<string>;
  private readonly toolSchemas: OpenAI.ChatCompletionTool[];
  private budget: IterationBudget;
  private _cachedSystemPrompt: string | null = null;

  constructor(
    config: AgentConfig,
    toolRegistry: ToolRegistry,
    memoryManager?: MemoryManager,
  ) {
    this.config = {
      ...config,
      maxIterations: config.maxIterations ?? 90,
      platform: config.platform ?? "web",
    };
    this.toolRegistry = toolRegistry;
    this.memoryManager = memoryManager;

    this.taskId =
      config.sessionId ?? `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    this.toolSchemas = toolRegistry.getToolDefinitions();
    this.validToolNames = toolRegistry.getValidToolNames();
    this.budget = new IterationBudget(this.config.maxIterations);
  }

  // =====================================================================
  // Public API
  // =====================================================================

  /**
   * Run the full agent loop.
   *
   * @param messages - Initial conversation messages (system + user turns).
   * @param options  - Optional stream/onEvent callbacks.
   * @returns Complete agent result with message history and metadata.
   */
  async run(
    messages: AgentMessage[],
    options?: {
      stream?: boolean;
      sessionId?: string;
      onEvent?: (event: SSEEvent) => void;
    },
  ): Promise<AgentResult> {
    const onEvent = options?.onEvent;
    const sessionId = options?.sessionId ?? this.config.sessionId;

    // Reset budget for this run
    this.budget = new IterationBudget(this.config.maxIterations);

    // Deep copy messages to avoid mutating the caller's array
    const workingMessages: AgentMessage[] = messages.map((m) => ({ ...m }));

    // Build system prompt (cached)
    let systemPrompt = this._cachedSystemPrompt;
    if (!systemPrompt) {
      systemPrompt = await this.buildSystemPrompt();
      this._cachedSystemPrompt = systemPrompt;
    }

    let apiCallCount = 0;
    let finalResponse = "";
    let finishedNaturally = false;
    let totalUsage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };

    // Extract user task for context
    const userTask = this.extractUserTask(workingMessages);

    // Prefetch memory context once
    let memoryBlock = "";
    if (this.memoryManager) {
      try {
        memoryBlock = await this.memoryManager.getMemoryContext(userTask);
      } catch {
        // Memory failure is non-fatal
      }
    }

    // Main loop
    while (this.budget.remaining > 0) {
      if (!this.budget.consume()) break;

      apiCallCount += 1;

      // Assemble API messages
      const apiMessages = this.prepareApiMessages(
        workingMessages,
        systemPrompt,
        memoryBlock,
      );

      // Make the LLM call
      let response: OpenAI.ChatCompletion;
      try {
        response = await this.callLLM(apiMessages, options?.stream, onEvent);
      } catch (err) {
        onEvent?.({
          type: "error",
          data: `API call failed on iteration ${apiCallCount}: ${err instanceof Error ? err.message : String(err)}`,
        });
        break;
      }

      // Accumulate usage
      if (response.usage) {
        totalUsage.inputTokens += response.usage.prompt_tokens ?? 0;
        totalUsage.outputTokens += response.usage.completion_tokens ?? 0;
        totalUsage.totalTokens += response.usage.total_tokens ?? 0;
      }

      // Extract the assistant message
      const choice = response.choices?.[0];
      if (!choice?.message) {
        onEvent?.({
          type: "error",
          data: `Empty response on iteration ${apiCallCount}`,
        });
        break;
      }

      const assistantMsg = choice.message;

      // Extract reasoning content (GLM models return reasoning_content)
      const reasoningContent =
        (assistantMsg as OpenAI.ChatCompletion.AssistantMessage & {
          reasoning_content?: string;
        }).reasoning_content ?? null;

      if (reasoningContent) {
        onEvent?.({
          type: "reasoning",
          data: this.handleReasoningContent(reasoningContent),
        });
      }

      // Check for tool calls
      const toolCalls = assistantMsg.tool_calls;

      if (toolCalls && toolCalls.length > 0) {
        // Validate and normalise tool call JSON
        const validatedCalls = this.validateToolCallArguments(toolCalls);
        if (!validatedCalls) {
          // JSON was unfixable — inject error results and continue loop
          continue;
        }

        // Build assistant message for history
        const assistantMessage: AgentMessage = {
          role: "assistant",
          content: assistantMsg.content ?? "",
          tool_calls: validatedCalls,
        };
        if (reasoningContent) {
          assistantMessage.reasoning_content = reasoningContent;
        }
        workingMessages.push(assistantMessage);

        // Execute tool calls
        await this.executeToolCalls(
          validatedCalls,
          workingMessages,
          { taskId: this.taskId, userTask, sessionId },
          apiCallCount,
          onEvent,
        );

        // Inject budget pressure warning into the last tool result
        const warning = getBudgetWarning(apiCallCount, this.config.maxIterations);
        if (warning) {
          injectBudgetWarning(workingMessages, warning);
          onEvent?.({
            type: "reasoning",
            data: warning,
          });
        }

        // Continue loop for next response
        continue;
      } else {
        // No tool calls — this is the final response
        finalResponse = assistantMsg.content ?? "";

        // Strip think blocks from final response for display
        finalResponse = this.stripThinkBlocks(finalResponse);

        const msgEntry: AgentMessage = {
          role: "assistant",
          content: finalResponse,
        };
        if (reasoningContent) {
          msgEntry.reasoning_content = reasoningContent;
        }
        workingMessages.push(msgEntry);

        finishedNaturally = true;
        break;
      }
    }

    onEvent?.({ type: "done", data: { finishedNaturally, turnsUsed: apiCallCount } });

    return {
      messages: workingMessages,
      finalResponse,
      turnsUsed: apiCallCount,
      finishedNaturally,
      usage: totalUsage,
    };
  }

  // =====================================================================
  // System prompt
  // =====================================================================

  /**
   * Build the complete system prompt.
   * Assembles identity + memory + skills + tool guidance.
   */
  async buildSystemPrompt(): Promise<string> {
    return buildSystemPrompt({
      platform: this.config.platform,
      memoryContext: this.memoryManager
        ? await this.memoryManager.getMemoryContext()
        : undefined,
      availableToolNames: this.validToolNames,
      model: this.config.model,
      soulMd: this.config.systemPrompt,
      sessionId: this.config.sessionId,
      provider: this.config.provider,
    });
  }

  // =====================================================================
  // Tool execution
  // =====================================================================

  /**
   * Process a single tool call and return the result string.
   */
  async executeToolCall(
    toolCall: ToolCall,
    context: ToolContext,
  ): Promise<string> {
    const { name, arguments: argsStr } = toolCall.function;

    // Validate tool name
    if (!this.validToolNames.has(name)) {
      return JSON.stringify({
        error: `Unknown tool '${name}'. Available tools: ${Array.from(this.validToolNames).sort().join(", ")}`,
      });
    }

    // Parse arguments
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsStr);
      if (!args || typeof args !== "object" || Array.isArray(args)) {
        args = {};
      }
    } catch (err) {
      return JSON.stringify({
        error: `Invalid JSON in tool arguments: ${err instanceof Error ? err.message : String(err)}. Please retry with valid JSON.`,
      });
    }

    try {
      return await this.toolRegistry.dispatch(name, args, context);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : String(err);
      return JSON.stringify({
        error: `Tool execution failed: ${errorMsg}`,
      });
    }
  }

  /**
   * Handle reasoning content from GLM models.
   * Wraps reasoning in `<think: ... >` tags for display.
   */
  handleReasoningContent(content: string | null): string {
    if (!content) return "";
    return `<think: ${content} >`;
  }

  // =====================================================================
  // Private helpers
  // =====================================================================

  /**
   * Call the LLM with the given messages and tool definitions.
   */
  private async callLLM(
    messages: OpenAI.ChatCompletionMessageParam[],
    stream: boolean | undefined,
    onEvent?: (event: SSEEvent) => void,
  ): Promise<OpenAI.ChatCompletion> {
    const client = this.createClient();

    const chatParams: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model: this.config.model,
      messages,
      n: 1,
      temperature: 1.0,
    };

    // Attach tools if we have any
    if (this.toolSchemas.length > 0) {
      chatParams.tools = this.toolSchemas;
    }

    // Max tokens if specified
    if (this.config.maxTokens) {
      chatParams.max_tokens = this.config.maxTokens;
    }

    if (stream && onEvent) {
      // Streaming path
      const streamResponse = await client.chat.completions.create({
        ...chatParams,
        stream: true,
      });

      let content = "";
      let toolCallsAcc: OpenAI.ChatCompletionMessage.ToolCall[] = [];
      let finishReason: OpenAI.ChatCompletion.Choice["finish_reason"] = "stop";

      for await (const chunk of streamResponse as AsyncIterable<OpenAI.ChatCompletionChunk>) {
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        finishReason = chunk.choices?.[0]?.finish_reason ?? finishReason;

        // Content delta
        if (delta.content) {
          content += delta.content;
          onEvent({ type: "delta", data: delta.content });
        }

        // Reasoning content delta
        const reasoningDelta = (delta as { reasoning_content?: string })
          .reasoning_content;
        if (reasoningDelta) {
          onEvent({ type: "reasoning", data: reasoningDelta });
        }

        // Tool call deltas — accumulate pieces
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            while (toolCallsAcc.length <= idx) {
              toolCallsAcc.push({
                id: "",
                type: "function",
                function: { name: "", arguments: "" },
              });
            }
            if (tc.id) toolCallsAcc[idx].id = tc.id;
            if (tc.function?.name) toolCallsAcc[idx].function.name += tc.function.name;
            if (tc.function?.arguments)
              toolCallsAcc[idx].function.arguments += tc.function.arguments;
          }
        }
      }

      // Build a synthetic ChatCompletion from accumulated data
      const message: OpenAI.ChatCompletion.AssistantMessage = {
        role: "assistant",
        content: content || null,
      };

      if (toolCallsAcc.length > 0) {
        message.tool_calls = toolCallsAcc;
      }

      // Copy reasoning_content from accumulated delta
      const rcAccumulator: string[] = [];
      // We already fired reasoning events via onEvent above,
      // but we need to reconstruct for the return value.

      return {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: this.config.model,
        choices: [
          {
            index: 0,
            message,
            finish_reason: finishReason ?? "stop",
          },
        ],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      };
    }

    // Non-streaming path
    return client.chat.completions.create(chatParams);
  }

  /**
   * Create an OpenAI client from the config.
   */
  private createClient(): OpenAI {
    const apiKey = this.config.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    const baseUrl = this.config.baseUrl;

    if (baseUrl) {
      return new OpenAI({ apiKey, baseURL: baseUrl });
    }

    return new OpenAI({ apiKey });
  }

  /**
   * Prepare messages for the API call.
   * - Prepends the system prompt
   * - Sanitises reasoning_content fields
   * - Strips internal-only fields
   */
  private prepareApiMessages(
    messages: AgentMessage[],
    systemPrompt: string,
    memoryBlock: string,
  ): OpenAI.ChatCompletionMessageParam[] {
    const apiMessages: OpenAI.ChatCompletionMessageParam[] = [];

    // System prompt with optional memory injection
    let effectiveSystem = systemPrompt;
    if (memoryBlock) {
      effectiveSystem = effectiveSystem + "\n\n" + memoryBlock;
    }

    apiMessages.push({
      role: "system",
      content: effectiveSystem,
    });

    for (const msg of messages) {
      // Skip system messages from history (we prepended our own)
      if (msg.role === "system") continue;

      if (msg.role === "assistant") {
        const assistantMsg: OpenAI.ChatCompletionMessageParam & {
          reasoning_content?: string;
        } = {
          role: "assistant",
          content: msg.content || null,
        };

        // Attach tool calls if present
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          assistantMsg.tool_calls = msg.tool_calls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          }));
        }

        // Pass reasoning_content for multi-turn reasoning continuity
        if (msg.reasoning_content) {
          assistantMsg.reasoning_content = msg.reasoning_content;
        }

        apiMessages.push(assistantMsg as OpenAI.ChatCompletionMessageParam);
        continue;
      }

      if (msg.role === "tool") {
        apiMessages.push({
          role: "tool",
          tool_call_id: msg.tool_call_id ?? "",
          content: msg.content,
        });
        continue;
      }

      // user message
      apiMessages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    return apiMessages;
  }

  /**
   * Validate tool call argument JSON strings.
   * Returns null if the arguments are unfixable (should continue loop without
   * appending anything — the caller will inject error results).
   * Returns the validated (and possibly fixed) tool calls otherwise.
   */
  private validateToolCallArguments(
    toolCalls: OpenAI.ChatCompletionMessage.ToolCall[],
  ): ToolCall[] | null {
    const invalidArgs: { name: string; error: string }[] = [];
    const normalised: ToolCall[] = [];

    for (const tc of toolCalls) {
      let args = tc.function.arguments;

      // Handle non-string arguments
      if (args === null || args === undefined) {
        args = "{}";
      }

      // Ensure it's a string
      if (typeof args !== "string") {
        try {
          args = JSON.stringify(args);
        } catch {
          args = "{}";
        }
      }

      // Treat empty/whitespace as empty object
      if (!args.trim()) {
        args = "{}";
      }

      // Validate JSON
      try {
        JSON.parse(args);
      } catch (err) {
        invalidArgs.push({
          name: tc.function.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      normalised.push({
        id: tc.id,
        type: "function",
        function: {
          name: tc.function.name,
          arguments: args,
        },
      });
    }

    if (invalidArgs.length > 0) {
      // Rather than returning null and forcing the caller to handle it,
      // return the normalised calls but the caller should inject error
      // results for the invalid ones.  We fix the JSON to "{}" for
      // calls with empty args so the loop can still proceed for valid calls.
      // Mark invalid ones by injecting error results directly.
      return normalised;
    }

    return normalised;
  }

  /**
   * Execute a batch of tool calls, either in parallel or sequentially.
   * Appends tool-result messages to the messages array.
   */
  private async executeToolCalls(
    toolCalls: ToolCall[],
    messages: AgentMessage[],
    context: ToolContext,
    apiCallCount: number,
    onEvent?: (event: SSEEvent) => void,
  ): Promise<void> {
    if (shouldParallelizeToolBatch(toolCalls)) {
      await this.executeToolCallsParallel(
        toolCalls,
        messages,
        context,
        onEvent,
      );
    } else {
      await this.executeToolCallsSequential(
        toolCalls,
        messages,
        context,
        onEvent,
      );
    }
  }

  /**
   * Execute tool calls sequentially.
   */
  private async executeToolCallsSequential(
    toolCalls: ToolCall[],
    messages: AgentMessage[],
    context: ToolContext,
    onEvent?: (event: SSEEvent) => void,
  ): Promise<void> {
    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i];
      const toolName = tc.function.name;

      onEvent?.({
        type: "tool_start",
        data: {
          index: i,
          name: toolName,
          arguments: tc.function.arguments,
        },
      });

      // Validate the tool name
      let result: string;
      if (!this.validToolNames.has(toolName)) {
        result = JSON.stringify({
          error: `Unknown tool '${toolName}'. Available tools: ${Array.from(this.validToolNames).sort().join(", ")}`,
        });
      } else {
        // Check for invalid JSON
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(tc.function.arguments);
          if (!args || typeof args !== "object" || Array.isArray(args)) {
            args = {};
          }
        } catch (err) {
          result = JSON.stringify({
            error: `Invalid JSON in tool arguments: ${err instanceof Error ? err.message : String(err)}. Please retry with valid JSON.`,
          });
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          });
          onEvent?.({
            type: "tool_end",
            data: { index: i, name: toolName, result },
          });
          continue;
        }

        result = await this.executeToolCall(tc, context);
      }

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result,
      });

      onEvent?.({
        type: "tool_end",
        data: { index: i, name: toolName, result },
      });
    }
  }

  /**
   * Execute tool calls concurrently for read-only / independent tools.
   * Results are appended in the original tool-call order.
   */
  private async executeToolCallsParallel(
    toolCalls: ToolCall[],
    messages: AgentMessage[],
    context: ToolContext,
    onEvent?: (event: SSEEvent) => void,
  ): Promise<void> {
    const results = new Array<string | null>(toolCalls.length).fill(null);

    // Fire all start events
    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i];
      onEvent?.({
        type: "tool_start",
        data: {
          index: i,
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      });
    }

    // Execute in parallel with limited concurrency
    const maxWorkers = Math.min(toolCalls.length, MAX_TOOL_WORKERS);
    const executing: Promise<void>[] = [];

    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i];
      const idx = i;

      // Respect maxWorkers by awaiting when at capacity
      if (executing.length >= maxWorkers) {
        await Promise.race(executing);
      }

      const promise = (async () => {
        try {
          results[idx] = await this.executeToolCall(tc, context);
        } catch (err) {
          results[idx] = JSON.stringify({
            error: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      })();

      executing.push(promise);

      // Clean up resolved promises
      promise.then(() => {
        const pos = executing.indexOf(promise);
        if (pos !== -1) executing.splice(pos, 1);
      });
    }

    // Wait for all remaining
    await Promise.all(executing);

    // Append results in original order
    for (let i = 0; i < toolCalls.length; i++) {
      const result = results[i] ?? JSON.stringify({ error: "Tool did not return a result" });
      messages.push({
        role: "tool",
        tool_call_id: toolCalls[i].id,
        content: result,
      });

      onEvent?.({
        type: "tool_end",
        data: { index: i, name: toolCalls[i].function.name, result },
      });
    }
  }

  /**
   * Extract the user task from the first user message.
   */
  private extractUserTask(messages: AgentMessage[]): string {
    for (const msg of messages) {
      if (msg.role === "user" && msg.content?.trim()) {
        return msg.content.trim().slice(0, 500);
      }
    }
    return "";
  }

  /**
   * Strip `<think: ...>` blocks from response text for clean display.
   */
  private stripThinkBlocks(text: string): string {
    // Remove think blocks (with nested angle brackets)
    return text.replace(/<think:[\s\S]*?>/g, "").trim();
  }
}
