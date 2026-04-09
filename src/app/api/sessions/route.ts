import { NextRequest, NextResponse } from "next/server";
import { isDatabaseAvailable } from "@/lib/db";

/**
 * GET /api/sessions
 * List all chat sessions. Returns empty array when database is not configured.
 */
export async function GET() {
  if (!isDatabaseAvailable()) {
    return NextResponse.json([]);
  }
  try {
    const { db } = await import("@/lib/db");
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
    // Return empty array when DB is not available
    return NextResponse.json([]);
  }
}

/**
 * POST /api/sessions
 * Create a new chat session.
 */
export async function POST(request: NextRequest) {
  if (!isDatabaseAvailable()) {
    return NextResponse.json({ error: "Database not available" }, { status: 503 });
  }
  try {
    const body = await request.json();
    const { title, model } = body;

    const { db } = await import("@/lib/db");
    const session = await db.chatSession.create({
      data: {
        title: title || "New Chat",
        model: model || "default",
      },
    });

    return NextResponse.json({
      id: session.id,
      title: session.title,
      model: session.model,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });
  } catch (error) {
    console.error("[Sessions API] POST error:", error);
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
}
