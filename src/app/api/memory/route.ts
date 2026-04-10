import { NextRequest, NextResponse } from "next/server";

const HERMES_API = process.env.HERMES_API_URL || "http://localhost:8643";

/**
 * GET /api/memory
 * Fetch memory content from hermes-api.
 */
export async function GET() {
  try {
    const hermesResponse = await fetch(`${HERMES_API}/v1/memory`);

    if (!hermesResponse.ok) {
      const errorText = await hermesResponse.text().catch(() => "Unknown error");
      console.error("[Memory API] hermes-api error:", hermesResponse.status, errorText);
      return NextResponse.json(
        { error: `hermes-api error: ${hermesResponse.status}`, detail: errorText },
        { status: hermesResponse.status },
      );
    }

    const data = await hermesResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[Memory API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch memory from hermes-api" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/memory
 * Update memory content via hermes-api.
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    const hermesResponse = await fetch(`${HERMES_API}/v1/memory`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!hermesResponse.ok) {
      const errorText = await hermesResponse.text().catch(() => "Unknown error");
      console.error("[Memory API] hermes-api error:", hermesResponse.status, errorText);
      return NextResponse.json(
        { error: `hermes-api error: ${hermesResponse.status}`, detail: errorText },
        { status: hermesResponse.status },
      );
    }

    const data = await hermesResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[Memory API] Error:", error);
    return NextResponse.json(
      { error: "Failed to update memory via hermes-api" },
      { status: 500 },
    );
  }
}
