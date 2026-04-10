import { NextRequest, NextResponse } from "next/server";
import { MemoryManager } from "@/lib/hermes";

/**
 * GET /api/memory
 *
 * Read memory content from the embedded MemoryManager.
 * Returns MEMORY.md and USER.md content with parsed entries.
 */
export async function GET() {
  try {
    const mm = new MemoryManager();
    const data = await mm.readMemory();

    return NextResponse.json({
      memoryContent: data.memoryContent,
      userContent: data.userContent,
      memoryEntries: data.memoryEntries,
      userEntries: data.userEntries,
      memoryUsage: data.memoryUsage,
      userUsage: data.userUsage,
      memoryPath: data.memoryPath,
      userPath: data.userPath,
    });
  } catch (error) {
    console.error("[Memory API] GET Error:", error);
    return NextResponse.json(
      { error: "Failed to read memory" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/memory
 *
 * Update memory content via the embedded MemoryManager.
 * Accepts { memoryContent?, userContent? } to replace the
 * respective memory files.
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    const mm = new MemoryManager();
    const result = await mm.updateMemory({
      memoryContent: body.memoryContent,
      userContent: body.userContent,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to update memory" },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Memory API] PUT Error:", error);
    return NextResponse.json(
      { error: "Failed to update memory" },
      { status: 500 },
    );
  }
}
