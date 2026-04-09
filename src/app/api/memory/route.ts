import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/memory
 * List all memory entries. Returns empty array when database is not configured.
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
        { content: { contains: search } },
        { tags: { contains: search } },
      ];
    }

    const { db } = await import("@/lib/db");
    const memories = await db.memoryEntry.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      memories.map((m) => ({
        id: m.id,
        category: m.category,
        content: m.content,
        tags: m.tags ? m.tags.split(",").map((t) => t.trim()) : [],
        source: m.source,
        createdAt: m.createdAt,
      })),
    );
  } catch (error) {
    console.error("[Memory API] GET error:", error);
    return NextResponse.json([]);
  }
}

/**
 * POST /api/memory
 * Create a new memory entry.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { category, content, tags, source } = body;

    if (!content?.trim()) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const { db } = await import("@/lib/db");
    const memory = await db.memoryEntry.create({
      data: {
        category: category || "general",
        content: content.trim(),
        tags: Array.isArray(tags) ? tags.join(",") : tags || "",
        source: source || "Web UI",
      },
    });

    return NextResponse.json({
      id: memory.id,
      category: memory.category,
      content: memory.content,
      tags: memory.tags ? memory.tags.split(",") : [],
      source: memory.source,
      createdAt: memory.createdAt,
    });
  } catch (error) {
    console.error("[Memory API] POST error:", error);
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
}

/**
 * DELETE /api/memory
 * Delete a memory entry by id.
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }
    const { db } = await import("@/lib/db");
    await db.memoryEntry.delete({ where: { id: body.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Memory API] DELETE error:", error);
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
}
