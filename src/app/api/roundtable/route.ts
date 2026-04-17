import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getLLMConfig, loadConfig } from "@/lib/hermes";

// ---------------------------------------------------------------------------
// Preset agent profiles for roundtable discussions
// ---------------------------------------------------------------------------

export interface Participant {
  id: string;
  name: string;
  avatar: string;
  color: string;
  systemPrompt: string;
}

export interface RoundtableMessage {
  role: "user" | "agent";
  agentId?: string;
  name: string;
  content: string;
}

export interface RoundtableRequest {
  topic: string;
  participants?: Participant[];
  messages: RoundtableMessage[];
  action: "start" | "continue" | "respond";
  model?: string;
  provider?: string;
}

const PRESET_PARTICIPANTS: Participant[] = [
  {
    id: "tech",
    name: "技术专家",
    avatar: "🔬",
    color: "blue",
    systemPrompt:
      "你是一位资深技术架构师，擅长从技术可行性、系统设计、性能优化、代码质量等角度分析问题。" +
      "你的分析深入且务实，善于权衡不同技术方案的优劣。回答简洁有力，2-4段即可。",
  },
  {
    id: "product",
    name: "产品经理",
    avatar: "💡",
    color: "amber",
    systemPrompt:
      "你是一位经验丰富的产品经理，擅长从用户需求、产品价值、商业模型、市场定位等角度思考问题。" +
      "你关注用户体验和产品可行性，善于发现潜在的商业模式。回答简洁有力，2-4段即可。",
  },
  {
    id: "design",
    name: "设计师",
    avatar: "🎨",
    color: "pink",
    systemPrompt:
      "你是一位优秀的产品设计师，擅长从用户体验、视觉设计、交互设计、信息架构等角度分析问题。" +
      "你注重细节和一致性，善于将复杂功能变得简单易用。回答简洁有力，2-4段即可。",
  },
  {
    id: "analyst",
    name: "数据分析师",
    avatar: "📊",
    color: "emerald",
    systemPrompt:
      "你是一位专业的数据分析师，擅长从数据驱动、趋势分析、竞品对比、ROI 评估等角度分析问题。" +
      "你注重量化决策，善于用数据和事实支撑观点。回答简洁有力，2-4段即可。",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pick the next participant in round-robin order.
 * If action is 'start', pick the first participant.
 * If action is 'respond', the user just spoke — pick the first agent.
 */
function pickNextParticipant(
  participants: Participant[],
  messages: RoundtableMessage[],
  action: "start" | "continue" | "respond",
): Participant {
  // Find the last agent who spoke
  let lastAgentIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "agent") {
      const msgAgentId = messages[i].agentId;
      lastAgentIdx = participants.findIndex((p) => p.id === msgAgentId);
      break;
    }
  }

  // Next agent in round-robin
  const nextIdx = (lastAgentIdx + 1) % participants.length;
  return participants[nextIdx];
}

/**
 * Build the conversation context for the current agent.
 * All prior messages are formatted as a single user context block,
 * and the agent generates the assistant response.
 */
function buildAgentMessages(
  currentAgent: Participant,
  topic: string,
  messages: RoundtableMessage[],
): { system: string; user: string } {
  // System prompt
  const systemPrompt =
    `${currentAgent.systemPrompt}\n\n` +
    `你正在参与一个关于「${topic}」的圆桌讨论。` +
    `讨论中有多位专家参与，每位专家都有不同的专业背景和视角。\n` +
    `请仔细阅读讨论记录中其他人的观点，然后给出你独特的专业视角。\n` +
    `要求：\n` +
    `- 回答简洁有力，2-4段即可，不要长篇大论\n` +
    `- 如果同意某人的观点可以引用，但重点给出你自己独特的见解\n` +
    `- 如果不同意，请给出你的理由\n` +
    `- 不要重复别人已经说过的内容\n` +
    `- 直接开始你的论述，不要加标题或前缀`;

  // Build discussion history
  const discussionParts: string[] = [];
  discussionParts.push(`讨论主题：${topic}`);
  discussionParts.push("以下是目前的讨论记录：");
  discussionParts.push("");

  for (const msg of messages) {
    const prefix = msg.role === "user" ? "用户" : msg.name;
    discussionParts.push(`【${prefix}】：${msg.content}`);
  }

  discussionParts.push("");
  discussionParts.push(
    `现在轮到你（${currentAgent.name}）发言。请基于以上讨论内容，给出你的专业视角：`,
  );

  return {
    system: systemPrompt,
    user: discussionParts.join("\n"),
  };
}

// ---------------------------------------------------------------------------
// GET — health check
// ---------------------------------------------------------------------------

export async function GET() {
  return NextResponse.json({ status: "ok", feature: "roundtable" });
}

// ---------------------------------------------------------------------------
// POST — run a roundtable turn (SSE streaming)
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body: RoundtableRequest = await request.json();

    // ── Validate ──
    if (!body.topic?.trim()) {
      return NextResponse.json(
        { error: "topic is required" },
        { status: 400 },
      );
    }

    const participants = body.participants?.length
      ? body.participants
      : PRESET_PARTICIPANTS;
    const messages = body.messages || [];

    if (!participants.length) {
      return NextResponse.json(
        { error: "at least one participant is required" },
        { status: 400 },
      );
    }

    // ── Pick next speaker ──
    const currentAgent = pickNextParticipant(
      participants,
      messages,
      body.action || "start",
    );

    // ── Resolve LLM config ──
    const llmConfig = await getLLMConfig(body.model, body.provider);
    const client = new OpenAI({
      apiKey: llmConfig.apiKey,
      baseURL: llmConfig.baseUrl,
    });

    // ── Build messages for the LLM ──
    const { system, user } = buildAgentMessages(
      currentAgent,
      body.topic,
      messages,
    );

    // ── SSE streaming response ──
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    const writeSSE = (data: string) =>
      writer.write(encoder.encode(`data: ${data}\n\n`));

    // Emit agent_info first
    writeSSE(
      JSON.stringify({
        type: "agent_info",
        agentId: currentAgent.id,
        name: currentAgent.name,
        avatar: currentAgent.avatar,
        color: currentAgent.color,
      }),
    );

    // Run the LLM call in the background
    (async () => {
      try {
        const completion = await client.chat.completions.create({
          model: llmConfig.model,
          max_tokens: 1024,
          temperature: 0.7,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          stream: true,
        });

        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            writeSSE(JSON.stringify({ type: "delta", content: delta }));
          }
        }

        // Done
        writeSSE(
          JSON.stringify({
            type: "done",
            agentId: currentAgent.id,
            name: currentAgent.name,
          }),
        );
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Unknown LLM error";
        console.error("[Roundtable] LLM error:", message);
        writeSSE(
          JSON.stringify({ type: "error", error: message }),
        );
      } finally {
        try {
          writer.close();
        } catch {
          // Ignore close errors
        }
      }
    })();

    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[Roundtable] POST error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
