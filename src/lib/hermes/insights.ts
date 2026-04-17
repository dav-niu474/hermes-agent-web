/**
 * Insights Engine — Session analytics for Hermes
 *
 * Queries the Prisma database to generate comprehensive session analytics
 * including overview stats, model usage, tool usage, activity patterns,
 * and top sessions.
 */

import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

/* ═══════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════ */

export interface InsightsOverview {
  totalSessions: number;
  totalMessages: number;
  totalToolCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  avgMessagesPerSession: number;
  dateRangeStart: Date;
  dateRangeEnd: Date;
  userMessages: number;
  assistantMessages: number;
  toolMessages: number;
}

export interface ModelUsage {
  model: string;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  toolCalls: number;
}

export interface ToolUsage {
  tool: string;
  count: number;
  percentage: number;
}

export interface ActivityData {
  byDay: Array<{ day: string; count: number }>;
  byHour: Array<{ hour: number; count: number }>;
  busiestDay: string;
  busiestHour: number;
  activeDays: number;
}

export interface TopSession {
  id: string;
  title: string | null;
  messageCount: number;
  model: string | null;
  createdAt: Date;
}

export interface InsightsReport {
  overview: InsightsOverview;
  models: ModelUsage[];
  tools: ToolUsage[];
  activity: ActivityData;
  topSessions: TopSession[];
  generatedAt: Date;
}

/* ═══════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════ */

/**
 * Format a Date to 'YYYY-MM-DD' string
 */
function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Format a Date to short day label like 'Mon', 'Tue'
 */
function toShortDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

/**
 * Format hour (0-23) to readable label
 */
function formatHour(h: number): string {
  if (h === 0) return '12am';
  if (h < 12) return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

/**
 * Rough cost estimation (in USD) based on token counts.
 * Uses conservative average pricing for common models.
 */
function estimateCost(totalTokens: number): number {
  // ~$3 per 1M input tokens, ~$15 per 1M output tokens (average)
  // We don't have split, so use a middle estimate of ~$6 per 1M tokens
  return (totalTokens / 1_000_000) * 6;
}

/* ═══════════════════════════════════════════
   MAIN GENERATOR
   ═══════════════════════════════════════════ */

export async function generateInsights(days: number = 30): Promise<InsightsReport> {
  const dateRangeEnd = new Date();
  const dateRangeStart = new Date();
  dateRangeStart.setDate(dateRangeStart.getDate() - days);
  dateRangeStart.setHours(0, 0, 0, 0);

  // ── Run all independent queries in parallel ──
  const [
    sessionCount,
    messageAgg,
    userMsgCount,
    assistantMsgCount,
    toolMsgCount,
    toolCallsAgg,
    modelGroups,
    toolNameGroups,
    dayBuckets,
    hourBuckets,
    topSessionsData,
  ] = await Promise.all([
    // 1. Total sessions in range
    db.chatSession.count({
      where: { createdAt: { gte: dateRangeStart, lte: dateRangeEnd } },
    }),

    // 2. Message token aggregation
    db.chatMessage.aggregate({
      _sum: { tokens: true },
      _count: true,
      where: { createdAt: { gte: dateRangeStart, lte: dateRangeEnd } },
    }),

    // 3. User messages count
    db.chatMessage.count({
      where: {
        createdAt: { gte: dateRangeStart, lte: dateRangeEnd },
        role: 'user',
      },
    }),

    // 4. Assistant messages count
    db.chatMessage.count({
      where: {
        createdAt: { gte: dateRangeStart, lte: dateRangeEnd },
        role: 'assistant',
      },
    }),

    // 5. Tool messages count (role = 'tool' or has toolCalls)
    db.chatMessage.count({
      where: {
        createdAt: { gte: dateRangeStart, lte: dateRangeEnd },
        OR: [
          { role: 'tool' },
          { toolCalls: { not: null } },
        ],
      },
    }),

    // 6. Tool call count from ToolUsage table
    db.toolUsage.count({
      where: { createdAt: { gte: dateRangeStart, lte: dateRangeEnd } },
    }),

    // 7. Model usage grouped by session model
    db.chatSession.groupBy({
      by: ['model'],
      where: { createdAt: { gte: dateRangeStart, lte: dateRangeEnd } },
      _count: true,
    }),

    // 8. Tool usage frequency from ToolUsage table
    db.toolUsage.groupBy({
      by: ['toolName'],
      where: { createdAt: { gte: dateRangeStart, lte: dateRangeEnd } },
      _count: true,
      orderBy: { _count: { toolName: 'desc' } },
      take: 15,
    }),

    // 9. Messages grouped by day
    db.chatMessage.groupBy({
      by: ['createdAt'],
      where: { createdAt: { gte: dateRangeStart, lte: dateRangeEnd } },
      _count: true,
    }),

    // 10. Messages grouped by hour (using raw SQL for extraction)
    db.$queryRaw<Array<{ hour: number; count: bigint }>>`
      SELECT EXTRACT(HOUR FROM "created_at")::int AS hour, COUNT(*)::bigint AS count
      FROM "ChatMessage"
      WHERE "created_at" >= ${dateRangeStart} AND "created_at" <= ${dateRangeEnd}
      GROUP BY EXTRACT(HOUR FROM "created_at")
      ORDER BY hour
    `,

    // 11. Top sessions by message count
    db.chatSession.findMany({
      where: { createdAt: { gte: dateRangeStart, lte: dateRangeEnd } },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      include: { _count: { select: { messages: true } } },
    }),
  ]);

  // ── Build overview ──
  const totalMessages = messageAgg._count;
  const totalTokens = messageAgg._sum.tokens ?? 0;

  // For messages with tool calls, count from toolCalls field
  const messagesWithToolCalls = await db.chatMessage.count({
    where: {
      createdAt: { gte: dateRangeStart, lte: dateRangeEnd },
      toolCalls: { not: null },
    },
  });

  const totalToolCalls = Math.max(toolCallsAgg, messagesWithToolCalls);

  const overview: InsightsOverview = {
    totalSessions: sessionCount,
    totalMessages,
    totalToolCalls,
    totalInputTokens: Math.round(totalTokens * 0.6), // estimate
    totalOutputTokens: Math.round(totalTokens * 0.4), // estimate
    totalTokens,
    estimatedCost: Number(estimateCost(totalTokens).toFixed(4)),
    avgMessagesPerSession: sessionCount > 0 ? Math.round((totalMessages / sessionCount) * 10) / 10 : 0,
    dateRangeStart,
    dateRangeEnd,
    userMessages: userMsgCount,
    assistantMessages: assistantMsgCount,
    toolMessages: toolMsgCount,
  };

  // ── Build model usage ──
  const models: ModelUsage[] = await Promise.all(
    modelGroups.map(async (g) => {
      const msgs = await db.chatMessage.aggregate({
        _sum: { tokens: true },
        _count: true,
        where: {
          createdAt: { gte: dateRangeStart, lte: dateRangeEnd },
          session: { model: g.model },
        },
      });
      const toolCallsForModel = await db.chatMessage.count({
        where: {
          createdAt: { gte: dateRangeStart, lte: dateRangeEnd },
          session: { model: g.model },
          toolCalls: { not: null },
        },
      });

      return {
        model: g.model,
        sessions: g._count,
        inputTokens: Math.round((msgs._sum.tokens ?? 0) * 0.6),
        outputTokens: Math.round((msgs._sum.tokens ?? 0) * 0.4),
        totalTokens: msgs._sum.tokens ?? 0,
        toolCalls: toolCallsForModel,
      };
    })
  );

  // Sort by total tokens descending
  models.sort((a, b) => b.totalTokens - a.totalTokens);

  // ── Build tool usage ──
  const totalToolCount = toolNameGroups.reduce((sum, g) => sum + g._count, 0);
  const tools: ToolUsage[] = toolNameGroups.map((g) => ({
    tool: g.toolName,
    count: g._count,
    percentage: totalToolCount > 0 ? Math.round((g._count / totalToolCount) * 1000) / 10 : 0,
  }));

  // ── Build activity data ──

  // By day: aggregate the raw groupBy results into per-day counts
  const dayMap = new Map<string, number>();
  for (const bucket of dayBuckets) {
    const dateStr = toDateString(new Date(bucket.createdAt));
    dayMap.set(dateStr, (dayMap.get(dateStr) ?? 0) + bucket._count);
  }

  // Fill in missing days
  const byDay: Array<{ day: string; count: number }> = [];
  const current = new Date(dateRangeStart);
  while (current <= dateRangeEnd) {
    const dateStr = toDateString(current);
    byDay.push({
      day: dateStr,
      count: dayMap.get(dateStr) ?? 0,
    });
    current.setDate(current.getDate() + 1);
  }

  // Find busiest day
  let busiestDay = '';
  let busiestDayCount = 0;
  for (const d of byDay) {
    if (d.count > busiestDayCount) {
      busiestDayCount = d.count;
      busiestDay = d.day;
    }
  }

  const activeDays = byDay.filter((d) => d.count > 0).length;

  // By hour: 24 buckets
  const byHourMap = new Map<number, number>();
  for (const h of hourBuckets) {
    byHourMap.set(h.hour, Number(h.count));
  }
  const byHour: Array<{ hour: number; count: number }> = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    count: byHourMap.get(i) ?? 0,
  }));

  let busiestHour = 0;
  let busiestHourCount = 0;
  for (const h of byHour) {
    if (h.count > busiestHourCount) {
      busiestHourCount = h.count;
      busiestHour = h.hour;
    }
  }

  const activity: ActivityData = {
    byDay,
    byHour,
    busiestDay,
    busiestHour,
    activeDays,
  };

  // ── Build top sessions ──
  const topSessions: TopSession[] = topSessionsData
    .sort((a, b) => b._count.messages - a._count.messages)
    .slice(0, 10)
    .map((s) => ({
      id: s.id,
      title: s.title,
      messageCount: s._count.messages,
      model: s.model,
      createdAt: s.createdAt,
    }));

  return {
    overview,
    models,
    tools,
    activity,
    topSessions,
    generatedAt: new Date(),
  };
}
