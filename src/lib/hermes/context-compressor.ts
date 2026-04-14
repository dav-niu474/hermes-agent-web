/**
 * Context Compressor — TypeScript rewrite of agent/context_compressor.py
 *
 * Compresses conversation context when approaching the model's context limit.
 * Uses a lightweight LLM call to summarize middle conversation turns while
 * protecting head and tail context.
 *
 * Algorithm:
 *   1. Prune old tool results (cheap, no LLM call)
 *   2. Protect head messages (system prompt + first exchange)
 *   3. Protect tail messages by token budget (most recent ~20K tokens)
 *   4. Summarize middle turns with structured LLM prompt
 *   5. On subsequent compactions, iteratively update the previous summary
 *
 * Server-side only.
 */

import type { AgentMessage } from "./agent-loop";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CompressorConfig {
  /** Percentage of context window that triggers compression (default: 0.50) */
  thresholdPercent?: number;
  /** Number of messages to protect at the start (default: 3) */
  protectFirstN?: number;
  /** Number of messages to protect at the end (default: 20) */
  protectLastN?: number;
  /** Target ratio of summary tokens relative to compressed content (default: 0.20) */
  summaryTargetRatio?: number;
}

export interface CompressionResult {
  compressed: boolean;
  originalMessages: number;
  compressedMessages: number;
  tokensBefore?: number;
  tokensAfter?: number;
  summary?: string;
}

export interface CompressorStatus {
  lastPromptTokens: number;
  thresholdTokens: number;
  contextLength: number;
  usagePercent: number;
  compressionCount: number;
}

export interface SummarizeFn {
  (prompt: string, maxTokens?: number): Promise<string | null>;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SUMMARY_PREFIX =
  "[CONTEXT COMPACTION] Earlier turns in this conversation were compacted " +
  "to save context space. The summary below describes work that was " +
  "already completed, and the current session state may still reflect " +
  "that work (for example, files may already be changed). Use the summary " +
  "and the current state to continue from where things left off, and " +
  "avoid repeating work:";

const LEGACY_SUMMARY_PREFIX = "[CONTEXT SUMMARY]:";

const MIN_SUMMARY_TOKENS = 2000;
const SUMMARY_RATIO = 0.20;
const SUMMARY_TOKENS_CEILING = 12_000;
const PRUNED_TOOL_PLACEHOLDER =
  "[Old tool output cleared to save context space]";
const CHARS_PER_TOKEN = 4;
const SUMMARY_FAILURE_COOLDOWN_SECONDS = 600;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Rough token estimate for a list of messages.
 * Uses ~4 chars per token heuristic.
 */
function estimateMessagesTokensRough(messages: AgentMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    total += (msg.content?.length ?? 0) + 10; // +10 for role/metadata
    for (const tc of msg.tool_calls ?? []) {
      total += (tc.function.arguments?.length ?? 0) + 20; // +20 for function name/metadata
    }
  }
  return total / CHARS_PER_TOKEN;
}

/**
 * Get context length for common models.
 * Falls back to 128K for unknown models.
 */
function getModelContextLength(model: string, contextLengthOverride?: number): number {
  if (contextLengthOverride && contextLengthOverride > 0) return contextLengthOverride;

  const lower = model.toLowerCase();
  // Anthropic models
  if (lower.includes("claude")) return 200_000;
  // Google Gemini
  if (lower.includes("gemini-2.5")) return 1_048_576; // 1M
  if (lower.includes("gemini")) return 128_000;
  // GLM models
  if (lower.includes("glm")) return 128_000;
  // OpenAI models
  if (lower.includes("gpt-4o")) return 128_000;
  if (lower.includes("gpt-4")) return 128_000;
  if (lower.includes("o3") || lower.includes("o4")) return 200_000;
  if (lower.includes("o1")) return 200_000;
  // DeepSeek
  if (lower.includes("deepseek")) return 64_000;
  // Llama models
  if (lower.includes("llama-3.3") || lower.includes("llama-3.1")) return 128_000;
  // Default
  return 128_000;
}

/**
 * Normalize summary text to the current compaction handoff format.
 */
function withSummaryPrefix(summary: string): string {
  let text = (summary || "").trim();
  for (const prefix of [LEGACY_SUMMARY_PREFIX, SUMMARY_PREFIX]) {
    if (text.startsWith(prefix)) {
      text = text.slice(prefix.length).trim();
      break;
    }
  }
  return text ? `${SUMMARY_PREFIX}\n${text}` : SUMMARY_PREFIX;
}

/**
 * Truncate content for summary serialization, preserving head and tail.
 */
function truncateContent(content: string, maxLen = 3000): string {
  if (content.length <= maxLen) return content;
  return (
    content.slice(0, Math.floor(maxLen * 0.67)) +
    "\n...[truncated]...\n" +
    content.slice(-Math.floor(maxLen * 0.27))
  );
}

/**
 * Serialize conversation turns into labeled text for the summarizer.
 */
function serializeForSummary(turns: AgentMessage[]): string {
  const parts: string[] = [];

  for (const msg of turns) {
    const role = msg.role;
    let content = msg.content || "";

    // Tool results: keep more content (3000 chars)
    if (role === "tool") {
      const toolId = msg.tool_call_id || "";
      content = truncateContent(content, 3000);
      parts.push(`[TOOL RESULT ${toolId}]: ${content}`);
      continue;
    }

    // Assistant messages: include tool call names AND arguments
    if (role === "assistant") {
      content = truncateContent(content, 3000);
      const toolCalls = msg.tool_calls || [];
      if (toolCalls.length > 0) {
        const tcParts: string[] = [];
        for (const tc of toolCalls) {
          const name = tc.function.name;
          let args = tc.function.arguments || "";
          if (args.length > 500) args = args.slice(0, 400) + "...";
          tcParts.push(`  ${name}(${args})`);
        }
        content += "\n[Tool calls:\n" + tcParts.join("\n") + "\n]";
      }
      parts.push(`[ASSISTANT]: ${content}`);
      continue;
    }

    // User and other roles
    content = truncateContent(content, 3000);
    parts.push(`[${role.toUpperCase()}]: ${content}`);
  }

  return parts.join("\n\n");
}

// ─── Context Compressor Class ───────────────────────────────────────────────

export class ContextCompressor {
  private readonly thresholdPercent: number;
  private readonly protectFirstN: number;
  private readonly protectLastN: number;
  private readonly summaryTargetRatio: number;
  private readonly contextLength: number;
  private readonly thresholdTokens: number;
  private readonly tailTokenBudget: number;
  private readonly maxSummaryTokens: number;
  private readonly summarizeFn: SummarizeFn | null;

  private compressionCount = 0;
  private lastPromptTokens = 0;
  private lastCompletionTokens = 0;
  private lastTotalTokens = 0;
  private previousSummary: string | null = null;
  private summaryFailureCooldownUntil = 0;

  constructor(
    model: string,
    config?: CompressorConfig,
    summarizeFn?: SummarizeFn,
    baseUrl?: string,
    api_key?: string,
    provider?: string,
    contextLengthOverride?: number,
  ) {
    this.thresholdPercent = config?.thresholdPercent ?? 0.50;
    this.protectFirstN = config?.protectFirstN ?? 3;
    this.protectLastN = config?.protectLastN ?? 20;
    this.summaryTargetRatio = Math.max(
      0.10,
      Math.min(config?.summaryTargetRatio ?? 0.20, 0.80),
    );

    this.contextLength = getModelContextLength(model, contextLengthOverride);
    this.thresholdTokens = Math.floor(this.contextLength * this.thresholdPercent);

    // Derive token budgets
    const targetTokens = Math.floor(this.thresholdTokens * this.summaryTargetRatio);
    this.tailTokenBudget = targetTokens;
    this.maxSummaryTokens = Math.min(
      Math.floor(this.contextLength * 0.05),
      SUMMARY_TOKENS_CEILING,
    );

    this.summarizeFn = summarizeFn ?? null;

    console.log(
      `[hermes:compressor] Initialized: model=${model} contextLength=${this.contextLength} ` +
        `threshold=${this.thresholdTokens} (${(this.thresholdPercent * 100).toFixed(0)}%) ` +
        `tailBudget=${this.tailTokenBudget}`,
    );
  }

  // ─── Public API ──────────────────────────────────────────────────────

  /**
   * Update tracked token usage from API response.
   */
  updateFromResponse(usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  }): void {
    this.lastPromptTokens = usage.prompt_tokens ?? 0;
    this.lastCompletionTokens = usage.completion_tokens ?? 0;
    this.lastTotalTokens = usage.total_tokens ?? 0;
  }

  /**
   * Check if context exceeds the compression threshold.
   */
  shouldCompress(currentTokens?: number): boolean {
    const tokens = currentTokens ?? this.lastPromptTokens;
    return tokens >= this.thresholdTokens;
  }

  /**
   * Quick pre-flight check using rough estimate (before API call).
   */
  shouldCompressPreflight(messages: AgentMessage[]): boolean {
    return estimateMessagesTokensRough(messages) >= this.thresholdTokens;
  }

  /**
   * Get current compression status for display/logging.
   */
  getStatus(): CompressorStatus {
    return {
      lastPromptTokens: this.lastPromptTokens,
      thresholdTokens: this.thresholdTokens,
      contextLength: this.contextLength,
      usagePercent:
        this.contextLength
          ? Math.min(100, (this.lastPromptTokens / this.contextLength) * 100)
          : 0,
      compressionCount: this.compressionCount,
    };
  }

  /**
   * Compress conversation messages by summarizing middle turns.
   *
   * Returns the compressed messages array and optional summary.
   */
  async compress(
    messages: AgentMessage[],
    currentTokens?: number,
  ): Promise<{ messages: AgentMessage[]; summary?: string }> {
    const nMessages = messages.length;

    if (nMessages <= this.protectFirstN + this.protectLastN + 1) {
      console.warn(
        `[hermes:compressor] Cannot compress: only ${nMessages} messages (need > ${this.protectFirstN + this.protectLastN + 1})`,
      );
      return { messages };
    }

    const displayTokens =
      currentTokens ?? this.lastPromptTokens ?? estimateMessagesTokensRough(messages);

    // Deep copy messages to avoid mutating the caller's array
    const copyMessage = (m: AgentMessage): AgentMessage => ({
      ...m,
      tool_calls: m.tool_calls?.map((tc) => ({ ...tc, function: { ...tc.function } })),
    });
    let workingMessages: AgentMessage[] = messages.map(copyMessage);

    // Phase 1: Prune old tool results (cheap, no LLM call)
    const { messages: prunedMessages, prunedCount } = this.pruneOldToolResults(
      workingMessages,
      this.protectLastN * 3,
    );
    workingMessages = prunedMessages;
    if (prunedCount > 0) {
      console.log(`[hermes:compressor] Pre-compression: pruned ${prunedCount} old tool result(s)`);
    }

    // Phase 2: Determine boundaries
    let compressStart = this.protectFirstN;
    compressStart = this.alignBoundaryForward(workingMessages, compressStart);
    const compressEnd = this.findTailCutByTokens(workingMessages, compressStart);

    if (compressStart >= compressEnd) {
      return { messages };
    }

    const turnsToSummarize = workingMessages.slice(compressStart, compressEnd);

    console.log(
      `[hermes:compressor] Compression triggered (${displayTokens} tokens >= ${this.thresholdTokens} threshold). ` +
        `Summarizing turns ${compressStart + 1}-${compressEnd} (${turnsToSummarize.length} turns)`,
    );

    // Phase 3: Generate structured summary
    const summary = await this.generateSummary(turnsToSummarize);

    // Phase 4: Assemble compressed message list
    const compressed: AgentMessage[] = [];

    for (let i = 0; i < compressStart; i++) {
      const msg = { ...workingMessages[i] };
      // Annotate system prompt on first compression
      if (i === 0 && msg.role === "system" && this.compressionCount === 0) {
        msg.content =
          (msg.content || "") +
          "\n\n[Note: Some earlier conversation turns have been compacted into a handoff summary to preserve context space. The current session state may still reflect earlier work, so build on that summary and state rather than re-doing work.]";
      }
      compressed.push(msg);
    }

    let mergeSummaryIntoTail = false;
    if (summary) {
      const lastHeadRole =
        compressStart > 0
          ? workingMessages[compressStart - 1].role
          : "user";
      const firstTailRole =
        compressEnd < workingMessages.length
          ? workingMessages[compressEnd].role
          : "user";

      let summaryRole: "user" | "assistant";
      if (lastHeadRole === "assistant" || lastHeadRole === "tool") {
        summaryRole = "user";
      } else {
        summaryRole = "assistant";
      }

      if (summaryRole === firstTailRole) {
        const flipped: "user" | "assistant" =
          summaryRole === "user" ? "assistant" : "user";
        if (flipped !== lastHeadRole) {
          summaryRole = flipped;
        } else {
          mergeSummaryIntoTail = true;
        }
      }

      if (!mergeSummaryIntoTail) {
        compressed.push({ role: summaryRole, content: summary });
      }
    } else {
      console.log("[hermes:compressor] No summary model available — middle turns dropped without summary");
    }

    for (let i = compressEnd; i < workingMessages.length; i++) {
      const msg = { ...workingMessages[i] };
      if (mergeSummaryIntoTail && i === compressEnd && summary) {
        const original = msg.content || "";
        msg.content = summary + "\n\n" + original;
        mergeSummaryIntoTail = false;
      }
      compressed.push(msg);
    }

    this.compressionCount++;

    // Sanitize tool pairs after compression
    const sanitized = this.sanitizeToolPairs(compressed);

    const savedEstimate = displayTokens - estimateMessagesTokensRough(sanitized);
    console.log(
      `[hermes:compressor] Compressed: ${nMessages} → ${sanitized.length} messages (~${Math.round(savedEstimate)} tokens saved). Compression #${this.compressionCount} complete.`,
    );

    return { messages: sanitized, summary: summary ?? undefined };
  }

  // ─── Tool output pruning ─────────────────────────────────────────────

  private pruneOldToolResults(
    messages: AgentMessage[],
    protectTailCount: number,
  ): { messages: AgentMessage[]; prunedCount: number } {
    if (!messages.length) return { messages, prunedCount: 0 };

    const result = messages.map((m) => ({ ...m }));
    let pruned = 0;
    const pruneBoundary = result.length - protectTailCount;

    for (let i = 0; i < pruneBoundary; i++) {
      const msg = result[i];
      if (msg.role !== "tool") continue;
      const content = msg.content || "";
      if (!content || content === PRUNED_TOOL_PLACEHOLDER) continue;
      if (content.length > 200) {
        result[i] = { ...msg, content: PRUNED_TOOL_PLACEHOLDER };
        pruned++;
      }
    }

    return { messages: result, prunedCount: pruned };
  }

  // ─── Summarization ───────────────────────────────────────────────────

  private computeSummaryBudget(turnsToSummarize: AgentMessage[]): number {
    const contentTokens = estimateMessagesTokensRough(turnsToSummarize);
    const budget = Math.floor(contentTokens * SUMMARY_RATIO);
    return Math.max(MIN_SUMMARY_TOKENS, Math.min(budget, this.maxSummaryTokens));
  }

  private async generateSummary(
    turnsToSummarize: AgentMessage[],
  ): Promise<string | null> {
    const now = Date.now();
    if (now < this.summaryFailureCooldownUntil) {
      const remaining = Math.round(
        (this.summaryFailureCooldownUntil - now) / 1000,
      );
      console.log(
        `[hermes:compressor] Skipping context summary during cooldown (${remaining}s remaining)`,
      );
      return null;
    }

    if (!this.summarizeFn) {
      console.log("[hermes:compressor] No summarize function provided — skipping summary generation");
      return null;
    }

    const summaryBudget = this.computeSummaryBudget(turnsToSummarize);
    const contentToSummarize = serializeForSummary(turnsToSummarize);

    let prompt: string;

    if (this.previousSummary) {
      prompt = `You are updating a context compaction summary. A previous compaction produced the summary below. New conversation turns have occurred since then and need to be incorporated.

PREVIOUS SUMMARY:
${this.previousSummary}

NEW TURNS TO INCORPORATE:
${contentToSummarize}

Update the summary using this exact structure. PRESERVE all existing information that is still relevant. ADD new progress. Move items from "In Progress" to "Done" when completed. Remove information only if it is clearly obsolete.

## Goal
[What the user is trying to accomplish — preserve from previous summary, update if goal evolved]

## Constraints & Preferences
[User preferences, coding style, constraints, important decisions — accumulate across compactions]

## Progress
### Done
[Completed work — include specific file paths, commands run, results obtained]
### In Progress
[Work currently underway]
### Blocked
[Any blockers or issues encountered]

## Key Decisions
[Important technical decisions and why they were made]

## Relevant Files
[Files read, modified, or created — with brief note on each. Accumulate across compactions.]

## Next Steps
[What needs to happen next to continue the work]

## Critical Context
[Any specific values, error messages, configuration details, or data that would be lost without explicit preservation]

Target ~${summaryBudget} tokens. Be specific — include file paths, command outputs, error messages, and concrete values rather than vague descriptions.

Write only the summary body. Do not include any preamble or prefix.`;
    } else {
      prompt = `Create a structured handoff summary for a later assistant that will continue this conversation after earlier turns are compacted.

TURNS TO SUMMARIZE:
${contentToSummarize}

Use this exact structure:

## Goal
[What the user is trying to accomplish]

## Constraints & Preferences
[User preferences, coding style, constraints, important decisions]

## Progress
### Done
[Completed work — include specific file paths, commands run, results obtained]
### In Progress
[Work currently underway]
### Blocked
[Any blockers or issues encountered]

## Key Decisions
[Important technical decisions and why they were made]

## Relevant Files
[Files read, modified, or created — with brief note on each]

## Next Steps
[What needs to happen next to continue the work]

## Critical Context
[Any specific values, error messages, configuration details, or data that would be lost without explicit preservation]

Target ~${summaryBudget} tokens. Be specific — include file paths, command outputs, error messages, and concrete values rather than vague descriptions. The goal is to prevent the next assistant from repeating work or losing important details.

Write only the summary body. Do not include any preamble or prefix.`;
    }

    try {
      const content = await this.summarizeFn(prompt, summaryBudget * 2);
      if (!content || !content.trim()) return null;

      const summary = content.trim();
      this.previousSummary = summary;
      this.summaryFailureCooldownUntil = 0;
      return withSummaryPrefix(summary);
    } catch (err) {
      this.summaryFailureCooldownUntil =
        Date.now() + SUMMARY_FAILURE_COOLDOWN_SECONDS * 1000;
      console.warn(
        `[hermes:compressor] Failed to generate context summary: ${err instanceof Error ? err.message : String(err)}. ` +
          `Further summary attempts paused for ${SUMMARY_FAILURE_COOLDOWN_SECONDS}s.`,
      );
      return null;
    }
  }

  // ─── Tool-call / tool-result pair integrity ─────────────────────────

  private getToolCallId(tc: { id?: string }): string {
    return tc.id ?? "";
  }

  private sanitizeToolPairs(messages: AgentMessage[]): AgentMessage[] {
    // Collect surviving call IDs from assistant messages
    const survivingCallIds = new Set<string>();
    for (const msg of messages) {
      if (msg.role === "assistant") {
        for (const tc of msg.tool_calls ?? []) {
          const cid = this.getToolCallId(tc);
          if (cid) survivingCallIds.add(cid);
        }
      }
    }

    // Collect result call IDs from tool messages
    const resultCallIds = new Set<string>();
    for (const msg of messages) {
      if (msg.role === "tool") {
        const cid = msg.tool_call_id;
        if (cid) resultCallIds.add(cid);
      }
    }

    // 1. Remove tool results whose call_id has no matching assistant tool_call
    const orphanedResults = new Set(
      Array.from(resultCallIds).filter((cid) => !survivingCallIds.has(cid)),
    );
    let sanitized: AgentMessage[] = orphanedResults.size > 0
      ? messages.filter(
          (m) => !(m.role === "tool" && m.tool_call_id && orphanedResults.has(m.tool_call_id)),
        )
      : messages;

    if (orphanedResults.size > 0) {
      console.log(
        `[hermes:compressor] Sanitizer: removed ${orphanedResults.size} orphaned tool result(s)`,
      );
    }

    // 2. Add stub results for assistant tool_calls whose results were dropped
    const missingResults = new Set(
      Array.from(survivingCallIds).filter((cid) => !resultCallIds.has(cid)),
    );

    if (missingResults.size > 0) {
      const patched: AgentMessage[] = [];
      for (const msg of sanitized) {
        patched.push(msg);
        if (msg.role === "assistant") {
          for (const tc of msg.tool_calls ?? []) {
            const cid = this.getToolCallId(tc);
            if (cid && missingResults.has(cid)) {
              patched.push({
                role: "tool",
                content:
                  "[Result from earlier conversation — see context summary above]",
                tool_call_id: cid,
              });
            }
          }
        }
      }
      sanitized = patched;
      console.log(
        `[hermes:compressor] Sanitizer: added ${missingResults.size} stub tool result(s)`,
      );
    }

    return sanitized;
  }

  // ─── Boundary alignment ──────────────────────────────────────────────

  /**
   * Push a compress-start boundary forward past any orphan tool results.
   */
  private alignBoundaryForward(messages: AgentMessage[], idx: number): number {
    while (idx < messages.length && messages[idx].role === "tool") {
      idx++;
    }
    return idx;
  }

  /**
   * Pull a compress-end boundary backward to avoid splitting a tool_call/result group.
   */
  private alignBoundaryBackward(
    messages: AgentMessage[],
    idx: number,
  ): number {
    if (idx <= 0 || idx >= messages.length) return idx;

    // Walk backward past consecutive tool results
    let check = idx - 1;
    while (check >= 0 && messages[check].role === "tool") {
      check--;
    }

    // If we landed on the parent assistant with tool_calls, pull the boundary
    // before it so the whole group gets summarised together.
    if (
      check >= 0 &&
      messages[check].role === "assistant" &&
      (messages[check].tool_calls?.length ?? 0) > 0
    ) {
      idx = check;
    }

    return idx;
  }

  // ─── Tail protection by token budget ─────────────────────────────────

  /**
   * Walk backward from the end of messages, accumulating tokens until
   * the budget is reached. Returns the index where the tail starts.
   */
  private findTailCutByTokens(
    messages: AgentMessage[],
    headEnd: number,
  ): number {
    const n = messages.length;
    const minTail = this.protectLastN;
    let accumulated = 0;
    let cutIdx = n;

    for (let i = n - 1; i > headEnd - 1; i--) {
      const msg = messages[i];
      const content = msg.content || "";
      let msgTokens = content.length / CHARS_PER_TOKEN + 10;
      for (const tc of msg.tool_calls ?? []) {
        msgTokens += (tc.function.arguments?.length ?? 0) / CHARS_PER_TOKEN;
      }
      if (accumulated + msgTokens > this.tailTokenBudget && n - i >= minTail) {
        break;
      }
      accumulated += msgTokens;
      cutIdx = i;
    }

    // Ensure we protect at least protectLastN messages
    const fallbackCut = n - minTail;
    if (cutIdx > fallbackCut) {
      cutIdx = fallbackCut;
    }

    // If the token budget would protect everything, fall back to fixed count
    if (cutIdx <= headEnd) {
      cutIdx = fallbackCut;
    }

    // Align to avoid splitting tool groups
    cutIdx = this.alignBoundaryBackward(messages, cutIdx);

    return Math.max(cutIdx, headEnd + 1);
  }
}
