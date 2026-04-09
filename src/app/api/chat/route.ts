import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Default Hermes Agent URL */
const DEFAULT_HERMES_URL = "http://localhost:8642";

/** NVIDIA NIM API base URL */
const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1";

/** Default NVIDIA API key */
const DEFAULT_NVIDIA_KEY = "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";

/** Check if a model identifier is for NVIDIA */
function isNvidiaModel(model: string): boolean {
  return model.startsWith("nvidia/") || model.startsWith("meta/") || model.startsWith("mistralai/");
}

/**
 * Ensure the NVIDIA API key is in the database.
 */
async function ensureNvidiaKey(): Promise<string> {
  try {
    const existing = await db.agentConfig.findUnique({ where: { key: "nvidia_api_key" } });
    if (existing?.value) return existing.value;
    // Initialize with default key
    await db.agentConfig.upsert({
      where: { key: "nvidia_api_key" },
      update: { value: DEFAULT_NVIDIA_KEY },
      create: { key: "nvidia_api_key", value: DEFAULT_NVIDIA_KEY, label: "NVIDIA API Key", group: "model" },
    });
    return DEFAULT_NVIDIA_KEY;
  } catch {
    return DEFAULT_NVIDIA_KEY;
  }
}

/**
 * Fetch the Hermes URL from the database AgentConfig.
 */
async function getHermesUrl(): Promise<string> {
  try {
    const config = await db.agentConfig.findUnique({ where: { key: "hermes_url" } });
    return config?.value || DEFAULT_HERMES_URL;
  } catch {
    return DEFAULT_HERMES_URL;
  }
}

/**
 * Fetch the API key from the database AgentConfig (if configured).
 */
async function getApiKey(): Promise<string | null> {
  try {
    const config = await db.agentConfig.findUnique({ where: { key: "hermes_api_key" } });
    return config?.value || null;
  } catch {
    return null;
  }
}

/**
 * Generate a concise title from the first user message.
 */
function generateTitle(content: string): string {
  const cleaned = content.replace(/\n/g, " ").trim();
  if (cleaned.length <= 50) return cleaned;
  return cleaned.slice(0, 47) + "...";
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
 * Routes to NVIDIA API for nvidia/meta/mistralai models, or to Hermes Agent otherwise.
 */
export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();

    // ── Validate request ──────────────────────────────────────────
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
    const useNvidia = isNvidiaModel(model);
    const startTime = Date.now();

    // ── Session management ────────────────────────────────────────
    let session;

    if (body.sessionId) {
      session = await db.chatSession.findUnique({ where: { id: body.sessionId } });
      if (!session) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }
    } else {
      const firstUserMsg = body.messages.find((m) => m.role === "user");
      session = await db.chatSession.create({
        data: {
          title: firstUserMsg ? generateTitle(firstUserMsg.content) : "New Chat",
          model,
        },
      });
    }

    // Save user message to DB
    await db.chatMessage.create({
      data: {
        sessionId: session.id,
        role: lastMessage.role,
        content: lastMessage.content,
      },
    });

    // ── Route to appropriate provider ─────────────────────────────
    if (useNvidia) {
      return handleNvidiaRequest(request, session, model, body.messages, shouldStream, startTime);
    } else {
      return handleHermesRequest(session, model, body.messages, shouldStream, startTime);
    }
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
  _request: NextRequest,
  session: { id: string; hermesSessionId?: string | null },
  model: string,
  messages: { role: string; content: string }[],
  shouldStream: boolean,
  startTime: number,
) {
  const nvidiaKey = await ensureNvidiaKey();

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
    let fullContent = "";
    const duration = Date.now() - startTime;

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
              const delta = parsed.choices?.[0]?.delta;
              if (delta?.content) fullContent += delta.content;
              await writer.write(encoder.encode(`data: ${data}\n\n`));
            } catch {
              // Skip malformed JSON
            }
          }
        }

        // Save assistant response to DB
        if (fullContent) {
          await db.chatMessage.create({
            data: {
              sessionId: session.id,
              role: "assistant",
              content: fullContent,
              duration,
            },
          });
          await db.chatSession.update({
            where: { id: session.id },
            data: { updatedAt: new Date() },
          });
        }
      } catch (error) {
        console.error("[Chat API] NVIDIA stream error:", error);
      } finally {
        await writer.close();
      }
    })();

    return new NextResponse(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Session-Id": session.id,
        "X-Provider": "nvidia",
      },
    });
  }

  // ── Non-streaming response ────────────────────────────────────
  const data = await response.json();
  const duration = Date.now() - startTime;
  const content = data.choices?.[0]?.message?.content || "";
  const tokens = data.usage?.total_tokens;

  await db.chatMessage.create({
    data: {
      sessionId: session.id,
      role: "assistant",
      content,
      tokens: tokens || null,
      duration,
    },
  });
  await db.chatSession.update({
    where: { id: session.id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json(
    { ...data, sessionId: session.id },
    { headers: { "X-Session-Id": session.id, "X-Provider": "nvidia" } },
  );
}

/**
 * Handle request via Hermes Agent proxy.
 */
async function handleHermesRequest(
  session: { id: string; hermesSessionId?: string | null; model: string },
  model: string,
  messages: { role: string; content: string }[],
  shouldStream: boolean,
  startTime: number,
) {
  const hermesUrl = await getHermesUrl();
  const apiKey = await getApiKey();

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const hermesBody = {
    model: model || session.model || "default",
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: shouldStream,
    ...(session.hermesSessionId && { session_id: session.hermesSessionId }),
  };

  const hermesResponse = await fetch(`${hermesUrl}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(hermesBody),
  });

  if (!hermesResponse.ok) {
    const errorText = await hermesResponse.text().catch(() => "Unknown error");
    return NextResponse.json(
      { error: `Hermes Agent returned ${hermesResponse.status}`, details: errorText },
      { status: hermesResponse.status },
    );
  }

  const hermesSessionId = hermesResponse.headers.get("X-Hermes-Session-Id")
    || hermesResponse.headers.get("x-hermes-session-id");

  if (hermesSessionId && hermesSessionId !== session.hermesSessionId) {
    await db.chatSession.update({
      where: { id: session.id },
      data: { hermesSessionId },
    });
  }

  // ── Streaming response ────────────────────────────────────────
  if (shouldStream) {
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();
    let fullContent = "";
    let toolCallsData: unknown[] = [];
    const duration = Date.now() - startTime;

    (async () => {
      try {
        const reader = hermesResponse.body?.getReader();
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
              const delta = parsed.choices?.[0]?.delta;
              if (delta?.content) fullContent += delta.content;
              if (delta?.tool_calls) toolCallsData.push(...delta.tool_calls);
              await writer.write(encoder.encode(`data: ${data}\n\n`));
            } catch {
              // Skip malformed JSON
            }
          }
        }

        if (fullContent || toolCallsData.length > 0) {
          await db.chatMessage.create({
            data: {
              sessionId: session.id,
              role: "assistant",
              content: fullContent,
              toolCalls: toolCallsData.length > 0 ? JSON.stringify(toolCallsData) : null,
              duration,
            },
          });
          await db.chatSession.update({
            where: { id: session.id },
            data: { updatedAt: new Date() },
          });
        }
      } catch (error) {
        console.error("[Chat API] Stream processing error:", error);
      } finally {
        await writer.close();
      }
    })();

    return new NextResponse(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Session-Id": session.id,
        ...(hermesSessionId && { "X-Hermes-Session-Id": hermesSessionId }),
        "X-Provider": "hermes",
      },
    });
  }

  // ── Non-streaming response ────────────────────────────────────
  const hermesData = await hermesResponse.json();
  const duration = Date.now() - startTime;
  const content = hermesData.choices?.[0]?.message?.content || "";
  const toolCalls = hermesData.choices?.[0]?.message?.tool_calls || null;
  const tokens = hermesData.usage?.total_tokens;

  await db.chatMessage.create({
    data: {
      sessionId: session.id,
      role: "assistant",
      content,
      toolCalls: toolCalls ? JSON.stringify(toolCalls) : null,
      tokens: tokens || null,
      duration,
    },
  });
  await db.chatSession.update({
    where: { id: session.id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json(
    { ...hermesData, sessionId: session.id },
    {
      headers: {
        ...(hermesSessionId && { "X-Hermes-Session-Id": hermesSessionId }),
        "X-Provider": "hermes",
      },
    },
  );
}
