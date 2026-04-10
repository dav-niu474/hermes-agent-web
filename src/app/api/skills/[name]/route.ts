import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/skills/[name]
 * Proxy to hermes-api /v1/skills/{name} for skill detail.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;

    if (!name) {
      return NextResponse.json({ error: "Skill name is required" }, { status: 400 });
    }

    const HERMES_API = process.env.HERMES_API_URL || "http://localhost:8643";
    const hermesResponse = await fetch(
      `${HERMES_API}/v1/skills/${encodeURIComponent(name)}`,
    );

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
      { error: "Failed to fetch skill detail from hermes-api" },
      { status: 500 },
    );
  }
}
