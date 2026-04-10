import { NextRequest, NextResponse } from "next/server";
import {
  ALL_TOOLS,
  ALL_TOOLSETS,
  CATEGORIES,
  getToolsByToolset,
  getToolsByCategory,
  getToolsetInfo,
  resolveToolset,
  type ToolDefinition,
  type ToolsetDefinition,
} from "@/lib/hermes";

/**
 * GET /api/tools
 *
 * Return tool definitions from the embedded static registry.
 * Supports ?category=, ?toolset=, ?search= filters.
 *
 * Response shape matches the old hermes-api response so the frontend
 * does not need changes.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const toolset = searchParams.get("toolset");
    const search = searchParams.get("search");

    let tools: ToolDefinition[] = [...ALL_TOOLS];

    // Filter by category
    if (category) {
      tools = getToolsByCategory(category);
    }

    // Filter by toolset
    if (toolset) {
      const toolsetTools = getToolsByToolset(toolset);
      const toolsetName = new Set(toolsetTools.map((t) => t.name));
      tools = tools.filter((t) => toolsetName.has(t.name));
    }

    // Filter by search
    if (search) {
      const q = search.toLowerCase();
      tools = tools.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q),
      );
    }

    // Build toolset info with tool counts
    const toolsetInfo: Record<string, {
      name: string;
      description: string;
      tools: string[];
      tool_count: number;
      resolved_tools: string[];
    }> = {};

    for (const [name, def] of Object.entries(ALL_TOOLSETS)) {
      const resolved = resolveToolset(name);
      const uniqueTools = [...new Set(resolved)];
      toolsetInfo[name] = {
        name,
        description: def.description,
        tools: def.tools,
        tool_count: uniqueTools.length,
        resolved_tools: uniqueTools,
      };
    }

    // Build category summary
    const categorySummary: Record<string, {
      label: string;
      icon: string;
      color: string;
      hex: string;
      count: number;
    }> = {};

    for (const tool of tools) {
      const cat = tool.category;
      if (!categorySummary[cat] && CATEGORIES[cat]) {
        const cm = CATEGORIES[cat];
        categorySummary[cat] = {
          label: cm.label,
          icon: cm.icon,
          color: cm.color,
          hex: cm.hex,
          count: 0,
        };
      }
      if (categorySummary[cat]) {
        categorySummary[cat].count++;
      }
    }

    return NextResponse.json({
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        category: t.category,
        toolset: t.toolset,
        emoji: t.emoji,
        parameters: t.parameters,
        isWebCompatible: t.isWebCompatible,
      })),
      toolsets: toolsetInfo,
      categories: categorySummary,
      total: tools.length,
    });
  } catch (error) {
    console.error("[Tools API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch tools" },
      { status: 500 },
    );
  }
}
