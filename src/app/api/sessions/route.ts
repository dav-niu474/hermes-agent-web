import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/sessions
 * List all chat sessions with message counts, ordered by updatedAt desc.
 */
export async function GET() {
  try {
    const sessions = await db.chatSession.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { messages: true } },
      },
    });

    return NextResponse.json(
      sessions.map((s) => ({
        id: s.id,
        title: s.title,
        model: s.model,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        messageCount: s._count.messages,
      })),
    );
  } catch (error) {
    console.error("[Sessions API] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
  }
}
