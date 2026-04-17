import { NextRequest, NextResponse } from "next/server";
import { getLLMConfig, loadConfig, updateConfig, invalidateConfigCache } from "@/lib/hermes";

/**
 * GET /api/config
 *
 * Return the full hermes-agent configuration with resolved LLM info.
 */
export async function GET() {
  try {
    const config = loadConfig(true); // force fresh read
    const llmConfig = getLLMConfig();

    // Inject Modal env vars into terminal.modal if not already set
    const terminal = { ...(config.terminal as Record<string, unknown>) };
    const modal = { ...(terminal.modal as Record<string, unknown> | undefined) };
    if (process.env.MODAL_TOKEN_ID && !(modal.token_id as string)?.trim()) {
      modal.token_id = process.env.MODAL_TOKEN_ID;
    }
    if (process.env.MODAL_TOKEN_SECRET && !(modal.token_secret as string)?.trim()) {
      modal.token_secret = process.env.MODAL_TOKEN_SECRET;
    }
    terminal.modal = modal;

    return NextResponse.json({
      // Full raw config sections
      model: config.model,
      agent: config.agent,
      terminal,
      browser: config.browser,
      memory: config.memory,
      display: config.display,
      compression: config.compression,
      toolsets: config.toolsets,
      enabled_toolsets: config.enabled_toolsets,
      disabled_toolsets: config.disabled_toolsets,

      // Resolved LLM info (computed)
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
    return NextResponse.json(
      { error: "Failed to load config" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/config
 *
 * Update hermes-agent configuration sections.
 * Supports deep-merging of nested objects (agent, terminal, memory, etc.)
 * so partial updates don't clobber sibling keys.
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate body is a non-empty object
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Request body must be a JSON object" },
        { status: 400 },
      );
    }

    // Invalidate cache before writing so loadConfig() reads fresh data
    invalidateConfigCache();

    const updated = updateConfig(body);

    // Re-read the full config for the response
    const freshConfig = loadConfig(true);
    const llmConfig = getLLMConfig();

    // Inject Modal env vars into terminal.modal if not already set
    const freshTerminal = { ...(freshConfig.terminal as Record<string, unknown>) };
    const freshModal = { ...(freshTerminal.modal as Record<string, unknown> | undefined) };
    if (process.env.MODAL_TOKEN_ID && !(freshModal.token_id as string)?.trim()) {
      freshModal.token_id = process.env.MODAL_TOKEN_ID;
    }
    if (process.env.MODAL_TOKEN_SECRET && !(freshModal.token_secret as string)?.trim()) {
      freshModal.token_secret = process.env.MODAL_TOKEN_SECRET;
    }
    freshTerminal.modal = freshModal;

    return NextResponse.json({
      success: true,
      config: {
        model: freshConfig.model,
        agent: freshConfig.agent,
        terminal: freshTerminal,
        browser: freshConfig.browser,
        memory: freshConfig.memory,
        display: freshConfig.display,
        compression: freshConfig.compression,
        toolsets: freshConfig.toolsets,
        enabled_toolsets: freshConfig.enabled_toolsets,
        disabled_toolsets: freshConfig.disabled_toolsets,
        llm: {
          model: llmConfig.model,
          provider: llmConfig.provider,
          baseUrl: llmConfig.baseUrl,
          hasApiKey: !!llmConfig.apiKey,
          apiMode: llmConfig.apiMode,
          source: llmConfig.source,
        },
      },
    });
  } catch (error) {
    console.error("[Config API] PUT Error:", error);
    return NextResponse.json(
      { error: "Failed to update config" },
      { status: 500 },
    );
  }
}
