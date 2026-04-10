import { NextResponse } from "next/server";

const HERMES_API = process.env.HERMES_API_URL || "http://localhost:8643";

/**
 * GET /api/tools
 * Fetch tools from hermes-api with optional ?category=, ?toolset=, ?search= filters.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const toolset = searchParams.get("toolset");
    const search = searchParams.get("search");

    // Build query string for hermes-api
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (toolset) params.set("toolset", toolset);
    if (search) params.set("search", search);

    const hermesResponse = await fetch(`${HERMES_API}/v1/tools?${params.toString()}`);

    if (!hermesResponse.ok) {
      const errorText = await hermesResponse.text().catch(() => "Unknown error");
      console.error("[Tools API] hermes-api error:", hermesResponse.status, errorText);
      return NextResponse.json(
        { error: `hermes-api error: ${hermesResponse.status}`, detail: errorText },
        { status: hermesResponse.status },
      );
    }

    const data = await hermesResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[Tools API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch tools from hermes-api" },
      { status: 500 },
    );
  }
}
