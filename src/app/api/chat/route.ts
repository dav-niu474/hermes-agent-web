import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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
}

/** Generate a concise title from the first user message. */
function generateTitle(content: string): string {
  const cleaned = content.replace(/\n/g, " ").trim();
  if (cleaned.length <= 50) return cleaned;
  return cleaned.slice(0, 47) + "...";
}

// ---------------------------------------------------------------------------
// POST /api/chat — proxy to hermes-api /v1/chat/completions
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
      // Update model if changed
      if (body.model) {
        await db.chatSession
          .update({
            where: { id: localSessionId },
            data: { model: body.model },
          })
          .catch(() => {});
      }
    }

    // ── Build request to hermes-api ──
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Forward X-Hermes-Session-Id if present
    const hermesSessionId = request.headers.get("X-Hermes-Session-Id");
    if (hermesSessionId) {
      headers["X-Hermes-Session-Id"] = hermesSessionId;
    }

    const requestBody: Record<string, unknown> = {
      model: body.model || "hermes-agent",
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

    // ── Call hermes-api ──
    const HERMES_API = process.env.HERMES_API_URL || "http://localhost:8643";
    const hermesResponse = await fetch(
      `${HERMES_API}/v1/chat/completions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      },
    );

    if (!hermesResponse.ok) {
      const errorText = await hermesResponse.text().catch(() => "Unknown error");
      console.error("[Chat API] hermes-api error:", hermesResponse.status, errorText);
      return NextResponse.json(
        { error: `hermes-api error: ${hermesResponse.status}`, detail: errorText },
        { status: hermesResponse.status },
      );
    }

    // ── Streaming response: pipe SSE transparently ──
    if (shouldStream && hermesResponse.body) {
      const stream = new TransformStream();
      const writer = stream.writable.getWriter();
      const encoder = new TextEncoder();

      (async () => {
        const reader = hermesResponse.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";
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
                const delta = parsed.choices?.[0]?.delta;
                if (delta?.content) {
                  fullContent += delta.content;
                }

                // Track token usage
                if (parsed.usage) {
                  totalTokens = parsed.usage.total_tokens || 0;
                }

                // Pipe the chunk transparently
                await writer.write(encoder.encode(`data: ${data}\n\n`));
              } catch {
                // Skip malformed JSON chunks — pipe them as-is
                await writer.write(encoder.encode(`${line}\n`));
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

      // Build response headers — forward any useful ones from hermes-api
      const responseHeaders: Record<string, string> = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Session-Id": localSessionId || "",
      };

      // Forward hermes session ID if returned
      const hermesSid = hermesResponse.headers.get("X-Hermes-Session-Id");
      if (hermesSid) responseHeaders["X-Hermes-Session-Id"] = hermesSid;

      const hermesModel = hermesResponse.headers.get("X-Model");
      if (hermesModel) responseHeaders["X-Model"] = hermesModel;

      return new NextResponse(stream.readable, {
        headers: responseHeaders,
      });
    }

    // ── Non-streaming response ──
    const data = await hermesResponse.json();
    const duration = Date.now() - startTime;
    const content = data.choices?.[0]?.message?.content || "";
    const totalTokens = data.usage?.total_tokens;

    // Save assistant message to local DB
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

    // Return hermes-api response with local session metadata
    return NextResponse.json({
      ...data,
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
