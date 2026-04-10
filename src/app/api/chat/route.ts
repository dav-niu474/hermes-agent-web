import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Provider config
// ---------------------------------------------------------------------------

async function getLLMConfig() {
  try {
    const configs = await db.agentConfig.findMany();
    const map: Record<string, string> = {};
    for (const c of configs) map[c.key] = c.value;
    return {
      baseUrl: map.llm_base_url || process.env.OPENAI_BASE_URL || "https://integrate.api.nvidia.com/v1",
      apiKey: map.llm_api_key || process.env.OPENAI_API_KEY || process.env.NVIDIA_API_KEY || "",
      model: map.llm_model || process.env.OPENAI_MODEL || "z-ai/glm-4.7",
      provider: map.llm_provider || process.env.LLM_PROVIDER || "nvidia",
    };
  } catch {
    return {
      baseUrl: process.env.OPENAI_BASE_URL || "https://integrate.api.nvidia.com/v1",
      apiKey: process.env.OPENAI_API_KEY || process.env.NVIDIA_API_KEY || "",
      model: process.env.OPENAI_MODEL || "z-ai/glm-4.7",
      provider: process.env.LLM_PROVIDER || "nvidia",
    };
  }
}

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
}

/** Generate a concise title from the first user message. */
function generateTitle(content: string): string {
  const cleaned = content.replace(/\n/g, " ").trim();
  if (cleaned.length <= 50) return cleaned;
  return cleaned.slice(0, 47) + "...";
}

// ---------------------------------------------------------------------------
// POST /api/chat — direct LLM call with SSE streaming
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();

    if (!body.messages?.length) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    const config = await getLLMConfig();
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
          data: { title, model: config.model },
        })
        .catch(() => null);
      localSessionId = newSession?.id;
    } else {
      // Update model if changed
      await db.chatSession
        .update({ where: { id: localSessionId }, data: { model: config.model } })
        .catch(() => {});
    }

    // ── Build request to LLM ──
    const baseUrl = config.baseUrl.replace(/\/+$/, "");
    const endpoint = `${baseUrl}/chat/completions`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;

    const requestBody: Record<string, unknown> = {
      model: config.model,
      messages: body.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: shouldStream,
    };

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

    // ── Call LLM API ──
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error("[Chat API] LLM error:", response.status, errorText);
      return NextResponse.json(
        { error: `LLM API error: ${response.status}`, detail: errorText },
        { status: response.status },
      );
    }

    // ── Streaming response ──
    if (shouldStream && response.body) {
      const stream = new TransformStream();
      const writer = stream.writable.getWriter();
      const encoder = new TextEncoder();

      (async () => {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";
        let reasoningContent = "";
        let totalTokens = 0;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data:")) continue;

              const data = trimmed.slice(5).trim();
              if (data === "[DONE]") {
                await writer.write(encoder.encode("data: [DONE]\n\n"));
                continue;
              }

              try {
                const parsed = JSON.parse(data);

                // Handle GLM reasoning_content field
                const delta = parsed.choices?.[0]?.delta;
                if (delta?.reasoning_content) {
                  reasoningContent += delta.reasoning_content;
                  // Inject reasoning into content with think tags
                  const thinkTag = `<think:\n${reasoningContent}\n</think: `;
                  // We'll accumulate it and prepend when content comes
                }

                if (delta?.content) {
                  // If there was reasoning, prepend think block before first content
                  if (reasoningContent && !fullContent) {
                    fullContent = `<think:\n${reasoningContent}\n</think: `;
                  }
                  fullContent += delta.content;
                }

                // Track token usage
                if (parsed.usage) {
                  totalTokens = parsed.usage.total_tokens || 0;
                }

                await writer.write(encoder.encode(`data: ${data}\n\n`));
              } catch {
                // Skip malformed JSON chunks
              }
            }
          }
        } catch (error) {
          console.error("[Chat API] Stream error:", error);
        } finally {
          // Save assistant message to local DB after stream completes
          if (localSessionId && fullContent) {
            const duration = Date.now() - startTime;
            await db.chatMessage
              .create({
                data: {
                  sessionId: localSessionId,
                  role: "assistant",
                  content: fullContent,
                  duration,
                  tokens: totalTokens || undefined,
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

      return new NextResponse(stream.readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Session-Id": localSessionId || "",
          "X-Model": config.model,
          "X-Provider": config.provider,
          "X-Duration": String(Date.now() - startTime),
        },
      });
    }

    // ── Non-streaming response ──
    const data = await response.json();
    const duration = Date.now() - startTime;
    let content = data.choices?.[0]?.message?.content || "";

    // Handle reasoning_content in non-streaming mode
    const msgReasoning = data.choices?.[0]?.message?.reasoning_content;
    if (msgReasoning) {
      content = `<think:\n${msgReasoning}\n</think: ${content}`;
    }

    const totalTokens = data.usage?.total_tokens;

    if (localSessionId && content) {
      await db.chatMessage
        .create({
          data: {
            sessionId: localSessionId,
            role: "assistant",
            content,
            duration,
            tokens: totalTokens,
          },
        })
        .catch(() => {});
    }

    return NextResponse.json({
      ...data,
      sessionId: localSessionId,
      duration,
      provider: config.provider,
      model: config.model,
    });
  } catch (error) {
    console.error("[Chat API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
