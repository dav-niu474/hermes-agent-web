import { NextResponse } from "next/server";
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

/**
 * GET /api/hermes
 * Check hermes-agent health and list available models.
 * Returns connection status, health data, model list, and current config.
 */
export async function GET() {
  try {
    const config = await getHermesConfig();
    const headers: Record<string, string> = {};
    if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;

    // Health check + models in parallel
    const [healthResult, modelsResult] = await Promise.allSettled([
      fetch(`${config.url}/health`, {
        headers,
        signal: AbortSignal.timeout(5000),
      }).then((r) => r.json()),
      fetch(`${config.url}/v1/models`, {
        headers,
        signal: AbortSignal.timeout(8000),
      }).then((r) => r.json()),
    ]);

    let healthStatus: "connected" | "disconnected" | "error" = "disconnected";
    let healthData: unknown = null;

    if (healthResult.status === "fulfilled" && healthResult.value?.status === "ok") {
      healthStatus = "connected";
      healthData = healthResult.value;
    } else if (healthResult.status === "rejected") {
      healthStatus = "error";
    }

    let models: { id: string; owned_by: string }[] = [];
    if (modelsResult.status === "fulfilled" && modelsResult.value?.data) {
      models = modelsResult.value.data.map(
        (m: { id: string; owned_by?: string }) => ({
          id: m.id,
          owned_by: m.owned_by || "hermes",
        }),
      );
    }

    return NextResponse.json({
      status: healthStatus,
      health: healthData,
      models,
      config: { url: config.url, hasApiKey: !!config.apiKey },
    });
  } catch (error) {
    console.error("[Hermes API] Error:", error);
    return NextResponse.json({
      status: "error",
      health: null,
      models: [],
      config: { url: "", hasApiKey: false },
      error: "Failed to connect to Hermes Agent",
    });
  }
}

/**
 * PUT /api/hermes
 * Update hermes-agent connection config in the database.
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { hermes_url, hermes_api_key } = body;

    if (hermes_url !== undefined) {
      await db.agentConfig.upsert({
        where: { key: "hermes_url" },
        update: { value: String(hermes_url) },
        create: {
          key: "hermes_url",
          value: String(hermes_url),
          label: "Hermes Agent URL",
          group: "hermes",
        },
      });
    }

    if (hermes_api_key !== undefined) {
      await db.agentConfig.upsert({
        where: { key: "hermes_api_key" },
        update: { value: String(hermes_api_key) },
        create: {
          key: "hermes_api_key",
          value: String(hermes_api_key),
          label: "Hermes API Key",
          group: "hermes",
          type: "secret",
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Hermes API] PUT error:", error);
    return NextResponse.json(
      { error: "Failed to save config" },
      { status: 503 },
    );
  }
}
