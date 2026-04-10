import { NextRequest, NextResponse } from "next/server";
import { scanSkills, manageSkill } from "@/lib/hermes";

/**
 * GET /api/skills
 *
 * Scan hermes-agent skill directories and return skill metadata.
 * Supports ?category=, ?search= filters.
 *
 * Response shape matches the old hermes-api response.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const search = searchParams.get("search");

    const skills = await scanSkills({
      category: category || undefined,
      search: search || undefined,
    });

    // Extract unique categories
    const categories = [...new Set(skills.map((s) => s.category).filter(Boolean))];

    return NextResponse.json({
      skills: skills.map((s) => ({
        name: s.name,
        category: s.category,
        description: s.description,
        tags: s.tags,
        isBuiltin: s.isBuiltin,
        status: s.status,
        platforms: s.platforms,
      })),
      total: skills.length,
      categories,
    });
  } catch (error) {
    console.error("[Skills API] Error:", error);
    return NextResponse.json(
      { error: "Failed to scan skills" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/skills
 *
 * Create, edit, patch, or delete a skill.
 *
 * Body:
 *   action: "create" | "edit" | "patch" | "delete"
 *   name: string (skill name)
 *   category?: string
 *   description?: string
 *   content?: string (full SKILL.md content for create/edit; patch content for patch)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, name, category, description, content } = body;

    if (!action || !name) {
      return NextResponse.json(
        { error: "Missing required fields: action, name" },
        { status: 400 },
      );
    }

    const validActions = ["create", "edit", "patch", "delete"];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action: ${action}. Must be one of: ${validActions.join(", ")}` },
        { status: 400 },
      );
    }

    const result = await manageSkill(action, {
      name: String(name),
      category: category ? String(category) : undefined,
      description: description ? String(description) : undefined,
      content: content ? String(content) : undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      path: result.path,
    });
  } catch (error) {
    console.error("[Skills API] POST error:", error);
    return NextResponse.json(
      { error: "Failed to manage skill" },
      { status: 500 },
    );
  }
}
