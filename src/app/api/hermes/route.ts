import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const HERMES_API = process.env.HERMES_API_URL || "http://localhost:8643";

/**
 * GET /api/hermes
 * Check hermes-api (mini-service on port 8643) health, models, and config.
 */
export async function GET() {
  try {
    // Health, models, and config in parallel
    const [healthResult, modelsResult, configResult] = await Promise.allSettled([
      fetch(`${HERMES_API}/health`, {
        signal: AbortSignal.timeout(5000),
      }).then((r) => r.json()),
      fetch(`${HERMES_API}/v1/models`, {
        signal: AbortSignal.timeout(8000),
      }).then((r) => r.json()),
      fetch(`${HERMES_API}/v1/config`, {
        signal: AbortSignal.timeout(5000),
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

    let configData: unknown = null;
    if (configResult.status === "fulfilled") {
      configData = configResult.value;
    }

    return NextResponse.json({
      status: healthStatus,
      health: healthData,
      models,
      config: configData,
    });
  } catch (error) {
    console.error("[Hermes API] Error:", error);
    return NextResponse.json({
      status: "error",
      health: null,
      models: [],
      config: null,
      error: "Failed to connect to Hermes API service",
    });
  }
}

/**
 * PUT /api/hermes
 * Save hermes connection config to local DB and optionally forward to hermes-api config.
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    // Save relevant fields to local DB for session persistence
    if (body.hermes_url !== undefined) {
      await db.agentConfig.upsert({
        where: { key: "hermes_url" },
        update: { value: String(body.hermes_url) },
        create: {
          key: "hermes_url",
          value: String(body.hermes_url),
          label: "Hermes Agent URL",
          group: "hermes",
        },
      });
    }

    if (body.hermes_api_key !== undefined) {
      await db.agentConfig.upsert({
        where: { key: "hermes_api_key" },
        update: { value: String(body.hermes_api_key) },
        create: {
          key: "hermes_api_key",
          value: String(body.hermes_api_key),
          label: "Hermes API Key",
          group: "hermes",
          type: "secret",
        },
      });
    }

    // Forward config to hermes-api if config payload is present
    if (body.config && typeof body.config === "object") {
      try {
        await fetch(`${HERMES_API}/v1/config`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body.config),
        });
      } catch (forwardError) {
        console.warn("[Hermes API] Failed to forward config to hermes-api:", forwardError);
      }
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
