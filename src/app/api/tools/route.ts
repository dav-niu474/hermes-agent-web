import { NextResponse } from "next/server";
import {
  ALL_TOOLS,
  ALL_TOOLSETS,
  CATEGORIES,
  getToolsByCategory,
  getToolsByToolset,
} from "@/lib/hermes/tools-registry";

/**
 * GET /api/tools
 * Return tools from the registry with optional ?category=, ?toolset=, and ?search= filters.
 * Also returns toolsets and categories metadata.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const toolset = searchParams.get("toolset");
  const search = searchParams.get("search");

  let tools = ALL_TOOLS;

  if (category) {
    tools = getToolsByCategory(category);
  }

  if (toolset) {
    tools = getToolsByToolset(toolset);
  }

  if (search) {
    const query = search.toLowerCase();
    tools = tools.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.category.toLowerCase().includes(query),
    );
  }

  return NextResponse.json({
    tools,
    toolsets: ALL_TOOLSETS,
    categories: CATEGORIES,
    total: tools.length,
  });
}
