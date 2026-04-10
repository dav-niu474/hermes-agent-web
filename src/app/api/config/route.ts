import { NextRequest, NextResponse } from "next/server";

const HERMES_API = process.env.HERMES_API_URL || "http://localhost:8643";

/**
 * GET /api/config
 * Fetch hermes-agent configuration from hermes-api.
 */
export async function GET() {
  try {
    const hermesResponse = await fetch(`${HERMES_API}/v1/config`);

    if (!hermesResponse.ok) {
      console.error("[Config API] hermes-api error:", hermesResponse.status);
      return NextResponse.json({});
    }

    const data = await hermesResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[Config API] Error:", error);
    return NextResponse.json({});
  }
}

/**
 * PUT /api/config
 * Update configuration via hermes-api /v1/config.
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    const hermesResponse = await fetch(`${HERMES_API}/v1/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (hermesResponse.ok) {
      const data = await hermesResponse.json();
      return NextResponse.json(data);
    }

    const errorText = await hermesResponse.text().catch(() => "Unknown error");
    console.error("[Config API] hermes-api error:", hermesResponse.status, errorText);
    return NextResponse.json(
      { error: `hermes-api error: ${hermesResponse.status}`, detail: errorText },
      { status: hermesResponse.status },
    );
  } catch (error) {
    console.error("[Config API] Error:", error);
    return NextResponse.json(
      { error: "Failed to update config via hermes-api" },
      { status: 500 },
    );
  }
}
