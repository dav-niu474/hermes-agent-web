import { NextRequest, NextResponse } from "next/server";
import { getLLMConfig, loadConfig, updateConfig } from "@/lib/hermes";

/**
 * GET /api/config
 *
 * Return hermes-agent configuration from the embedded config system.
 */
export async function GET() {
  try {
    const config = loadConfig();
    const llmConfig = getLLMConfig();

    return NextResponse.json({
      ...config,
      llm: {
        model: llmConfig.model,
        provider: llmConfig.provider,
        baseUrl: llmConfig.baseUrl,
        hasApiKey: !!llmConfig.apiKey,
        apiMode: llmConfig.apiMode,
        source: llmConfig.source,
      },
    });
  } catch (error) {
    console.error("[Config API] GET Error:", error);
    return NextResponse.json({});
  }
}

/**
 * PUT /api/config
 *
 * Update hermes-agent configuration via the embedded config system.
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    const updated = updateConfig(body);

    return NextResponse.json({
      success: true,
      config: updated,
    });
  } catch (error) {
    console.error("[Config API] PUT Error:", error);
    return NextResponse.json(
      { error: "Failed to update config" },
      { status: 500 },
    );
  }
}
