import { NextRequest, NextResponse } from "next/server";
import { db, getNvidiaApiKey } from "@/lib/db";

/** NVIDIA NIM API base URL */
const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1";

/**
 * Model registry — maps model IDs to their provider and configuration.
 */
interface ModelConfig {
  id: string;
  label: string;
  provider: "nvidia" | "openai-compatible";
  baseURL: string;
  apiKeyEnv?: string;
  apiKey?: string;
}

const MODEL_REGISTRY: ModelConfig[] = [
  // ── GLM 系列 ──
  {
    id: "glm-4-plus",
    label: "GLM 4.7 (Plus)",
    provider: "openai-compatible",
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    apiKeyEnv: "GLM_API_KEY",
  },
  {
    id: "glm-4-plus-thinking",
    label: "GLM 4.7 Thinking",
    provider: "openai-compatible",
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    apiKeyEnv: "GLM_API_KEY",
  },
  {
    id: "glm-5-plus",
    label: "GLM 5",
    provider: "openai-compatible",
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    apiKeyEnv: "GLM_API_KEY",
  },
  // ── Kimi 系列 ──
  {
    id: "moonshot-v1-128k",
    label: "Kimi 2.5 (128K)",
    provider: "openai-compatible",
    baseURL: "https://api.moonshot.cn/v1",
    apiKeyEnv: "KIMI_API_KEY",
  },
  {
    id: "moonshot-v1-auto",
    label: "Kimi 2.5 Auto",
    provider: "openai-compatible",
    baseURL: "https://api.moonshot.cn/v1",
    apiKeyEnv: "KIMI_API_KEY",
  },
  // ── NVIDIA 系列 ──
  {
    id: "nvidia/llama-3.1-nemotron-70b-instruct",
    label: "Nemotron 70B",
    provider: "openai-compatible",
    baseURL: NVIDIA_API_URL,
    apiKey: "nvidia",
  },
  {
    id: "nvidia/llama-3.1-nemotron-ultra-253b",
    label: "Nemotron Ultra 253B",
    provider: "openai-compatible",
    baseURL: NVIDIA_API_URL,
    apiKey: "nvidia",
  },
  {
    id: "meta/llama-3.1-405b-instruct",
    label: "Llama 3.1 405B",
    provider: "openai-compatible",
    baseURL: NVIDIA_API_URL,
    apiKey: "nvidia",
  },
  {
    id: "nvidia/deepseek-llama3.1-8b-instruct",
    label: "DeepSeek Llama 8B",
    provider: "openai-compatible",
    baseURL: NVIDIA_API_URL,
    apiKey: "nvidia",
  },
  {
    id: "nvidia/nemotron-4-340b-instruct",
    label: "Nemotron 4 340B",
    provider: "openai-compatible",
    baseURL: NVIDIA_API_URL,
    apiKey: "nvidia",
  },
];

const DEFAULT_MODEL = "glm-4-plus";

/** Get model config by ID */
function getModelConfig(modelId: string): ModelConfig {
  return MODEL_REGISTRY.find((m) => m.id === modelId) || MODEL_REGISTRY[0];
}

/** Get API key for a model */
function getApiKey(model: ModelConfig): string {
  if (model.apiKey === "nvidia") return getNvidiaApiKey();
  if (model.apiKeyEnv) return process.env[model.apiKeyEnv] || "";
  return "";
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
 * Routes to the correct provider based on the model ID.
 */
export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json(
        { error: "messages is required and must be a non-empty array" },
        { status: 400 }
      );
    }

    const lastMessage = body.messages[body.messages.length - 1];
    if (!lastMessage.role || !lastMessage.content) {
      return NextResponse.json(
        { error: "Each message must have role and content" },
        { status: 400 }
      );
    }

    const shouldStream = body.stream !== false;
    const modelId = body.model || DEFAULT_MODEL;
    const modelConfig = getModelConfig(modelId);
    const apiKey = getApiKey(modelConfig);
    const startTime = Date.now();

    if (!apiKey) {
      return NextResponse.json(
        {
          error: `API key not configured for model "${modelConfig.label}"`,
          hint: modelConfig.apiKeyEnv
            ? `Set the ${modelConfig.apiKeyEnv} environment variable in Vercel.`
            : "Set the NVIDIA_API_KEY environment variable in Vercel.",
        },
        { status: 400 }
      );
    }

    // ── Create or update session in database ──
    let sessionId = body.sessionId;
    let isFirstMessage = false;

    if (sessionId) {
      // Check if session exists
      const session = await db.chatSession.findUnique({ where: { id: sessionId } }).catch(() => null);
      if (!session) sessionId = undefined;
    }

    if (!sessionId) {
      // Auto-create session from first user message
      isFirstMessage = true;
      const title = generateTitle(lastMessage.content);
      const newSession = await db.chatSession
        .create({
          data: { title, model: modelId },
        })
        .catch(() => null);
      sessionId = newSession?.id;
    }

    // Save user message
    if (sessionId) {
      await db.chatMessage
        .create({
          data: {
            sessionId,
            role: lastMessage.role,
            content: lastMessage.content,
          },
        })
        .catch(() => {});
    }

    // ── Call the model ──
    const response = await callModel(modelConfig, apiKey, body.messages, shouldStream);

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

                // Extract content for DB save
                const delta = parsed.choices?.[0]?.delta;
                if (delta?.content) {
                  fullContent += delta.content;
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }
        } catch (error) {
          console.error("[Chat API] Stream error:", error);
        } finally {
          // Save assistant message to DB
          if (sessionId && fullContent) {
            const duration = Date.now() - startTime;
            await db.chatMessage
              .create({
                data: {
                  sessionId,
                  role: "assistant",
                  content: fullContent,
                  duration,
                },
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
          "X-Model": modelConfig.id,
          "X-Provider": modelConfig.provider,
          "X-Session-Id": sessionId || "",
          "X-Duration": String(Date.now() - startTime),
        },
      });
    }

    // Non-streaming response
    const data = await response.json();
    const duration = Date.now() - startTime;

    // Save assistant message
    if (sessionId) {
      const content = data.choices?.[0]?.message?.content || "";
      await db.chatMessage
        .create({
          data: {
            sessionId,
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
      provider: modelConfig.provider,
      model: modelConfig.id,
      sessionId,
      duration,
    });
  } catch (error) {
    console.error("[Chat API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Call the model API with the given config.
 */
async function callModel(
  modelConfig: ModelConfig,
  apiKey: string,
  messages: { role: string; content: string }[],
  stream: boolean
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  const requestBody = {
    model: modelConfig.id,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream,
    max_tokens: 4096,
    temperature: 0.7,
  };

  const response = await fetch(`${modelConfig.baseURL}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    console.error(`[Chat API] ${modelConfig.label} error:`, response.status, errorText);
    throw new Error(`Model API returned ${response.status}: ${errorText}`);
  }

  return response;
}

/**
 * Generate a concise title from the first user message.
 */
function generateTitle(content: string): string {
  const cleaned = content.replace(/\n/g, " ").trim();
  if (cleaned.length <= 50) return cleaned;
  return cleaned.slice(0, 47) + "...";
}
