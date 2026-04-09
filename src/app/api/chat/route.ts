import { NextRequest, NextResponse } from "next/server";

/** NVIDIA NIM API base URL */
const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1";

/** Default NVIDIA API key */
const DEFAULT_NVIDIA_KEY = "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";

/** Get NVIDIA API key from env or config */
function getNvidiaKey(): string {
  return process.env.NVIDIA_API_KEY || DEFAULT_NVIDIA_KEY;
}

/**
 * Generate a concise title from the first user message.
 */
function generateTitle(content: string): string {
  const cleaned = content.replace(/\n/g, " ").trim();
  if (cleaned.length <= 50) return cleaned;
  return cleaned.slice(0, 47) + "...";
}

/** Check if a model identifier is for NVIDIA */
function isNvidiaModel(model: string): boolean {
  return model.startsWith("nvidia/") || model.startsWith("meta/") || model.startsWith("mistralai/");
}

/** Shape of an incoming chat request */
interface ChatRequest {
  messages: { role: string; content: string }[];
  sessionId?: string;
  model?: string;
  stream?: boolean;
}

/**
 * POST /api/chat
 * Send a message and get a streaming or non-streaming response.
 * Routes to NVIDIA API directly for nvidia/meta/mistralai models.
 */
export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json(
        { error: "messages is required and must be a non-empty array" },
        { status: 400 },
      );
    }

    const lastMessage = body.messages[body.messages.length - 1];
    if (!lastMessage.role || !lastMessage.content) {
      return NextResponse.json(
        { error: "Each message must have role and content" },
        { status: 400 },
      );
    }

    const shouldStream = body.stream !== false;
    const model = body.model || "nvidia/llama-3.1-nemotron-70b-instruct";
    const startTime = Date.now();

    // For now, always use NVIDIA directly
    // When database is configured, we can route to hermes-agent for other models
    return handleNvidiaRequest(model, body.messages, shouldStream, startTime);
  } catch (error) {
    console.error("[Chat API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * Handle request via NVIDIA NIM API.
 */
async function handleNvidiaRequest(
  model: string,
  messages: { role: string; content: string }[],
  shouldStream: boolean,
  startTime: number,
) {
  const nvidiaKey = getNvidiaKey();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${nvidiaKey}`,
  };

  const requestBody = {
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: shouldStream,
    max_tokens: 4096,
    temperature: 0.7,
  };

  const response = await fetch(`${NVIDIA_API_URL}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    console.error("[Chat API] NVIDIA error:", response.status, errorText);
    return NextResponse.json(
      { error: `NVIDIA API returned ${response.status}`, details: errorText },
      { status: response.status },
    );
  }

  // ── Streaming response ────────────────────────────────────────
  if (shouldStream) {
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      try {
        const reader = response.body?.getReader();
        if (!reader) { await writer.close(); return; }

        const decoder = new TextDecoder();
        let buffer = "";

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
            } catch {
              // Skip malformed JSON
            }
          }
        }
      } catch (error) {
        console.error("[Chat API] NVIDIA stream error:", error);
      } finally {
        await writer.close();
      }
    })();

    const duration = Date.now() - startTime;
    return new NextResponse(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Provider": "nvidia",
        "X-Duration": String(duration),
      },
    });
  }

  // ── Non-streaming response ────────────────────────────────────
  const data = await response.json();
  const duration = Date.now() - startTime;

  return NextResponse.json({
    ...data,
    provider: "nvidia",
    duration,
  });
}
