import { NextRequest, NextResponse } from "next/server";
import { MemoryManager } from "@/lib/hermes";

/**
 * GET /api/memory
 *
 * Read memory content from the embedded MemoryManager.
 * Returns MEMORY.md and USER.md content with parsed entries.
 *
 * Query params:
 *   ?action=read — alias for reading (same as no action)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    // If action=read or no action, return full memory data
    if (!action || action === "read") {
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
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}. Use GET for reading, POST for modifications.` },
      { status: 400 },
    );
  } catch (error) {
    console.error("[Memory API] GET Error:", error);
    return NextResponse.json(
      { error: "Failed to read memory" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/memory
 *
 * Action-based memory CRUD operations.
 *
 * Body:
 *   action: "add" | "replace" | "remove" | "read"
 *   target: "memory" | "user" (for add/replace/remove)
 *   content: string (for add)
 *   old_text: string (for replace/remove)
 *   new_content: string (for replace)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, target, content, old_text, new_content } = body;

    if (!action) {
      return NextResponse.json(
        { error: "Missing required field: action" },
        { status: 400 },
      );
    }

    const validActions = ["add", "replace", "remove", "read"];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action: ${action}. Must be one of: ${validActions.join(", ")}` },
        { status: 400 },
      );
    }

    const mm = new MemoryManager();

    switch (action) {
      case "read": {
        const data = await mm.readMemory();
        return NextResponse.json({
          memoryContent: data.memoryContent,
          userContent: data.userContent,
          memoryEntries: data.memoryEntries,
          userEntries: data.userEntries,
          memoryUsage: data.memoryUsage,
          userUsage: data.userUsage,
        });
      }

      case "add": {
        if (!target) {
          return NextResponse.json(
            { error: "Missing required field: target ('memory' or 'user')" },
            { status: 400 },
          );
        }
        if (!content) {
          return NextResponse.json(
            { error: "Missing required field: content" },
            { status: 400 },
          );
        }
        if (target !== "memory" && target !== "user") {
          return NextResponse.json(
            { error: "Invalid target: must be 'memory' or 'user'" },
            { status: 400 },
          );
        }

        const result = await mm.add(target, content);
        if (!result.success) {
          return NextResponse.json(
            { error: result.error },
            { status: 400 },
          );
        }

        return NextResponse.json({
          success: true,
          message: result.message,
          entryCount: result.entryCount,
          usage: result.usage,
        });
      }

      case "replace": {
        if (!target) {
          return NextResponse.json(
            { error: "Missing required field: target ('memory' or 'user')" },
            { status: 400 },
          );
        }
        if (!old_text) {
          return NextResponse.json(
            { error: "Missing required field: old_text" },
            { status: 400 },
          );
        }
        if (!new_content) {
          return NextResponse.json(
            { error: "Missing required field: new_content" },
            { status: 400 },
          );
        }
        if (target !== "memory" && target !== "user") {
          return NextResponse.json(
            { error: "Invalid target: must be 'memory' or 'user'" },
            { status: 400 },
          );
        }

        const result = await mm.replace(target, old_text, new_content);
        if (!result.success) {
          return NextResponse.json(
            { error: result.error },
            { status: 400 },
          );
        }

        return NextResponse.json({
          success: true,
          message: result.message,
          entryCount: result.entryCount,
          usage: result.usage,
        });
      }

      case "remove": {
        if (!target) {
          return NextResponse.json(
            { error: "Missing required field: target ('memory' or 'user')" },
            { status: 400 },
          );
        }
        if (!old_text) {
          return NextResponse.json(
            { error: "Missing required field: old_text" },
            { status: 400 },
          );
        }
        if (target !== "memory" && target !== "user") {
          return NextResponse.json(
            { error: "Invalid target: must be 'memory' or 'user'" },
            { status: 400 },
          );
        }

        const result = await mm.remove(target, old_text);
        if (!result.success) {
          return NextResponse.json(
            { error: result.error },
            { status: 400 },
          );
        }

        return NextResponse.json({
          success: true,
          message: result.message,
          entryCount: result.entryCount,
          usage: result.usage,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unhandled action: ${action}` },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("[Memory API] POST Error:", error);
    return NextResponse.json(
      { error: "Failed to process memory operation" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/memory
 *
 * Update memory content via the embedded MemoryManager.
 * Accepts { memoryContent?, userContent? } to replace the
 * respective memory files entirely.
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
