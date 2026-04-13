import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/sessions/[id]
 * Get a session with all its messages.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { db } = await import("@/lib/db");
    const session = await db.chatSession.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: session.id,
      title: session.title,
      model: session.model,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messages: session.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls,
        tokens: m.tokens,
        duration: m.duration,
        createdAt: m.createdAt,
      })),
    });
  } catch (error) {
    console.error("[Session API] GET error:", error);
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
}

/**
 * PATCH /api/sessions/[id]
 * Update a session (e.g. title).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { db } = await import("@/lib/db");

    const data: Record<string, unknown> = {};
    if (typeof body.title === "string" && body.title.trim()) {
      data.title = body.title.trim().slice(0, 100);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const session = await db.chatSession.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      id: session.id,
      title: session.title,
      model: session.model,
      updatedAt: session.updatedAt,
    });
  } catch (error) {
    console.error("[Session API] PATCH error:", error);
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
}

/**
 * DELETE /api/sessions/[id]
 * Delete a session and all its messages.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { db } = await import("@/lib/db");
    await db.chatSession.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Session API] DELETE error:", error);
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
}
