import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/cronjobs/logs?jobId=xxx&limit=20
// Get execution logs for a specific job (or all logs if no jobId).
// Ordered by createdAt desc. Includes job name via include.
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.min(Math.max(Number(limitParam), 1), 200) : 20;

    const logs = await db.cronJobLog.findMany({
      where: jobId ? { jobId } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        jobId_CronJob: {
          select: {
            name: true,
          },
        },
      },
    });

    // Remap the relation field to a cleaner "job" key for the response
    const mapped = logs.map((log) => ({
      id: log.id,
      jobId: log.jobId,
      status: log.status,
      output: log.output,
      error: log.error,
      duration: log.duration,
      createdAt: log.createdAt,
      jobName: log.jobId_CronJob?.name ?? null,
    }));

    return NextResponse.json(mapped);
  } catch (error) {
    console.error("[CronJobs API] GET /logs error:", error);
    return NextResponse.json([]);
  }
}
