import { NextRequest, NextResponse } from "next/server";
import { scanSkills } from "@/lib/hermes";

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
