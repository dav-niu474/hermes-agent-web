import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/config
 * Get all configuration as key-value pairs.
 */
export async function GET() {
  try {
    const configs = await db.agentConfig.findMany();
    const map: Record<string, string> = {};
    for (const c of configs) {
      map[c.key] = c.value;
    }
    return NextResponse.json(map);
  } catch (error) {
    console.error("[Config API] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch config" }, { status: 500 });
  }
}

/**
 * PUT /api/config
 * Update a configuration value (upsert).
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, value, label, group, description } = body;

    if (!key) {
      return NextResponse.json({ error: "Key is required" }, { status: 400 });
    }

    const config = await db.agentConfig.upsert({
      where: { key },
      update: { value: String(value) },
      create: {
        key,
        value: String(value),
        label: label || key,
        group: group || "general",
        description: description || "",
      },
    });

    return NextResponse.json({ key: config.key, value: config.value });
  } catch (error) {
    console.error("[Config API] PUT error:", error);
    return NextResponse.json({ error: "Failed to update config" }, { status: 500 });
  }
}
