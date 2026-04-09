import { NextResponse } from "next/server";
import { isDatabaseAvailable } from "@/lib/db";

const DEFAULT_HERMES_URL = "http://localhost:8642";
const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_NVIDIA_KEY = "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";

/**
 * GET /api/hermes
 * Check Hermes Agent health, NVIDIA API health, and configuration.
 */
export async function GET() {
  try {
    const configs = await fetchAllConfigs();
    const hermesUrl = configs.hermes_url || DEFAULT_HERMES_URL;
    const nvidiaKey = configs.nvidia_api_key || DEFAULT_NVIDIA_KEY;

    // Run health checks in parallel
    const [hermesResult, nvidiaResult] = await Promise.allSettled([
      fetch(`${hermesUrl}/health`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json()),
      fetch(`${NVIDIA_API_URL}/models`, {
        headers: { Authorization: `Bearer ${nvidiaKey}` },
        signal: AbortSignal.timeout(8000),
      }).then((r) => r.json()),
    ]);

    // Hermes status
    let hermesStatus: "connected" | "disconnected" | "error" = "disconnected";
    let hermesHealth: unknown = null;

    if (hermesResult.status === "fulfilled") {
      hermesStatus = "connected";
      hermesHealth = hermesResult.value;
    } else if (hermesResult.status === "rejected") {
      const reason = hermesResult.reason;
      hermesStatus = reason?.name === "TimeoutError" || reason?.name === "AbortError" ? "disconnected" : "error";
    }

    // NVIDIA status
    let nvidiaStatus: "connected" | "disconnected" | "error" = "disconnected";
    let nvidiaModels: string[] = [];

    if (nvidiaResult.status === "fulfilled" && nvidiaResult.value?.data) {
      nvidiaStatus = "connected";
      // Extract model IDs
      nvidiaModels = nvidiaResult.value.data.map((m: { id: string }) => m.id);
    } else if (nvidiaResult.status === "rejected") {
      nvidiaStatus = "error";
    }

    // Determine overall status
    const overallStatus = nvidiaStatus === "connected" ? "connected" : hermesStatus;

    return NextResponse.json({
      status: overallStatus,
      hermes: { status: hermesStatus, url: hermesUrl, health: hermesHealth },
      nvidia: { status: nvidiaStatus, models: nvidiaModels },
      config: configs,
    });
  } catch (error) {
    console.error("[Hermes API] GET error:", error);
    return NextResponse.json({
      status: "error",
      hermes: { status: "error", url: DEFAULT_HERMES_URL, health: null },
      nvidia: { status: "disconnected", models: [] },
      config: {},
      error: "Failed to check status",
    });
  }
}

/** Fetch all AgentConfig entries as a key-value map */
async function fetchAllConfigs(): Promise<Record<string, string>> {
  if (!isDatabaseAvailable()) {
    return {};
  }
  try {
    const { db } = await import("@/lib/db");
    const configs = await db.agentConfig.findMany();
    const map: Record<string, string> = {};
    for (const c of configs) {
      map[c.key] = c.value;
    }
    return map;
  } catch {
    return {};
  }
}
