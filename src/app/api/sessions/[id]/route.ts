import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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
    return NextResponse.json({ error: "Failed to fetch session" }, { status: 500 });
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
    await db.chatSession.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Session API] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
}
