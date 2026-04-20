import { NextRequest, NextResponse } from "next/server";
import { resolveApiKey, resolveBaseUrl } from "@/lib/hermes";

/**
 * POST /api/benchmark
 *
 * Test response speed of one or more NVIDIA NIM models.
 *
 * Body: { models?: string[] }  — if empty, tests the 3 newly added models
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const modelIds: string[] = body.models || [
      "z-ai/glm-5.1",
      "z-ai/glm5",
      "z-ai/glm4.7",
      "minimaxai/minimax-m2.7",
      "minimaxai/minimax-m2.5",
    ];

    const apiKey = resolveApiKey("nvidia");
    const baseUrl = resolveBaseUrl("nvidia");

    if (!apiKey) {
      return NextResponse.json(
        { error: "NVIDIA_API_KEY not configured. Set it in Settings or as env var." },
        { status: 400 },
      );
    }

    const results: BenchmarkResult[] = [];

    for (const modelId of modelIds) {
      const result = await benchmarkModel(baseUrl, apiKey, modelId);
      results.push(result);
    }

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 },
    );
  }
}

interface BenchmarkResult {
  model: string;
  status: "ok" | "error";
  latencyMs: number;
  ttfbMs: number | null;
  totalTokens: number | null;
  response: string;
  error?: string;
}

async function benchmarkModel(
  baseUrl: string,
  apiKey: string,
  modelId: string,
): Promise<BenchmarkResult> {
  const url = `${baseUrl}/chat/completions`;
  const testPrompt = "Reply with exactly one word: Hello.";

  const body = JSON.stringify({
    model: modelId,
    messages: [{ role: "user", content: testPrompt }],
    max_tokens: 10,
    temperature: 0,
    stream: false,
  });

  const startMs = Date.now();
  let ttfbMs: number | null = null;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Requested-With": "hermes-agent-web",
      },
      body,
    });

    ttfbMs = Date.now() - startMs;

    if (!resp.ok) {
      const errBody = await resp.text();
      let errMsg: string;
      try {
        const errJson = JSON.parse(errBody);
        errMsg = errJson.error?.message || errJson.message || errBody.substring(0, 200);
      } catch {
        errMsg = errBody.substring(0, 200);
      }
      return {
        model: modelId,
        status: "error",
        latencyMs: Date.now() - startMs,
        ttfbMs,
        totalTokens: null,
        response: "",
        error: `${resp.status} ${errMsg}`,
      };
    }

    const data = await resp.json();
    const totalMs = Date.now() - startMs;
    const content = data.choices?.[0]?.message?.content || "";
    const totalTokens = data.usage?.total_tokens ?? null;

    return {
      model: modelId,
      status: "ok",
      latencyMs: totalMs,
      ttfbMs,
      totalTokens,
      response: content.trim().substring(0, 100),
    };
  } catch (err) {
    return {
      model: modelId,
      status: "error",
      latencyMs: Date.now() - startMs,
      ttfbMs,
      totalTokens: null,
      response: "",
      error: String(err),
    };
  }
}
