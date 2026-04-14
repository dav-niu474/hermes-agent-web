import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  AgentLoop,
  type AgentConfig,
  type AgentMessage,
  type SSEEvent,
  type ToolContext,
  type ToolRegistryInterface,
  type MemoryManagerInterface,
  getLLMConfig,
  resolveToolset,
  MemoryManager,
  ALL_TOOLS,
  getToolsetFilter,
  scanSkills,
  getSkillContent,
  manageSkill,
} from "@/lib/hermes";
import OpenAI from "openai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: string;
  content: string;
  image_url?: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  sessionId?: string;
  stream?: boolean;
  model?: string;
  provider?: string;
}

/** Generate a simple fallback title from the first user message. */
function generateFallbackTitle(content: string): string {
  const cleaned = content.replace(/\n/g, " ").trim();
  if (cleaned.length <= 50) return cleaned;
  return cleaned.slice(0, 47) + "...";
}

/**
 * Generate a better title using LLM in the background.
 * Fire-and-forget — failures are silently swallowed so chat is never blocked.
 * Updates the session title in DB when the LLM responds.
 */
async function generateTitleWithLLM(
  content: string,
  sessionId: string,
  llmConfig: { model: string; provider: string; baseUrl: string; apiKey: string; apiMode: string },
): Promise<void> {
  try {
    // Truncate input to keep prompt small and cost-effective
    const inputSnippet = content.replace(/\n/g, " ").trim().slice(0, 300);

    const client = new OpenAI({
      apiKey: llmConfig.apiKey,
      baseURL: llmConfig.baseUrl,
    });

    const completion = await client.chat.completions.create({
      model: llmConfig.model,
      max_tokens: 30,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "Generate a very short title (max 6 words) for a chat that starts with this message. Just output the title, nothing else. No quotes, no punctuation at the end.",
        },
        {
          role: "user",
          content: inputSnippet,
        },
      ],
    });

    let title = completion.choices?.[0]?.message?.content?.trim() ?? "";
    // Strip surrounding quotes if the LLM added them
    title = title.replace(/^["'「」『』]|[,."]+$/g, "").trim();
    // Enforce max ~50 characters
    if (title.length > 50) {
      title = title.slice(0, 47) + "...";
    }

    if (title) {
      await db.chatSession
        .update({ where: { id: sessionId }, data: { title } })
        .catch(() => {});
      console.log(`[SmartTitle] Updated session ${sessionId} title to: "${title}"`);
    }
  } catch (err) {
    // Silently swallow — never block the chat
    console.warn("[SmartTitle] LLM title generation error:", err);
  }
}

// ---------------------------------------------------------------------------
// Web-compatible tools
// ---------------------------------------------------------------------------

// Only these tools have real working handlers in the web context.
// The LLM will ONLY receive schemas for these tools — no ghost tools.
const WEB_COMPATIBLE_TOOLS = new Set([
  "web_search",
  "web_extract",
  "vision_analyze",
  "image_generate",
  "text_to_speech",
  "skills_list",
  "skill_view",
  "skill_manage",
  "memory",
  "todo",
  "session_search",
  "clarify",
  "read_file",
  "write_file",
  "search_files",
  "patch",
  "terminal",
  "execute_code",
  "cronjob",
  "browser_navigate",
]);

// ---------------------------------------------------------------------------
// ZAI SDK lazy singleton
// ---------------------------------------------------------------------------

let _zaiInstance: Awaited<ReturnType<typeof import("z-ai-web-dev-sdk").default.create>> | null = null;

async function getZAI() {
  if (!_zaiInstance) {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    _zaiInstance = await ZAI.create();
  }
  return _zaiInstance;
}

// ---------------------------------------------------------------------------
// ToolRegistryAdapter — wraps static tool definitions for AgentLoop
// ---------------------------------------------------------------------------

const MAX_ACTIVATED_SKILLS_CHARS = 3000;

class ToolRegistryAdapter implements ToolRegistryInterface {
  private toolNames: Set<string>;
  private toolSchemas: OpenAI.ChatCompletionTool[];
  /** Skills that have been activated via skill_view — name → full content */
  private activatedSkills: Map<string, string> = new Map();
  /** Session-scoped todo state — sessionId → task list */
  private todoStore = new Map<string, Array<{id: string; content: string; status: string}>>();

  constructor(toolNames: string[]) {
    // Only include tools that are actually executable in the web context
    this.toolNames = new Set(toolNames.filter((n) => WEB_COMPATIBLE_TOOLS.has(n)));
    this.toolSchemas = ALL_TOOLS
      .filter((t) => this.toolNames.has(t.name))
      .map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters as Record<string, unknown>,
        },
      }));
    console.log(`[ToolRegistry] ${this.toolSchemas.length} web-compatible tools: ${[...this.toolNames].join(", ")}`);
  }

  getToolDefinitions(): OpenAI.ChatCompletionTool[] {
    return this.toolSchemas;
  }

  getValidToolNames(): Set<string> {
    return this.toolNames;
  }

  async dispatch(
    name: string,
    args: Record<string, unknown>,
    _context: ToolContext,
  ): Promise<string> {
    // Non-web-compatible tools: return placeholder
    if (!WEB_COMPATIBLE_TOOLS.has(name)) {
      return JSON.stringify({
        note: `Tool '${name}' is registered but not executable in the web API context. The agent described the intended action above.`,
        tool: name,
      });
    }

    try {
      switch (name) {
        case "web_search":
          return await this.handleWebSearch(args);
        case "web_extract":
          return await this.handleWebExtract(args);
        case "vision_analyze":
          return await this.handleVisionAnalyze(args);
        case "image_generate":
          return await this.handleImageGenerate(args);
        case "text_to_speech":
          return await this.handleTextToSpeech(args);
        case "skills_list":
          return await this.handleSkillsList(args);
        case "skill_view":
          return await this.handleSkillView(args);
        case "skill_manage":
          return await this.handleSkillManage(args);
        case "memory":
          return await this.handleMemory(args);
        case "session_search":
          return await this.handleSessionSearch(args);
        case "todo":
          return this.handleTodo(args, _context);
        case "clarify":
          return this.handleClarify(args);
        case "read_file":
          return await this.handleReadFile(args);
        case "write_file":
          return await this.handleWriteFile(args);
        case "search_files":
          return await this.handleSearchFiles(args);
        case "patch":
          return await this.handlePatch(args);
        case "terminal":
          return await this.handleTerminal(args);
        case "execute_code":
          return await this.handleExecuteCode(args);
        case "cronjob":
          return await this.handleCronjob(args);
        case "browser_navigate":
          return await this.handleBrowserNavigate(args);
        default:
          return JSON.stringify({
            note: `Tool '${name}' is registered but not executable in the web API context.`,
            tool: name,
          });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ToolRegistry] Error dispatching '${name}':`, msg);
      return JSON.stringify({ error: `Tool '${name}' failed: ${msg}` });
    }
  }

  // ── Individual tool handlers ──────────────────────────────────────

  private async handleWebSearch(args: Record<string, unknown>): Promise<string> {
    const query = String(args.query ?? "");
    if (!query.trim()) {
      return JSON.stringify({ error: "Missing required parameter: query" });
    }

    const zai = await getZAI();
    const results = await zai.functions.invoke("web_search", {
      query,
      num: 5,
    });

    // Format results
    if (results && typeof results === "object" && "results" in results) {
      const items = (results as Record<string, unknown>).results;
      if (Array.isArray(items)) {
        const formatted = items
          .slice(0, 5)
          .map((item: Record<string, unknown>, i: number) =>
            `${i + 1}. **${item.title ?? "No title"}**\n   ${item.url ?? ""}\n   ${item.description ?? ""}`,
          )
          .join("\n\n");
        return formatted || JSON.stringify(results);
      }
    }
    return typeof results === "string"
      ? results
      : JSON.stringify(results);
  }

  private async handleWebExtract(args: Record<string, unknown>): Promise<string> {
    const urls = args.urls;
    if (!Array.isArray(urls) || urls.length === 0) {
      return JSON.stringify({ error: "Missing required parameter: urls (array)" });
    }

    const zai = await getZAI();
    const results: string[] = [];

    for (const url of urls.slice(0, 5)) {
      const urlStr = String(url);
      try {
        const result = await zai.functions.invoke("page_reader", { url: urlStr });
        const content =
          typeof result === "string"
            ? result
            : result && typeof result === "object" && "content" in result
              ? String((result as Record<string, unknown>).content)
              : JSON.stringify(result);
        results.push(`### ${urlStr}\n\n${content}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push(`### ${urlStr}\n\nError extracting content: ${msg}`);
      }
    }

    return results.join("\n\n---\n\n");
  }

  private async handleVisionAnalyze(args: Record<string, unknown>): Promise<string> {
    const imageUrl = String(args.image_url ?? "");
    const question = String(args.question ?? "Describe this image");

    if (!imageUrl.trim()) {
      return JSON.stringify({ error: "Missing required parameter: image_url" });
    }

    const zai = await getZAI();
    const response = await zai.chat.completions.createVision({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: question },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      thinking: { type: "disabled" },
    });

    const choices = (response as Record<string, unknown>)?.choices;
    const firstChoice = Array.isArray(choices) && choices.length > 0 ? choices[0] as Record<string, unknown> : null;
    const message = firstChoice?.message as Record<string, unknown> | undefined;
    const text = (message?.content as string) ?? "No analysis returned.";
    return text;
  }

  private async handleImageGenerate(args: Record<string, unknown>): Promise<string> {
    const prompt = String(args.prompt ?? "");
    if (!prompt.trim()) {
      return JSON.stringify({ error: "Missing required parameter: prompt" });
    }

    const aspectRatio = String(args.aspect_ratio ?? "landscape");
    let size = "1344x768";
    if (aspectRatio === "portrait") size = "768x1344";
    else if (aspectRatio === "square") size = "1024x1024";

    const zai = await getZAI();
    const response = await zai.images.generations.create({
      prompt,
      size,
    });

    const respData = (response as Record<string, unknown>).data;
    if (Array.isArray(respData) && respData.length > 0) {
      const firstItem = respData[0] as Record<string, unknown>;
      const imageBase64 = firstItem.base64 as string | undefined;
      if (imageBase64) {
        const dataUrl = `data:image/png;base64,${imageBase64}`;
        return JSON.stringify({
          imageGenerated: true,
          dataUrl,
          prompt,
        });
      }
      // If URL-based response
      const url = firstItem.url as string | undefined;
      if (url) {
        return JSON.stringify({
          imageGenerated: true,
          url,
          prompt,
        });
      }
    }

    return JSON.stringify({ error: "Image generation returned no data." });
  }

  private async handleTextToSpeech(args: Record<string, unknown>): Promise<string> {
    const text = String(args.text ?? "");
    if (!text.trim()) {
      return JSON.stringify({ error: "Missing required parameter: text" });
    }

    const truncatedText = text.substring(0, 1024);

    const zai = await getZAI();
    const response = await zai.audio.tts.create({
      input: truncatedText,
      voice: "tongtong",
      speed: 1.0,
      response_format: "mp3",
      stream: false,
    });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(new Uint8Array(arrayBuffer));
    const audioBase64 = buffer.toString("base64");

    return JSON.stringify({
      audioGenerated: true,
      audioDataUrl: `data:audio/mp3;base64,${audioBase64}`,
      textLength: text.length,
    });
  }

  private async handleSkillsList(args: Record<string, unknown>): Promise<string> {
    const category = args.category ? String(args.category) : undefined;
    const skills = await scanSkills({ category });
    return JSON.stringify(
      skills.map((s) => ({
        name: s.name,
        description: s.description,
        category: s.category,
      })),
    );
  }

  private async handleSkillView(args: Record<string, unknown>): Promise<string> {
    const skillName = String(args.name ?? "");
    if (!skillName.trim()) {
      return JSON.stringify({ error: "Missing required parameter: name" });
    }

    const filePath = args.file_path ? String(args.file_path) : undefined;
    const result = await getSkillContent(skillName);

    if (!result) {
      return JSON.stringify({
        error: `Skill '${skillName}' not found. Use skills_list to see available skills.`,
      });
    }

    // Activate this skill — inject full instructions into the system prompt
    // for subsequent LLM turns (deduplicated, with total size limit).
    if (!this.activatedSkills.has(skillName)) {
      const currentTotal = Array.from(this.activatedSkills.values()).reduce(
        (sum, c) => sum + c.length,
        0,
      );
      if (currentTotal + result.content.length <= MAX_ACTIVATED_SKILLS_CHARS) {
        this.activatedSkills.set(skillName, result.content);
        console.log(
          `[SkillActivation] Activated skill '${skillName}' (${result.content.length} chars, total now ${currentTotal + result.content.length}/${MAX_ACTIVATED_SKILLS_CHARS})`,
        );
      } else {
        console.log(
          `[SkillActivation] Skipped activation of '${skillName}' — would exceed ${MAX_ACTIVATED_SKILLS_CHARS} char limit (current: ${currentTotal})`,
        );
      }
    }

    if (filePath) {
      return JSON.stringify({
        name: skillName,
        content: result.content,
        linkedFiles: result.linkedFiles,
        requestedFile: filePath,
        note: "Specific file content access requires file system traversal.",
      });
    }

    return JSON.stringify({
      name: skillName,
      content: result.content,
      linkedFiles: result.linkedFiles.map((f) => ({
        name: f.name,
        size: f.size,
      })),
    });
  }

  /**
   * Return the formatted `<active-skills>` block for injection into the
   * memory/system prompt. Returns an empty string when no skills are active.
   */
  getActivatedSkillsPrompt(): string {
    if (this.activatedSkills.size === 0) return "";

    const sections: string[] = ["<active-skills>"];
    for (const [name, content] of this.activatedSkills) {
      sections.push(`## Skill: ${name}`);
      sections.push(content);
      sections.push("");
    }
    sections.push("</active-skills>");
    return sections.join("\n");
  }

  private async handleSkillManage(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action ?? "");
    const name = String(args.name ?? "");

    if (!action || !name) {
      return JSON.stringify({ error: "Missing required parameters: action, name" });
    }

    const validActions = ["create", "patch", "edit", "delete"];
    if (!validActions.includes(action)) {
      return JSON.stringify({ error: `Invalid action '${action}'. Must be one of: ${validActions.join(", ")}` });
    }

    try {
      const result = await manageSkill(action as "create" | "patch" | "edit" | "delete", {
        name,
        category: args.category ? String(args.category) : undefined,
        description: args.description ? String(args.description) : undefined,
        content: args.content ? String(args.content) : undefined,
        instructions: args.instructions ? String(args.instructions) : undefined,
      });

      if (!result.success) {
        return JSON.stringify({ error: result.error });
      }

      return JSON.stringify({
        success: true,
        action,
        name,
        path: result.path,
        message: `Skill '${name}' ${action}d successfully.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return JSON.stringify({ error: `Skill management failed: ${msg}` });
    }
  }

  private async handleMemory(args: Record<string, unknown>): Promise<string> {
    const mm = new MemoryManager();
    const action = String(args.action ?? "read");

    if (action === "read") {
      const data = await mm.readMemory();
      return JSON.stringify({
        memoryContent: data.memoryContent,
        userContent: data.userContent,
        memoryUsage: data.memoryUsage,
        userUsage: data.userUsage,
        memoryEntries: data.memoryEntries.length,
        userEntries: data.userEntries.length,
      });
    }

    if (action === "write" || action === "append") {
      const content = String(args.content ?? "");
      if (!content.trim()) {
        return JSON.stringify({ error: "Missing required parameter: content" });
      }
      const target = String(args.target ?? "memory");
      const result = await mm.add(
        target === "user" ? "user" : "memory",
        content,
      );
      return JSON.stringify(result);
    }

    if (action === "replace") {
      const oldText = String(args.old_text ?? "");
      const newContent = String(args.new_content ?? args.content ?? "");
      const target = String(args.target ?? "memory");
      const result = await mm.replace(
        target === "user" ? "user" : "memory",
        oldText,
        newContent,
      );
      return JSON.stringify(result);
    }

    if (action === "remove") {
      const oldText = String(args.old_text ?? "");
      const target = String(args.target ?? "memory");
      const result = await mm.remove(
        target === "user" ? "user" : "memory",
        oldText,
      );
      return JSON.stringify(result);
    }

    // Default: return current memory
    const data = await mm.readMemory();
    return JSON.stringify({
      memoryContent: data.memoryContent,
      userContent: data.userContent,
      memoryUsage: data.memoryUsage,
      userUsage: data.userUsage,
    });
  }

  private async handleSessionSearch(args: Record<string, unknown>): Promise<string> {
    const query = String(args.query ?? "");

    const messages = await db.chatMessage.findMany({
      where: {
        OR: [
          { content: { contains: query } },
        ],
      },
      take: 10,
      orderBy: { createdAt: "desc" },
    });

    if (messages.length === 0) {
      return JSON.stringify({
        results: [],
        message: query
          ? `No messages found matching '${query}'`
          : "No past messages found.",
      });
    }

    return JSON.stringify({
      results: messages.map((m) => ({
        role: m.role,
        content: m.content.substring(0, 200),
        sessionId: m.sessionId,
        createdAt: m.createdAt.toISOString(),
      })),
      count: messages.length,
    });
  }

  private handleTodo(args: Record<string, unknown>, context: ToolContext): string {
    const sessionId = context.sessionId || 'default';
    const todos = args.todos;
    const merge = args.merge === true;

    // If no todos array provided, return current list for this session
    if (!todos || !Array.isArray(todos)) {
      const current = this.todoStore.get(sessionId) || [];
      return JSON.stringify({
        todos: current,
        total: current.length,
        inProgress: current.filter((t) => t.status === 'in_progress').length,
        completed: current.filter((t) => t.status === 'completed').length,
        pending: current.filter((t) => t.status === 'pending').length,
        message: current.length > 0
          ? `Current task list: ${current.length} items.`
          : 'No active tasks. Provide todos array to create/update tasks.',
      });
    }

    // Validate incoming items
    const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
    const incoming = todos.map((item: any) => ({
      id: String(item.id || ''),
      content: String(item.content || ''),
      status: validStatuses.includes(item.status) ? item.status : 'pending',
    }));

    if (merge) {
      // Merge mode: update existing items by ID, add new ones, keep unmentioned ones
      const existing = this.todoStore.get(sessionId) || [];
      const existingMap = new Map(existing.map((t) => [t.id, t]));

      // Update or add incoming items
      for (const item of incoming) {
        existingMap.set(item.id, item);
      }

      const merged = Array.from(existingMap.values());
      this.todoStore.set(sessionId, merged);

      return JSON.stringify({
        todos: merged,
        total: merged.length,
        inProgress: merged.filter((t) => t.status === 'in_progress').length,
        completed: merged.filter((t) => t.status === 'completed').length,
        pending: merged.filter((t) => t.status === 'pending').length,
        message: `Task list merged: ${merged.length} items (${incoming.length} updated/added).`,
      });
    } else {
      // Replace mode: replace entire list
      this.todoStore.set(sessionId, incoming);

      return JSON.stringify({
        todos: incoming,
        total: incoming.length,
        inProgress: incoming.filter((t) => t.status === 'in_progress').length,
        completed: incoming.filter((t) => t.status === 'completed').length,
        pending: incoming.filter((t) => t.status === 'pending').length,
        message: `Task list updated: ${incoming.length} items (replaced).`,
      });
    }
  }

  private handleClarify(args: Record<string, unknown>): Promise<string> {
    const question = String(args.question ?? "Could you clarify what you mean?");
    return JSON.stringify({
      clarificationNeeded: true,
      question,
    });
  }

  private async handleReadFile(args: Record<string, unknown>): Promise<string> {
    const filePath = String(args.path ?? "");
    if (!filePath.trim()) {
      return JSON.stringify({ error: "Missing required parameter: path" });
    }
    const { readFile } = await import("fs/promises");
    const pathMod = await import("path");

    try {
      const workspaceRoot = process.env.HERMES_WORKSPACE || process.cwd();
      let resolved: string;
      if (pathMod.isAbsolute(filePath)) {
        resolved = filePath;
      } else {
        resolved = pathMod.resolve(workspaceRoot, filePath);
      }
      // Security: ensure path is within workspace
      const relative = pathMod.relative(workspaceRoot, resolved);
      if (relative.startsWith("..")) {
        return JSON.stringify({ error: `Access denied: path is outside workspace` });
      }

      const content = await readFile(resolved, "utf-8");
      const lines = content.split("\n");
      const offset = Math.max(1, Number(args.offset) || 1);
      const limit = Math.min(2000, Math.max(1, Number(args.limit) || 500));
      const startIdx = offset - 1;
      const endIdx = Math.min(lines.length, startIdx + limit);
      const selectedLines = lines.slice(startIdx, endIdx);

      const numbered = selectedLines
        .map((line, i) => {
          const lineNum = String(startIdx + i + 1).padStart(6, " ");
          return `${lineNum}\t${line}`;
        })
        .join("\n");

      return JSON.stringify({
        content: numbered,
        totalLines: lines.length,
        shownLines: selectedLines.length,
        startLine: offset,
        endLine: startIdx + selectedLines.length,
        path: resolved,
        truncated: endIdx < lines.length,
      });
    } catch (err: any) {
      return JSON.stringify({ error: `Failed to read file: ${err.message}` });
    }
  }

  private async handleWriteFile(args: Record<string, unknown>): Promise<string> {
    const filePath = String(args.path ?? "");
    const content = String(args.content ?? "");
    if (!filePath.trim()) {
      return JSON.stringify({ error: "Missing required parameter: path" });
    }
    const { writeFile, mkdir } = await import("fs/promises");
    const pathMod = await import("path");

    try {
      const workspaceRoot = process.env.HERMES_WORKSPACE || process.cwd();
      let resolved: string;
      if (pathMod.isAbsolute(filePath)) {
        resolved = filePath;
      } else {
        resolved = pathMod.resolve(workspaceRoot, filePath);
      }
      const relative = pathMod.relative(workspaceRoot, resolved);
      if (relative.startsWith("..")) {
        return JSON.stringify({ error: `Access denied: path is outside workspace` });
      }

      const dir = pathMod.dirname(resolved);
      await mkdir(dir, { recursive: true });
      await writeFile(resolved, content, "utf-8");

      return JSON.stringify({
        success: true,
        path: resolved,
        bytesWritten: Buffer.byteLength(content, "utf-8"),
        message: `File written successfully: ${resolved}`,
      });
    } catch (err: any) {
      return JSON.stringify({ error: `Failed to write file: ${err.message}` });
    }
  }

  private async handleSearchFiles(args: Record<string, unknown>): Promise<string> {
    const pattern = String(args.pattern ?? "");
    if (!pattern.trim()) {
      return JSON.stringify({ error: "Missing required parameter: pattern" });
    }
    const { exec: execCmd } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(execCmd);
    const pathMod = await import("path");

    const workspaceRoot = process.env.HERMES_WORKSPACE || process.cwd();
    const searchPath = args.path ? pathMod.resolve(workspaceRoot, String(args.path)) : workspaceRoot;
    const maxResults = Math.min(200, Number(args.max_results) || 50);
    const fileType = args.file_type ? String(args.file_type) : "";

    try {
      let cmd: string;
      if (fileType) {
        cmd = `rg --no-heading --line-number -n --max-count ${maxResults} -t ${fileType} ${JSON.stringify(pattern)} ${JSON.stringify(searchPath)} 2>/dev/null`;
      } else {
        cmd = `rg --no-heading --line-number -n --max-count ${maxResults} ${JSON.stringify(pattern)} ${JSON.stringify(searchPath)} 2>/dev/null`;
      }

      const { stdout } = await execAsync(cmd, { timeout: 15000, maxBuffer: 1024 * 1024 });
      const matches = stdout.split("\n").filter(Boolean).slice(0, maxResults);
      const results = matches.map((line) => {
        const colonIdx = line.indexOf(":");
        if (colonIdx === -1) return { file: "", line: 0, content: line };
        const file = line.slice(0, colonIdx);
        const rest = line.slice(colonIdx + 1);
        const secondColon = rest.indexOf(":");
        if (secondColon === -1) return { file, line: 0, content: rest };
        return { file, line: parseInt(rest.slice(0, secondColon), 10), content: rest.slice(secondColon + 1) };
      });
      return JSON.stringify({ matches: results, totalMatches: results.length, pattern, truncated: results.length >= maxResults });
    } catch (err: any) {
      if (err.code === 1 && !err.stdout) {
        return JSON.stringify({ matches: [], totalMatches: 0, pattern, message: "No matches found." });
      }
      return JSON.stringify({ error: `Search failed: ${err.message}` });
    }
  }

  private async handlePatch(args: Record<string, unknown>): Promise<string> {
    const filePath = String(args.path ?? "");
    const oldString = String(args.old_string ?? "");
    const newString = String(args.new_string ?? "");
    if (!filePath.trim() || !oldString) {
      return JSON.stringify({ error: "Missing required parameters: path, old_string" });
    }
    const { readFile, writeFile } = await import("fs/promises");
    const pathMod = await import("path");

    try {
      const workspaceRoot = process.env.HERMES_WORKSPACE || process.cwd();
      let resolved: string;
      if (pathMod.isAbsolute(filePath)) {
        resolved = filePath;
      } else {
        resolved = pathMod.resolve(workspaceRoot, filePath);
      }
      const relative = pathMod.relative(workspaceRoot, resolved);
      if (relative.startsWith("..")) {
        return JSON.stringify({ error: `Access denied: path is outside workspace` });
      }

      let content = await readFile(resolved, "utf-8");
      if (!content.includes(oldString)) {
        return JSON.stringify({ error: `Pattern not found in file. The old_string does not match any content.` });
      }
      const occurrences = content.split(oldString).length - 1;
      content = content.replaceAll(oldString, newString);
      await writeFile(resolved, content, "utf-8");
      return JSON.stringify({
        success: true,
        path: resolved,
        replacements: occurrences,
        message: `Patched ${occurrences} occurrence(s) in ${resolved}`,
      });
    } catch (err: any) {
      return JSON.stringify({ error: `Failed to patch file: ${err.message}` });
    }
  }

  private async handleTerminal(args: Record<string, unknown>): Promise<string> {
    const command = String(args.command ?? "");
    if (!command.trim()) {
      return JSON.stringify({ error: "Missing required parameter: command" });
    }
    const { exec: execCmd } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(execCmd);
    const pathMod = await import("path");

    const timeout = Math.min(300, Math.max(5, Number(args.timeout) || 60)) * 1000;
    const workdir = process.env.HERMES_WORKSPACE || process.cwd();

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        maxBuffer: 1024 * 1024,
        cwd: workdir,
      });
      return JSON.stringify({
        stdout: stdout.trimEnd(),
        stderr: stderr.trimEnd() || undefined,
        exitCode: 0,
        workdir,
      });
    } catch (err: any) {
      return JSON.stringify({
        stdout: (err.stdout || "").trimEnd(),
        stderr: (err.stderr || err.message || "").trimEnd(),
        exitCode: err.code || 1,
        timedOut: err.killed === true,
      });
    }
  }

  private async handleExecuteCode(args: Record<string, unknown>): Promise<string> {
    const code = String(args.code ?? "");
    const language = String(args.language ?? "python");
    if (!code.trim()) {
      return JSON.stringify({ error: "Missing required parameter: code" });
    }
    const { exec: execCmd } = await import("child_process");
    const { promisify } = await import("util");
    const { writeFile, unlink } = await import("fs/promises");
    const pathMod = await import("path");
    const execAsync = promisify(execCmd);

    try {
      let tmpFile: string;
      let cmd: string;
      if (language === "javascript" || language === "js" || language === "node") {
        tmpFile = pathMod.join("/tmp", `hermes-code-${Date.now()}.js`);
        await writeFile(tmpFile, code, "utf-8");
        cmd = `node "${tmpFile}"`;
      } else {
        tmpFile = pathMod.join("/tmp", `hermes-code-${Date.now()}.py`);
        await writeFile(tmpFile, code, "utf-8");
        cmd = `python3 "${tmpFile}"`;
      }
      const { stdout, stderr } = await execAsync(cmd, { timeout: 30000, maxBuffer: 1024 * 1024 });
      await unlink(tmpFile).catch(() => {});
      return JSON.stringify({ output: stdout, errors: stderr, language });
    } catch (err: any) {
      return JSON.stringify({
        output: err.stdout || "",
        errors: err.stderr || err.message,
        exitCode: err.code,
        language,
      });
    }
  }

  private async handleCronjob(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action ?? "list");
    try {
      const cronModule = await import("@/lib/cron-client");
      switch (action) {
        // ── List ──────────────────────────────────────────────
        case "list": {
          const jobs = await cronModule.listCronJobs();
          if (jobs.length === 0) {
            return JSON.stringify({ jobs: [], total: 0, message: "No cron jobs found." });
          }
          return JSON.stringify({
            jobs,
            total: jobs.length,
            message: `Found ${jobs.length} cron job(s).`,
          });
        }

        // ── Create ────────────────────────────────────────────
        case "create": {
          // Accept both "prompt" (schema name) and "task" (legacy name)
          const task = String(args.prompt ?? args.task ?? "");
          const name = String(args.name ?? "");
          const schedule = String(args.schedule ?? "");
          const repeat = args.repeat !== undefined ? Number(args.repeat) : undefined;

          if (!name.trim()) {
            return JSON.stringify({ error: "Missing required parameter: name" });
          }
          if (!schedule.trim()) {
            return JSON.stringify({ error: "Missing required parameter: schedule (e.g. '30m', 'every 2h', '0 9 * * *')" });
          }
          if (!task.trim()) {
            return JSON.stringify({ error: "Missing required parameter: prompt (the task the job should execute)" });
          }

          const job = await cronModule.createCronJob({
            name,
            schedule,
            task,
            repeat: repeat !== undefined && !isNaN(repeat) ? repeat : undefined,
          });
          return JSON.stringify({
            success: true,
            job,
            message: `Cron job '${name}' created. Schedule: ${job.schedule}. Next run: ${job.nextRunAt || 'pending'}.`,
          });
        }

        // ── Update ────────────────────────────────────────────
        case "update": {
          const jobId = String(args.job_id ?? "");
          if (!jobId) {
            return JSON.stringify({ error: "Missing required parameter: job_id" });
          }

          const updates: Record<string, unknown> = { id: jobId };
          if (args.name !== undefined) updates.name = String(args.name);
          if (args.schedule !== undefined) updates.schedule = String(args.schedule);
          if (args.prompt !== undefined || args.task !== undefined) {
            updates.task = String(args.prompt ?? args.task);
          }
          if (args.repeat !== undefined) updates.repeat = Number(args.repeat);

          // At least one field to update
          if (Object.keys(updates).length <= 1) {
            return JSON.stringify({ error: "No fields to update. Provide name, schedule, task/prompt, or repeat." });
          }

          const job = await cronModule.updateCronJob(updates as any);
          return JSON.stringify({
            success: true,
            job,
            message: `Cron job '${job.name}' updated.`,
          });
        }

        // ── Pause ─────────────────────────────────────────────
        case "pause": {
          const jobId = String(args.job_id ?? "");
          if (!jobId) return JSON.stringify({ error: "Missing required parameter: job_id" });
          const job = await cronModule.pauseCronJob(jobId);
          return JSON.stringify({ success: true, job, message: `Cron job '${job.name}' paused.` });
        }

        // ── Resume ────────────────────────────────────────────
        case "resume": {
          const jobId = String(args.job_id ?? "");
          if (!jobId) return JSON.stringify({ error: "Missing required parameter: job_id" });
          const job = await cronModule.resumeCronJob(jobId);
          return JSON.stringify({ success: true, job, message: `Cron job '${job.name}' resumed. Next run: ${job.nextRunAt || 'pending'}.` });
        }

        // ── Remove (alias for delete) ─────────────────────────
        case "remove":
        case "delete": {
          const jobId = String(args.job_id ?? "");
          if (!jobId) return JSON.stringify({ error: "Missing required parameter: job_id" });
          await cronModule.deleteCronJob(jobId);
          return JSON.stringify({ success: true, message: `Cron job ${jobId} deleted.` });
        }

        // ── Run (trigger immediately) ─────────────────────────
        case "run": {
          const jobId = String(args.job_id ?? "");
          if (!jobId) return JSON.stringify({ error: "Missing required parameter: job_id" });
          const job = await cronModule.triggerCronJob(jobId);
          return JSON.stringify({ success: true, job, message: `Cron job '${job.name}' triggered to run immediately.` });
        }

        default:
          return JSON.stringify({
            error: `Unknown cron action: '${action}'. Supported: create, list, update, pause, resume, remove, run.`,
          });
      }
    } catch (err: any) {
      if (err.code === "MODULE_NOT_FOUND") {
        return JSON.stringify({ note: "Cron management not available in this environment.", action });
      }
      return JSON.stringify({ error: `Cron ${action} failed: ${err.message}` });
    }
  }

  private async handleBrowserNavigate(args: Record<string, unknown>): Promise<string> {
    const url = String(args.url ?? "");
    if (!url.trim()) {
      return JSON.stringify({ error: "Missing required parameter: url" });
    }
    // In web mode, use web_extract as a lightweight alternative
    return await this.handleWebExtract({ urls: [url] });
  }
}

// ---------------------------------------------------------------------------
// MemoryManagerAdapter — wraps MemoryManager for AgentLoop
// ---------------------------------------------------------------------------

class MemoryManagerAdapter implements MemoryManagerInterface {
  private mm: MemoryManager;
  private toolRegistry: ToolRegistryAdapter;

  constructor(mm: MemoryManager, toolRegistry: ToolRegistryAdapter) {
    this.mm = mm;
    this.toolRegistry = toolRegistry;
  }

  async getMemoryContext(query?: string): Promise<string> {
    const parts: string[] = [];

    // Standard memory context
    try {
      const memoryCtx = await this.mm.buildMemoryContextBlock(query);
      if (memoryCtx) parts.push(memoryCtx);
    } catch {
      // Memory failure is non-fatal
    }

    // Activated skills — dynamically injected after skill_view calls
    const activeSkillsPrompt = this.toolRegistry.getActivatedSkillsPrompt();
    if (activeSkillsPrompt) {
      parts.push(activeSkillsPrompt);
    }

    return parts.join("\n\n");
  }
}

// ---------------------------------------------------------------------------
// POST /api/chat — run AgentLoop with optional SSE streaming
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();

    if (!body.messages?.length) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    const shouldStream = body.stream !== false;
    const lastMessage = body.messages[body.messages.length - 1];
    const startTime = Date.now();

    // ── If the last user message has an image, run vision analysis first ──
    if (
      lastMessage.role === 'user' &&
      lastMessage.image_url &&
      WEB_COMPATIBLE_TOOLS.has('vision_analyze')
    ) {
      try {
        const zai = await getZAI();
        const visionResponse = await zai.chat.completions.createVision({
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Describe this image in detail. If the user provided a question alongside the image, answer it.' },
                { type: 'image_url', image_url: { url: lastMessage.image_url } },
              ],
            },
          ],
          thinking: { type: 'disabled' },
        });

        const choices = (visionResponse as Record<string, unknown>)?.choices;
        const firstChoice = Array.isArray(choices) && choices.length > 0 ? choices[0] as Record<string, unknown> : null;
        const visionMessage = firstChoice?.message as Record<string, unknown> | undefined;
        const visionText = (visionMessage?.content as string) ?? '';

        if (visionText) {
          // Prepend the image analysis to the user message content
          lastMessage.content = `[User uploaded an image. Vision analysis: ${visionText}]\n\n${lastMessage.content || ''}`;
        }
      } catch (visionErr) {
        console.error('[Chat API] Vision analysis failed:', visionErr);
        lastMessage.content = `[User uploaded an image but vision analysis failed. Image URL: ${lastMessage.image_url}]\n\n${lastMessage.content || ''}`;
      }
    }

    // ── Resolve local session ──
    let localSessionId = body.sessionId;

    if (localSessionId) {
      const session = await db.chatSession
        .findUnique({ where: { id: localSessionId } })
        .catch(() => null);
      if (!session) localSessionId = undefined;
    }

    // Track whether this is a brand-new session (for smart title generation)
    const isNewSession = !localSessionId;

    // ── Create local session if needed ──
    if (!localSessionId) {
      const title = generateFallbackTitle(lastMessage.content);
      const newSession = await db.chatSession
        .create({
          data: {
            title,
            model: body.model || "hermes-agent",
          },
        })
        .catch(() => null);
      localSessionId = newSession?.id;
    } else {
      if (body.model) {
        await db.chatSession
          .update({
            where: { id: localSessionId },
            data: { model: body.model },
          })
          .catch(() => {});
      }
    }

    // ── Resolve LLM config ──
    // Pass both model and provider so the backend routes to the correct API.
    // The getLLMConfig function auto-detects provider from model if not given.
    const requestModel = body.model?.trim() || undefined;
    const requestProvider = body.provider?.trim() || undefined;
    const llmConfig = getLLMConfig(requestModel, requestProvider);
    console.log(
      `[Chat API] model=${llmConfig.model} provider=${llmConfig.provider}` +
        ` baseUrl=${llmConfig.baseUrl} hasKey=${!!llmConfig.apiKey}`,
    );

    // ── Generate smart title for new sessions (fire-and-forget) ──
    if (isNewSession && localSessionId) {
      generateTitleWithLLM(lastMessage.content, localSessionId, llmConfig).catch((err) => {
        console.warn("[SmartTitle] Background title generation failed:", err);
      });
    }

    // ── Resolve toolset tools ──
    const toolsetFilter = getToolsetFilter();
    const toolNames: string[] = [];
    for (const ts of toolsetFilter.effective) {
      const resolved = resolveToolset(ts);
      for (const name of resolved) {
        if (!toolNames.includes(name)) toolNames.push(name);
      }
    }

    // ── Build components ──
    const toolRegistry = new ToolRegistryAdapter(toolNames);
    const memoryManager = new MemoryManager();
    const memoryAdapter = new MemoryManagerAdapter(memoryManager, toolRegistry);

    // ── Load skills system prompt ──
    let skillsPrompt = "";
    try {
      skillsPrompt = await buildSkillsSystemPrompt(toolRegistry.getValidToolNames());
    } catch (err) {
      console.warn("[Chat API] Failed to build skills prompt:", err);
    }

    // ── Agent config ──
    const agentConfig: AgentConfig = {
      model: llmConfig.model,
      provider: llmConfig.provider,
      apiKey: llmConfig.apiKey,
      baseUrl: llmConfig.baseUrl,
      platform: "web",
      maxIterations: 90,
      sessionId: localSessionId,
      skillsPrompt,
    };

    const agentLoop = new AgentLoop(agentConfig, toolRegistry, memoryAdapter);

    // ── Load session history for context continuity ──
    let sessionHistory: { role: string; content: string }[] = [];
    if (localSessionId) {
      try {
        const pastMessages = await db.chatMessage
          .findMany({
            where: { sessionId: localSessionId },
            orderBy: { createdAt: "asc" },
            take: 50, // last 50 messages for context
            select: { role: true, content: true },
          })
          .catch(() => []);
        sessionHistory = pastMessages.map((m) => ({
          role: m.role,
          content: m.content || "",
        }));
      } catch {
        // Ignore DB errors
      }
    }

    // ── Convert messages — prepend session history for full context ──
    const agentMessages: AgentMessage[] = [
      ...sessionHistory.map((m) => ({
        role: m.role as AgentMessage["role"],
        content: m.content,
      })),
      ...body.messages.map((m) => ({
        role: m.role as AgentMessage["role"],
        content: m.content,
      })),
    ];

    // Deduplicate: remove the last user message if it already exists in history
    // (the frontend sends it again as the current message)
    const lastUserContent = body.messages.filter((m) => m.role === "user").pop()?.content;
    if (lastUserContent && sessionHistory.length > 0) {
      const lastHistIdx = agentMessages.length - body.messages.length - 1;
      if (lastHistIdx >= 0 && agentMessages[lastHistIdx]?.content === lastUserContent) {
        agentMessages.splice(lastHistIdx, 1);
      }
    }

    // ── Save user message locally ──
    if (localSessionId) {
      await db.chatMessage
        .create({
          data: {
            sessionId: localSessionId,
            role: lastMessage.role,
            content: lastMessage.content,
          },
        })
        .catch(() => {});

      await db.chatSession
        .update({
          where: { id: localSessionId },
          data: { updatedAt: new Date() },
        })
        .catch(() => {});
    }

    // ── Handle X-Hermes-Session-Id ──
    const hermesSessionId = request.headers.get("X-Hermes-Session-Id");

    // ── Generate a completion ID ──
    const completionId = `chatcmpl-${Date.now().toString(36)}`;
    const created = Math.floor(Date.now() / 1000);

    // ── Run agent loop ──
    if (shouldStream) {
      // ── Streaming response ──
      const stream = new TransformStream();
      const writer = stream.writable.getWriter();
      const encoder = new TextEncoder();

      // Helper to write an SSE data line
      const writeSSE = (data: string) => writer.write(encoder.encode(`data: ${data}\n\n`));

      (async () => {
        let fullContent = "";
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let toolEventCounter = 0;

        try {
          const result = await agentLoop.run(agentMessages, {
            stream: true,
            sessionId: localSessionId,
            onEvent: (event: SSEEvent) => {
              switch (event.type) {
                case "delta": {
                  const text = typeof event.data === "string" ? event.data : String(event.data);
                  fullContent += text;
                  writeSSE(
                    JSON.stringify({
                      id: completionId,
                      object: "chat.completion.chunk",
                      created,
                      model: llmConfig.model,
                      "x-event-type": "content",
                      choices: [
                        { index: 0, delta: { content: text }, finish_reason: null },
                      ],
                    }),
                  );
                  break;
                }
                case "reasoning": {
                  const reasoningText = typeof event.data === "string" ? event.data : String(event.data);
                  writeSSE(
                    JSON.stringify({
                      id: completionId,
                      object: "chat.completion.chunk",
                      created,
                      model: llmConfig.model,
                      "x-event-type": "reasoning",
                      choices: [
                        {
                          index: 0,
                          delta: { content: reasoningText },
                          finish_reason: null,
                        },
                      ],
                    }),
                  );
                  break;
                }
                case "tool_start": {
                  const toolData = event.data;
                  const toolName = typeof toolData === "object" && toolData && "name" in toolData
                    ? String((toolData as Record<string, unknown>).name)
                    : String(toolData);
                  const toolArgs = typeof toolData === "object" && toolData && "arguments" in toolData
                    ? String((toolData as Record<string, unknown>).arguments || "")
                    : "";
                  const toolId = typeof toolData === "object" && toolData && "id" in toolData
                    ? String((toolData as Record<string, unknown>).id)
                    : `tool-${Date.now()}-${toolEventCounter++}`;
                  writeSSE(
                    JSON.stringify({
                      id: completionId,
                      object: "chat.completion.chunk",
                      created,
                      model: llmConfig.model,
                      "x-event-type": "tool_start",
                      "x-tool-id": toolId,
                      "x-tool-name": toolName,
                      "x-tool-args": toolArgs,
                      choices: [
                        { index: 0, delta: {}, finish_reason: null },
                      ],
                    }),
                  );
                  break;
                }
                case "tool_end": {
                  const toolResult = typeof event.data === "string" ? event.data
                    : typeof event.data === "object" && event.data ? JSON.stringify(event.data)
                    : "";
                  const toolId2 = typeof event.data === "object" && event.data && "id" in event.data
                    ? String((event.data as Record<string, unknown>).id)
                    : `tool-end-${Date.now()}-${toolEventCounter++}`;
                  writeSSE(
                    JSON.stringify({
                      id: completionId,
                      object: "chat.completion.chunk",
                      created,
                      model: llmConfig.model,
                      "x-event-type": "tool_end",
                      "x-tool-id": toolId2,
                      "x-tool-result": toolResult,
                      choices: [
                        { index: 0, delta: {}, finish_reason: null },
                      ],
                    }),
                  );
                  break;
                }
                case "error": {
                  const errorMsg = typeof event.data === "string" ? event.data : JSON.stringify(event.data);
                  console.error("[Chat API] Agent event error:", errorMsg);
                  writeSSE(
                    JSON.stringify({
                      id: completionId,
                      object: "chat.completion.chunk",
                      created,
                      model: llmConfig.model,
                      "x-event-type": "error",
                      "x-error": errorMsg,
                      choices: [
                        { index: 0, delta: {}, finish_reason: null },
                      ],
                    }),
                  );
                  break;
                }
                case "done": {
                  // Will be handled after run() resolves
                  break;
                }
              }
            },
          });

          totalInputTokens = result.usage.inputTokens;
          totalOutputTokens = result.usage.outputTokens;

          // Send final stop chunk
          writeSSE(
            JSON.stringify({
              id: completionId,
              object: "chat.completion.chunk",
              created,
              model: llmConfig.model,
              choices: [
                { index: 0, delta: {}, finish_reason: "stop" },
              ],
              usage: {
                prompt_tokens: totalInputTokens,
                completion_tokens: totalOutputTokens,
                total_tokens: totalInputTokens + totalOutputTokens,
              },
            }),
          );
          writeSSE("[DONE]");
        } catch (error) {
          console.error("[Chat API] Agent loop error:", error);
          const errorMsg = error instanceof Error ? error.message : String(error);
          writeSSE(
            JSON.stringify({
              id: completionId,
              object: "chat.completion.chunk",
              created,
              model: llmConfig.model,
              choices: [
                {
                  index: 0,
                  delta: { content: `\n\n⚠️ Error: ${errorMsg}` },
                  finish_reason: "stop",
                },
              ],
            }),
          );
          writeSSE("[DONE]");
        } finally {
          // Save assistant message to local DB
          if (localSessionId && fullContent) {
            const duration = Date.now() - startTime;
            await db.chatMessage
              .create({
                data: {
                  sessionId: localSessionId,
                  role: "assistant",
                  content: fullContent,
                  duration,
                  tokens: totalInputTokens + totalOutputTokens || undefined,
                },
              })
              .catch(() => {});

            await db.chatSession
              .update({
                where: { id: localSessionId },
                data: { updatedAt: new Date() },
              })
              .catch(() => {});
          }
          await writer.close();
        }
      })();

      // Build response headers
      const responseHeaders: Record<string, string> = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Session-Id": localSessionId || "",
        "X-Model": llmConfig.model,
      };

      if (hermesSessionId) {
        responseHeaders["X-Hermes-Session-Id"] = hermesSessionId;
      }

      return new NextResponse(stream.readable, {
        headers: responseHeaders,
      });
    }

    // ── Non-streaming response ──
    const result = await agentLoop.run(agentMessages, {
      stream: false,
      sessionId: localSessionId,
    });

    const duration = Date.now() - startTime;
    const content = result.finalResponse || "";
    const totalTokens = result.usage.totalTokens;

    // Save assistant message to local DB
    if (localSessionId && content) {
      await db.chatMessage
        .create({
          data: {
            sessionId: localSessionId,
            role: "assistant",
            content,
            duration,
            tokens: totalTokens || undefined,
          },
        })
        .catch(() => {});
    }

    // Return OpenAI-compatible response
    return NextResponse.json({
      id: completionId,
      object: "chat.completion",
      created,
      model: llmConfig.model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content,
          },
          finish_reason: result.finishedNaturally ? "stop" : "length",
        },
      ],
      usage: {
        prompt_tokens: result.usage.inputTokens,
        completion_tokens: result.usage.outputTokens,
        total_tokens: result.usage.totalTokens,
      },
      sessionId: localSessionId,
      duration,
    });
  } catch (error) {
    console.error("[Chat API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
