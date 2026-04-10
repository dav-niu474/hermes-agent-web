import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  AgentLoop,
  type AgentConfig,
  type AgentMessage,
  type SSEEvent,
  type ToolContext,
 type ToolRegistryInterface,
 type MemoryManagerInterface,
 getLLMConfig,
 resolveToolset,
 MemoryManager,
 ALL_TOOLS,
 getToolsetFilter,
} from "@/lib/hermes";
import OpenAI from "openai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: string;
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  sessionId?: string;
  stream?: boolean;
  model?: string;
  provider?: string;
}

/** Generate a concise title from the first user message. */
function generateTitle(content: string): string {
  const cleaned = content.replace(/\n/g, " ").trim();
  if (cleaned.length <= 50) return cleaned;
  return cleaned.slice(0, 47) + "...";
}

// ---------------------------------------------------------------------------
// ToolRegistryAdapter — wraps static tool definitions for AgentLoop
// ---------------------------------------------------------------------------

class ToolRegistryAdapter implements ToolRegistryInterface {
  private toolNames: Set<string>;
  private toolSchemas: OpenAI.ChatCompletionTool[];

  constructor(toolNames: string[]) {
    this.toolNames = new Set(toolNames);
    this.toolSchemas = ALL_TOOLS
      .filter((t) => this.toolNames.has(t.name))
      .map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters as Record<string, unknown>,
        },
      }));
  }

  getToolDefinitions(): OpenAI.ChatCompletionTool[] {
    return this.toolSchemas;
  }

  getValidToolNames(): Set<string> {
    return this.toolNames;
  }

  async dispatch(
    name: string,
    _args: Record<string, unknown>,
    _context: ToolContext,
  ): Promise<string> {
    // In the web context, tools are dispatched client-side or not at all.
    // The agent loop uses this for tool definitions; actual tool execution
    // happens in the hermes-agent runtime. For the web API server, we
    // return a descriptive placeholder so the LLM can explain what it
    // would do. The frontend can then render tool-call UI elements.
    return JSON.stringify({
      note: `Tool '${name}' is registered but not executable in the web API context. The agent described the intended action above.`,
      tool: name,
    });
  }
}

// ---------------------------------------------------------------------------
// MemoryManagerAdapter — wraps MemoryManager for AgentLoop
// ---------------------------------------------------------------------------

class MemoryManagerAdapter implements MemoryManagerInterface {
  private mm: MemoryManager;

  constructor(mm: MemoryManager) {
    this.mm = mm;
  }

  async getMemoryContext(_query?: string): Promise<string> {
    try {
      const data = await this.mm.readMemory();
      // Build a compact memory context for the system prompt
      const parts: string[] = [];
      if (data.memoryContent?.trim()) {
        parts.push(`## Agent Memory\n${data.memoryContent}`);
      }
      if (data.userContent?.trim()) {
        parts.push(`## User Profile\n${data.userContent}`);
      }
      return parts.join("\n\n");
    } catch {
      return "";
    }
  }
}

// ---------------------------------------------------------------------------
// POST /api/chat — run AgentLoop with optional SSE streaming
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();

    if (!body.messages?.length) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    const shouldStream = body.stream !== false;
    const lastMessage = body.messages[body.messages.length - 1];
    const startTime = Date.now();

    // ── Resolve local session ──
    let localSessionId = body.sessionId;

    if (localSessionId) {
      const session = await db.chatSession
        .findUnique({ where: { id: localSessionId } })
        .catch(() => null);
      if (!session) localSessionId = undefined;
    }

    // ── Create local session if needed ──
    if (!localSessionId) {
      const title = generateTitle(lastMessage.content);
      const newSession = await db.chatSession
        .create({
          data: {
            title,
            model: body.model || "hermes-agent",
          },
        })
        .catch(() => null);
      localSessionId = newSession?.id;
    } else {
      if (body.model) {
        await db.chatSession
          .update({
            where: { id: localSessionId },
            data: { model: body.model },
          })
          .catch(() => {});
      }
    }

    // ── Resolve LLM config ──
    // Pass both model and provider so the backend routes to the correct API.
    // The getLLMConfig function auto-detects provider from model if not given.
    const requestModel = body.model?.trim() || undefined;
    const requestProvider = body.provider?.trim() || undefined;
    const llmConfig = getLLMConfig(requestModel, requestProvider);
    console.log(
      `[Chat API] model=${llmConfig.model} provider=${llmConfig.provider}` +
        ` baseUrl=${llmConfig.baseUrl} hasKey=${!!llmConfig.apiKey}`,
    );

    // ── Resolve toolset tools ──
    const toolsetFilter = getToolsetFilter();
    const toolNames: string[] = [];
    for (const ts of toolsetFilter.effective) {
      const resolved = resolveToolset(ts);
      for (const name of resolved) {
        if (!toolNames.includes(name)) toolNames.push(name);
      }
    }

    // ── Build components ──
    const toolRegistry = new ToolRegistryAdapter(toolNames);
    const memoryManager = new MemoryManager();
    const memoryAdapter = new MemoryManagerAdapter(memoryManager);

    // ── Agent config ──
    const agentConfig: AgentConfig = {
      model: llmConfig.model,
      provider: llmConfig.provider,
      apiKey: llmConfig.apiKey,
      baseUrl: llmConfig.baseUrl,
      platform: "web",
      maxIterations: 90,
      sessionId: localSessionId,
    };

    const agentLoop = new AgentLoop(agentConfig, toolRegistry, memoryAdapter);

    // ── Convert messages ──
    const agentMessages: AgentMessage[] = body.messages.map((m) => ({
      role: m.role as AgentMessage["role"],
      content: m.content,
    }));

    // ── Save user message locally ──
    if (localSessionId) {
      await db.chatMessage
        .create({
          data: {
            sessionId: localSessionId,
            role: lastMessage.role,
            content: lastMessage.content,
          },
        })
        .catch(() => {});

      await db.chatSession
        .update({
          where: { id: localSessionId },
          data: { updatedAt: new Date() },
        })
        .catch(() => {});
    }

    // ── Handle X-Hermes-Session-Id ──
    const hermesSessionId = request.headers.get("X-Hermes-Session-Id");

    // ── Generate a completion ID ──
    const completionId = `chatcmpl-${Date.now().toString(36)}`;
    const created = Math.floor(Date.now() / 1000);

    // ── Run agent loop ──
    if (shouldStream) {
      // ── Streaming response ──
      const stream = new TransformStream();
      const writer = stream.writable.getWriter();
      const encoder = new TextEncoder();

      // Helper to write an SSE data line
      const writeSSE = (data: string) => writer.write(encoder.encode(`data: ${data}\n\n`));

      (async () => {
        let fullContent = "";
        let totalInputTokens = 0;
        let totalOutputTokens = 0;

        try {
          const result = await agentLoop.run(agentMessages, {
            stream: true,
            sessionId: localSessionId,
            onEvent: (event: SSEEvent) => {
              switch (event.type) {
                case "delta": {
                  const text = typeof event.data === "string" ? event.data : String(event.data);
                  fullContent += text;
                  writeSSE(
                    JSON.stringify({
                      id: completionId,
                      object: "chat.completion.chunk",
                      created,
                      model: llmConfig.model,
                      "x-event-type": "content",
                      choices: [
                        { index: 0, delta: { content: text }, finish_reason: null },
                      ],
                    }),
                  );
                  break;
                }
                case "reasoning": {
                  const reasoningText = typeof event.data === "string" ? event.data : String(event.data);
                  writeSSE(
                    JSON.stringify({
                      id: completionId,
                      object: "chat.completion.chunk",
                      created,
                      model: llmConfig.model,
                      "x-event-type": "reasoning",
                      choices: [
                        {
                          index: 0,
                          delta: { content: reasoningText },
                          finish_reason: null,
                        },
                      ],
                    }),
                  );
                  break;
                }
                case "tool_start": {
                  const toolData = event.data;
                  const toolName = typeof toolData === "object" && toolData && "name" in toolData
                    ? String((toolData as Record<string, unknown>).name)
                    : String(toolData);
                  const toolArgs = typeof toolData === "object" && toolData && "arguments" in toolData
                    ? String((toolData as Record<string, unknown>).arguments || "")
                    : "";
                  const toolId = typeof toolData === "object" && toolData && "id" in toolData
                    ? String((toolData as Record<string, unknown>).id)
                    : `tool-${Date.now()}`;
                  writeSSE(
                    JSON.stringify({
                      id: completionId,
                      object: "chat.completion.chunk",
                      created,
                      model: llmConfig.model,
                      "x-event-type": "tool_start",
                      "x-tool-id": toolId,
                      "x-tool-name": toolName,
                      "x-tool-args": toolArgs,
                      choices: [
                        { index: 0, delta: {}, finish_reason: null },
                      ],
                    }),
                  );
                  break;
                }
                case "tool_end": {
                  const toolResult = typeof event.data === "string" ? event.data
                    : typeof event.data === "object" && event.data ? JSON.stringify(event.data)
                    : "";
                  const toolId2 = typeof event.data === "object" && event.data && "id" in event.data
                    ? String((event.data as Record<string, unknown>).id)
                    : "";
                  writeSSE(
                    JSON.stringify({
                      id: completionId,
                      object: "chat.completion.chunk",
                      created,
                      model: llmConfig.model,
                      "x-event-type": "tool_end",
                      "x-tool-id": toolId2,
                      "x-tool-result": toolResult,
                      choices: [
                        { index: 0, delta: {}, finish_reason: null },
                      ],
                    }),
                  );
                  break;
                }
                case "error": {
                  const errorMsg = typeof event.data === "string" ? event.data : JSON.stringify(event.data);
                  console.error("[Chat API] Agent event error:", errorMsg);
                  writeSSE(
                    JSON.stringify({
                      id: completionId,
                      object: "chat.completion.chunk",
                      created,
                      model: llmConfig.model,
                      "x-event-type": "error",
                      "x-error": errorMsg,
                      choices: [
                        { index: 0, delta: {}, finish_reason: null },
                      ],
                    }),
                  );
                  break;
                }
                case "done": {
                  // Will be handled after run() resolves
                  break;
                }
              }
            },
          });

          totalInputTokens = result.usage.inputTokens;
          totalOutputTokens = result.usage.outputTokens;

          // Send final stop chunk
          writeSSE(
            JSON.stringify({
              id: completionId,
              object: "chat.completion.chunk",
              created,
              model: llmConfig.model,
              choices: [
                { index: 0, delta: {}, finish_reason: "stop" },
              ],
              usage: {
                prompt_tokens: totalInputTokens,
                completion_tokens: totalOutputTokens,
                total_tokens: totalInputTokens + totalOutputTokens,
              },
            }),
          );
          writeSSE("[DONE]");
        } catch (error) {
          console.error("[Chat API] Agent loop error:", error);
          const errorMsg = error instanceof Error ? error.message : String(error);
          writeSSE(
            JSON.stringify({
              id: completionId,
              object: "chat.completion.chunk",
              created,
              model: llmConfig.model,
              choices: [
                {
                  index: 0,
                  delta: { content: `\n\n⚠️ Error: ${errorMsg}` },
                  finish_reason: "stop",
                },
              ],
            }),
          );
          writeSSE("[DONE]");
        } finally {
          // Save assistant message to local DB
          if (localSessionId && fullContent) {
            const duration = Date.now() - startTime;
            await db.chatMessage
              .create({
                data: {
                  sessionId: localSessionId,
                  role: "assistant",
                  content: fullContent,
                  duration,
                  tokens: totalInputTokens + totalOutputTokens || undefined,
                },
              })
              .catch(() => {});

            await db.chatSession
              .update({
                where: { id: localSessionId },
                data: { updatedAt: new Date() },
              })
              .catch(() => {});
          }
          await writer.close();
        }
      })();

      // Build response headers
      const responseHeaders: Record<string, string> = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Session-Id": localSessionId || "",
        "X-Model": llmConfig.model,
      };

      if (hermesSessionId) {
        responseHeaders["X-Hermes-Session-Id"] = hermesSessionId;
      }

      return new NextResponse(stream.readable, {
        headers: responseHeaders,
      });
    }

    // ── Non-streaming response ──
    const result = await agentLoop.run(agentMessages, {
      stream: false,
      sessionId: localSessionId,
    });

    const duration = Date.now() - startTime;
    const content = result.finalResponse || "";
    const totalTokens = result.usage.totalTokens;

    // Save assistant message to local DB
    if (localSessionId && content) {
      await db.chatMessage
        .create({
          data: {
            sessionId: localSessionId,
            role: "assistant",
            content,
            duration,
            tokens: totalTokens || undefined,
          },
        })
        .catch(() => {});
    }

    // Return OpenAI-compatible response
    return NextResponse.json({
      id: completionId,
      object: "chat.completion",
      created,
      model: llmConfig.model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content,
          },
          finish_reason: result.finishedNaturally ? "stop" : "length",
        },
      ],
      usage: {
        prompt_tokens: result.usage.inputTokens,
        completion_tokens: result.usage.outputTokens,
        total_tokens: result.usage.totalTokens,
      },
      sessionId: localSessionId,
      duration,
    });
  } catch (error) {
    console.error("[Chat API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
