import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getLLMConfig,
  getHermesHome,
  getToolsetFilter,
  resolveToolset,
  TOOLSETS,
} from "@/lib/hermes";
import { detectAvailableProviders } from "@/lib/hermes/config";

/**
 * GET /api/hermes
 *
 * Return connection status, config, model info, and toolset availability.
 * All data is local — no proxying to external services.
 */
export async function GET() {
  try {
    let status: "connected" | "disconnected" | "error" = "connected";
    let configData: unknown = null;
    let models: { id: string; owned_by: string }[] = [];

    try {
      const llmConfig = getLLMConfig();
      configData = {
        model: llmConfig.model,
        provider: llmConfig.provider,
        baseUrl: llmConfig.baseUrl,
        hasApiKey: !!llmConfig.apiKey,
        apiMode: llmConfig.apiMode,
        source: llmConfig.source,
      };

      models = [
        {
          id: llmConfig.model,
          owned_by: llmConfig.provider,
        },
      ];

      // Check if there's actually an API key configured
      if (!llmConfig.apiKey) {
        status = "disconnected";
      }
    } catch {
      status = "error";
    }

    // Get available providers
    let availableProviders: string[] = [];
    try {
      availableProviders = detectAvailableProviders();
    } catch {
      // ignore
    }

    // Get toolset info
    const toolsets: Record<string, { available: boolean; tools: string[]; description: string }> = {};
    try {
      const filter = getToolsetFilter();
      for (const ts of filter.effective) {
        const resolved = resolveToolset(ts);
        const def = TOOLSETS[ts];
        toolsets[ts] = {
          available: true,
          tools: resolved,
          description: def?.description || "",
        };
      }
    } catch {
      // ignore
    }

    // Get hermes home
    let hermesHome = "";
    try {
      hermesHome = getHermesHome();
    } catch {
      // ignore
    }

    return NextResponse.json({
      status,
      config: configData,
      models,
      availableProviders,
      toolsets,
      hermesHome,
      health: {
        status: "ok",
        version: "embedded",
        mode: "local",
      },
    });
  } catch (error) {
    console.error("[Hermes API] GET Error:", error);
    return NextResponse.json({
      status: "error",
      health: null,
      models: [],
      config: null,
      error: "Failed to load Hermes configuration",
    });
  }
}

/**
 * PUT /api/hermes
 *
 * Save hermes connection config to local DB.
 * No proxying needed — all config is local now.
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Hermes API] PUT Error:", error);
    return NextResponse.json(
      { error: "Failed to save config" },
      { status: 503 },
    );
  }
}
