import { NextRequest, NextResponse } from "next/server";
import { getSkillContent } from "@/lib/hermes";

/**
 * GET /api/skills/[name]
 *
 * Get the full content of a skill by name.
 * Uses the embedded hermes skills scanner.
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

    const result = await getSkillContent(decodeURIComponent(name));

    if (!result) {
      return NextResponse.json(
        { error: `Skill '${name}' not found` },
        { status: 404 },
      );
    }

    return NextResponse.json({
      content: result.content,
      linkedFiles: result.linkedFiles,
    });
  } catch (error) {
    console.error("[Skills API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch skill detail" },
      { status: 500 },
    );
  }
}
