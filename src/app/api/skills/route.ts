import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/skills
 * List skills from DB. Supports ?category= and ?search= query params.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {};
    if (category && category !== "all") where.category = category;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const skills = await db.skill.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(skills);
  } catch (error) {
    console.error("[Skills API] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch skills" }, { status: 500 });
  }
}

/**
 * POST /api/skills
 * Create a new skill.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, category, description, content, isBuiltin, isActive } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const skill = await db.skill.create({
      data: {
        name: name.trim(),
        category: category || "general",
        description: description || "",
        content: content || "",
        isBuiltin: isBuiltin || false,
        isActive: isActive !== false,
      },
    });

    return NextResponse.json(skill);
  } catch (error) {
    console.error("[Skills API] POST error:", error);
    return NextResponse.json({ error: "Failed to create skill" }, { status: 500 });
  }
}

/**
 * PUT /api/skills
 * Update a skill.
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const { id, ...data } = body;
    const skill = await db.skill.update({ where: { id }, data });
    return NextResponse.json(skill);
  } catch (error) {
    console.error("[Skills API] PUT error:", error);
    return NextResponse.json({ error: "Failed to update skill" }, { status: 500 });
  }
}

/**
 * DELETE /api/skills
 * Delete a skill by id.
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }
    await db.skill.delete({ where: { id: body.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Skills API] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete skill" }, { status: 500 });
  }
}
