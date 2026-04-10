import { NextRequest, NextResponse } from "next/server";

const HERMES_API = process.env.HERMES_API_URL || "http://localhost:8643";

/**
 * GET /api/skills
 * Fetch skills from hermes-api with optional ?category=, ?search= filters.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const search = searchParams.get("search");

    // Build query string for hermes-api
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (search) params.set("search", search);

    const hermesResponse = await fetch(`${HERMES_API}/v1/skills?${params.toString()}`);

    if (!hermesResponse.ok) {
      const errorText = await hermesResponse.text().catch(() => "Unknown error");
      console.error("[Skills API] hermes-api error:", hermesResponse.status, errorText);
      return NextResponse.json(
        { error: `hermes-api error: ${hermesResponse.status}`, detail: errorText },
        { status: hermesResponse.status },
      );
    }

    const data = await hermesResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[Skills API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch skills from hermes-api" },
      { status: 500 },
    );
  }
}
