import { NextResponse } from "next/server";

/**
 * GET /api/stats
 *
 * Aggregate dashboard statistics from the database.
 * Returns total sessions, messages, tokens, and recent sessions.
 */
export async function GET() {
  try {
    const { db } = await import("@/lib/db");

    const [totalSessions, totalMessagesResult, totalTokensResult, recentSessions] =
      await Promise.all([
        db.chatSession.count(),
        db.chatMessage.aggregate({ _sum: { tokens: true }, _count: true }),
        db.chatMessage.aggregate({ _sum: { tokens: true } }),
        db.chatSession.findMany({
          orderBy: { updatedAt: "desc" },
          take: 10,
          include: { _count: { select: { messages: true } } },
        }),
      ]);

    const totalMessages = totalMessagesResult._count;
    const totalTokens = totalTokensResult._sum.tokens || 0;

    // Compute sessions created today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const sessionsToday = await db.chatSession.count({
      where: { createdAt: { gte: todayStart } },
    });

    // Compute messages today
    const messagesToday = await db.chatMessage.count({
      where: { createdAt: { gte: todayStart } },
    });

    return NextResponse.json({
      totalSessions,
      totalMessages,
      totalTokens,
      sessionsToday,
      messagesToday,
      recentSessions: recentSessions.map((s) => ({
        id: s.id,
        title: s.title,
        model: s.model,
        messageCount: s._count.messages,
        updatedAt: s.updatedAt,
        createdAt: s.createdAt,
      })),
    });
  } catch (error) {
    console.error("[Stats API] GET error:", error);
    return NextResponse.json({
      totalSessions: 0,
      totalMessages: 0,
      totalTokens: 0,
      sessionsToday: 0,
      messagesToday: 0,
      recentSessions: [],
    });
  }
}
