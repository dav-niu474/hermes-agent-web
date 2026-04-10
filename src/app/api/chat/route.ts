import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Get hermes-agent connection config from DB (with env fallback)
async function getHermesConfig() {
  try {
    const configs = await db.agentConfig.findMany();
    const map: Record<string, string> = {};
    for (const c of configs) map[c.key] = c.value;
    return {
      url: map.hermes_url || process.env.HERMES_URL || "http://localhost:8642",
      apiKey: map.hermes_api_key || process.env.HERMES_API_KEY || "",
    };
  } catch {
    return {
      url: process.env.HERMES_URL || "http://localhost:8642",
      apiKey: process.env.HERMES_API_KEY || "",
    };
  }
}

interface ChatRequest {
  messages: { role: string; content: string }[];
  sessionId?: string;
  stream?: boolean;
}

/** Generate a concise title from the first user message for sidebar display. */
function generateTitle(content: string): string {
  const cleaned = content.replace(/\n/g, " ").trim();
  if (cleaned.length <= 50) return cleaned;
  return cleaned.slice(0, 47) + "...";
}

/**
 * POST /api/chat
 * Pure transparent proxy to hermes-agent.
 *
 * 1. Reads hermes-agent URL + API key from DB config (AgentConfig table)
 * 2. Resolves local session and hermes session ID
 * 3. Creates local session metadata for sidebar display
 * 4. Forwards the request to {hermesUrl}/v1/chat/completions
 * 5. Streams SSE response through transparently
 * 6. On completion, saves assistant message to local DB for history
 * 7. model field is always "hermes-agent" (cosmetic)
 */
export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();

    if (!body.messages?.length) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    const config = await getHermesConfig();
    const shouldStream = body.stream !== false;
    const lastMessage = body.messages[body.messages.length - 1];
    const startTime = Date.now();

    // ── Resolve local session ──
    let localSessionId = body.sessionId;
    let hermesSessionId: string | undefined;

    if (localSessionId) {
      const session = await db.chatSession
        .findUnique({ where: { id: localSessionId } })
        .catch(() => null);
      if (session) {
        hermesSessionId = session.hermesSessionId || undefined;
      } else {
        localSessionId = undefined;
      }
    }

    // ── Create local session if needed ──
    if (!localSessionId) {
      const title = generateTitle(lastMessage.content);
      const newSession = await db.chatSession
        .create({
          data: { title, model: "hermes-agent" },
        })
        .catch(() => null);
      localSessionId = newSession?.id;
    }

    // ── Build request to hermes-agent ──
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;
    if (hermesSessionId) headers["X-Hermes-Session-Id"] = hermesSessionId;

    const requestBody = {
      model: "hermes-agent",
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

    // ── Forward to hermes-agent ──
    const response = await fetch(`${config.url}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error(
        "[Chat API] Hermes agent error:",
        response.status,
        errorText,
      );
      return NextResponse.json(
        { error: `Hermes agent error: ${response.status}`, detail: errorText },
        { status: response.status },
      );
    }

    // ── Capture hermes session ID from response header ──
    const responseHermesSessionId = response.headers.get("X-Hermes-Session-Id");
    if (responseHermesSessionId && localSessionId) {
      await db.chatSession
        .update({
          where: { id: localSessionId },
          data: { hermesSessionId: responseHermesSessionId },
        })
        .catch(() => {});
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
                await writer.write(encoder.encode(`data: ${data}\n\n`));

                const delta = parsed.choices?.[0]?.delta;
                if (delta?.content) fullContent += delta.content;
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
          "X-Hermes-Session-Id": responseHermesSessionId || "",
          "X-Duration": String(Date.now() - startTime),
        },
      });
    }

    // ── Non-streaming response ──
    const data = await response.json();
    const duration = Date.now() - startTime;
    const content = data.choices?.[0]?.message?.content || "";

    if (localSessionId && content) {
      await db.chatMessage
        .create({
          data: {
            sessionId: localSessionId,
            role: "assistant",
            content,
            duration,
            tokens: data.usage?.total_tokens,
          },
        })
        .catch(() => {});
    }

    return NextResponse.json({
      ...data,
      sessionId: localSessionId,
      hermesSessionId: responseHermesSessionId || hermesSessionId,
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
