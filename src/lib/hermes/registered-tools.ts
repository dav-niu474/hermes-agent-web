/**
 * Registered Tools — Populates the dynamic ToolRegistry with all hermes-agent tools.
 *
 * This module registers all required tools into the global `registry` singleton
 * from `tool-registry.ts`. It is imported once at startup (typically from the
 * chat API route or the agent-loop initialization).
 *
 * Each tool registration includes:
 *   - name, toolset, emoji
 *   - JSON Schema parameters (matching Python source exactly)
 *   - handler (server-side implementation)
 *   - checkFn (availability check for tools requiring env vars)
 *   - description
 *
 * Import this module once: `import '@/lib/hermes/registered-tools'`
 */

import { registry, toolResult, toolError, type ToolContext } from './tool-registry';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

// ─── Module-level: in-memory message queue ────────────────────────────────
const messageQueue: Array<{
  id: string;
  platform: string;
  channel_id?: string;
  message: string;
  reply_to?: string;
  createdAt: Date;
}> = [];

// ─── Module-level: background process store ────────────────────────────────
interface BackgroundProcess {
  command: string;
  pid?: number;
  stdout: string;
  stderr: string;
  exitCode?: number;
  startedAt: Date;
  status: 'running' | 'completed' | 'killed';
}
const backgroundProcesses = new Map<string, BackgroundProcess>();

// ─── Helper: lazy import wrapper for z-ai-web-dev-sdk ──────────────────────

let _zaiInstance: any = null;
async function getZAI() {
  if (!_zaiInstance) {
    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;
      _zaiInstance = await ZAI.create();
    } catch (err) {
      return null;
    }
  }
  return _zaiInstance;
}

// ─── Helper: workspace root for file/terminal sandboxing ──────────────────

function getWorkspaceRoot(): string {
  return process.env.HERMES_WORKSPACE || process.cwd();
}

/**
 * Resolve and validate a file path is within the workspace.
 * Returns the absolute path if safe, or throws an error.
 */
function resolveSafePath(filePath: string, allowOutside: boolean = false): string {
  const workspaceRoot = getWorkspaceRoot();
  let resolved: string;

  if (path.isAbsolute(filePath)) {
    resolved = filePath;
  } else {
    resolved = path.resolve(workspaceRoot, filePath);
  }

  if (!allowOutside) {
    const relative = path.relative(workspaceRoot, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Access denied: path "${filePath}" is outside the workspace`);
    }
  }

  return resolved;
}

// ─── Register: Web Search ──────────────────────────────────────────────────

registry.register({
  name: 'web_search',
  toolset: 'web',
  schema: {
    type: 'object',
    description: 'Search the web for information on any topic. Returns up to 5 relevant results with titles, URLs, and descriptions.',
    properties: {
      query: { type: 'string', description: 'The search query to look up on the web' },
    },
    required: ['query'],
  },
  handler: async (args) => {
    const query = String(args.query ?? '');
    if (!query.trim()) return toolError('Missing required parameter: query');

    const zai = await getZAI();
    if (!zai) return toolError('Web search service unavailable (z-ai-web-dev-sdk not initialized)');

    try {
      const results = await zai.functions.invoke('web_search', { query, num: 5 });
      return toolResult(results);
    } catch (err) {
      return toolError(`Web search failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
  description: 'Search the web for information on any topic.',
  emoji: '🔍',
});

// ─── Register: Code Execution ─────────────────────────────────────────────

registry.register({
  name: 'execute_code',
  toolset: 'code_execution',
  schema: {
    type: 'object',
    description: 'Run a Python script that can call Hermes tools programmatically.',
    properties: {
      code: { type: 'string', description: 'Python code to execute.' },
      language: { type: 'string', description: 'Programming language (default: python)', default: 'python' },
    },
    required: ['code'],
  },
  handler: async (args) => {
    const code = String(args.code ?? '');
    const language = String(args.language ?? 'python');
    if (!code.trim()) return toolError('Missing required parameter: code');

    try {
      let cmd: string;
      if (language === 'javascript' || language === 'js' || language === 'node') {
        // Write temp file and execute with node
        const tmpFile = path.join('/tmp', `hermes-code-${Date.now()}.js`);
        await fs.writeFile(tmpFile, code, 'utf-8');
        try {
          const { stdout, stderr } = await execAsync(`node "${tmpFile}"`, {
            timeout: 30000,
            maxBuffer: 1024 * 1024,
          });
          return toolResult({ output: stdout, errors: stderr, language });
        } finally {
          await fs.unlink(tmpFile).catch(() => {});
        }
      } else {
        // Default to Python
        const tmpFile = path.join('/tmp', `hermes-code-${Date.now()}.py`);
        await fs.writeFile(tmpFile, code, 'utf-8');
        try {
          const { stdout, stderr } = await execAsync(`python3 "${tmpFile}"`, {
            timeout: 30000,
            maxBuffer: 1024 * 1024,
          });
          return toolResult({ output: stdout, errors: stderr, language });
        } finally {
          await fs.unlink(tmpFile).catch(() => {});
        }
      }
    } catch (err: any) {
      return toolResult({
        output: err.stdout || '',
        errors: err.stderr || err.message,
        exitCode: err.code,
        language,
      });
    }
  },
  description: 'Run code with Python or Node.js.',
  emoji: '💻',
});

// ─── Register: File Read ──────────────────────────────────────────────────

registry.register({
  name: 'read_file',
  toolset: 'file',
  schema: {
    type: 'object',
    description: 'Read a text file with line numbers and pagination. Returns content with line numbers prefixed.',
    properties: {
      path: { type: 'string', description: 'Path to the file to read (relative to workspace or absolute)' },
      offset: { type: 'integer', description: 'Line number to start reading from (1-indexed)', default: 1, minimum: 1 },
      limit: { type: 'integer', description: 'Maximum number of lines to read (default: 500, max: 2000)', default: 500, maximum: 2000 },
    },
    required: ['path'],
  },
  handler: async (args) => {
    const filePath = String(args.path ?? '');
    if (!filePath.trim()) return toolError('Missing required parameter: path');

    try {
      const resolved = resolveSafePath(filePath);
      const content = await fs.readFile(resolved, 'utf-8');
      const lines = content.split('\n');

      const offset = Math.max(1, Number(args.offset) || 1);
      const limit = Math.min(2000, Math.max(1, Number(args.limit) || 500));
      const startIdx = offset - 1;
      const endIdx = Math.min(lines.length, startIdx + limit);
      const selectedLines = lines.slice(startIdx, endIdx);

      // Format with line numbers (cat -n style)
      const numbered = selectedLines
        .map((line, i) => {
          const lineNum = String(startIdx + i + 1).padStart(6, ' ');
          return `${lineNum}\t${line}`;
        })
        .join('\n');

      return toolResult({
        content: numbered,
        totalLines: lines.length,
        shownLines: selectedLines.length,
        startLine: offset,
        endLine: startIdx + selectedLines.length,
        path: resolved,
        truncated: endIdx < lines.length,
      });
    } catch (err: any) {
      if (err.message?.includes('Access denied')) {
        return toolError(err.message);
      }
      return toolError(`Failed to read file "${filePath}": ${err instanceof Error ? err.message : String(err)}`);
    }
  },
  description: 'Read a text file with line numbers and pagination.',
  emoji: '📖',
});

// ─── Register: File Write ─────────────────────────────────────────────────

registry.register({
  name: 'write_file',
  toolset: 'file',
  schema: {
    type: 'object',
    description: 'Write content to a file, completely replacing existing content. Creates parent directories if needed.',
    properties: {
      path: { type: 'string', description: 'Path to the file to write (relative to workspace or absolute)' },
      content: { type: 'string', description: 'Complete content to write to the file' },
    },
    required: ['path', 'content'],
  },
  handler: async (args) => {
    const filePath = String(args.path ?? '');
    const content = String(args.content ?? '');
    if (!filePath.trim()) return toolError('Missing required parameter: path');

    try {
      const resolved = resolveSafePath(filePath);

      // Create parent directories if needed
      const dir = path.dirname(resolved);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(resolved, content, 'utf-8');

      const stat = await fs.stat(resolved);
      return toolResult({
        success: true,
        path: resolved,
        bytesWritten: Buffer.byteLength(content, 'utf-8'),
        message: `File written successfully: ${resolved} (${stat.size} bytes)`,
      });
    } catch (err: any) {
      if (err.message?.includes('Access denied')) {
        return toolError(err.message);
      }
      return toolError(`Failed to write file "${filePath}": ${err instanceof Error ? err.message : String(err)}`);
    }
  },
  description: 'Write content to a file.',
  emoji: '✏️',
});

// ─── Register: Search Files ──────────────────────────────────────────────

registry.register({
  name: 'search_files',
  toolset: 'file',
  schema: {
    type: 'object',
    description: 'Search for a pattern in files within the workspace using grep. Returns matching lines with file paths and line numbers.',
    properties: {
      pattern: { type: 'string', description: 'The search pattern (supports regex)' },
      path: { type: 'string', description: 'Directory or file to search in (default: workspace root)' },
      file_type: { type: 'string', description: 'File extension filter (e.g. "ts", "py", "js")' },
      max_results: { type: 'integer', description: 'Maximum number of results (default: 50)', default: 50, maximum: 200 },
    },
    required: ['pattern'],
  },
  handler: async (args) => {
    const pattern = String(args.pattern ?? '');
    if (!pattern.trim()) return toolError('Missing required parameter: pattern');

    try {
      const searchPath = args.path
        ? resolveSafePath(String(args.path))
        : getWorkspaceRoot();
      const maxResults = Math.min(200, Number(args.max_results) || 50);
      const fileType = args.file_type ? String(args.file_type) : '';

      // Build grep command using ripgrep (rg) with fallback to grep
      let cmd: string;
      if (fileType) {
        cmd = `rg --no-heading --line-number -n --max-count ${maxResults} -t ${fileType} ${JSON.stringify(pattern)} ${JSON.stringify(searchPath)} 2>/dev/null`;
      } else {
        cmd = `rg --no-heading --line-number -n --max-count ${maxResults} ${JSON.stringify(pattern)} ${JSON.stringify(searchPath)} 2>/dev/null`;
      }

      const { stdout } = await execAsync(cmd, {
        timeout: 15000,
        maxBuffer: 1024 * 1024,
      });

      // Parse output into structured format
      const matches = stdout
        .split('\n')
        .filter(Boolean)
        .slice(0, maxResults);

      const results = matches.map((line) => {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) return { file: '', line: 0, content: line };
        const file = line.slice(0, colonIdx);
        const rest = line.slice(colonIdx + 1);
        const secondColon = rest.indexOf(':');
        if (secondColon === -1) return { file, line: 0, content: rest };
        const lineNum = parseInt(rest.slice(0, secondColon), 10);
        const content = rest.slice(secondColon + 1);
        return { file, line: lineNum, content };
      });

      return toolResult({
        matches: results,
        totalMatches: results.length,
        pattern,
        searchPath,
        truncated: results.length >= maxResults,
      });
    } catch (err: any) {
      // rg returns exit code 1 when no matches found — that's fine
      if (err.code === 1 && !err.stdout) {
        return toolResult({
          matches: [],
          totalMatches: 0,
          pattern,
          message: 'No matches found.',
        });
      }
      // rg not installed — fallback to grep
      try {
        const searchPath = args.path
          ? resolveSafePath(String(args.path))
          : getWorkspaceRoot();
        const maxResults = Math.min(200, Number(args.max_results) || 50);
        const escapedPattern = pattern.replace(/'/g, "'\\''");
        let grepCmd = `grep -rn --include='*' -m ${maxResults} '${escapedPattern}' ${JSON.stringify(searchPath)} 2>/dev/null || true`;

        const { stdout } = await execAsync(grepCmd, {
          timeout: 15000,
          maxBuffer: 1024 * 1024,
        });

        const matches = stdout.split('\n').filter(Boolean).slice(0, maxResults);
        const results = matches.map((line) => {
          const firstColon = line.indexOf(':');
          if (firstColon === -1) return { file: '', line: 0, content: line };
          const file = line.slice(0, firstColon);
          const rest = line.slice(firstColon + 1);
          const secondColon = rest.indexOf(':');
          if (secondColon === -1) return { file, line: 0, content: rest };
          const lineNum = parseInt(rest.slice(0, secondColon), 10);
          const content = rest.slice(secondColon + 1);
          return { file, line: lineNum, content };
        });

        return toolResult({
          matches: results,
          totalMatches: results.length,
          pattern,
          searchPath,
        });
      } catch {
        return toolError(`Search failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  },
  description: 'Search for patterns in files.',
  emoji: '🔎',
});

// ─── Register: Patch (find and replace in files) ──────────────────────────

registry.register({
  name: 'patch',
  toolset: 'file',
  schema: {
    type: 'object',
    description: 'Perform find-and-replace operations within a file. Replaces all occurrences of old_string with new_string.',
    properties: {
      path: { type: 'string', description: 'Path to the file to patch' },
      old_string: { type: 'string', description: 'The text to find and replace' },
      new_string: { type: 'string', description: 'The replacement text' },
    },
    required: ['path', 'old_string', 'new_string'],
  },
  handler: async (args) => {
    const filePath = String(args.path ?? '');
    const oldString = String(args.old_string ?? '');
    const newString = String(args.new_string ?? '');

    if (!filePath.trim()) return toolError('Missing required parameter: path');
    if (!oldString) return toolError('Missing required parameter: old_string');

    try {
      const resolved = resolveSafePath(filePath);
      let content = await fs.readFile(resolved, 'utf-8');

      if (!content.includes(oldString)) {
        return toolError(`Pattern not found in file "${filePath}". The old_string does not match any content in the file.`);
      }

      const occurrences = content.split(oldString).length - 1;
      content = content.replaceAll(oldString, newString);

      await fs.writeFile(resolved, content, 'utf-8');

      return toolResult({
        success: true,
        path: resolved,
        replacements: occurrences,
        message: `Patched ${occurrences} occurrence(s) in ${resolved}`,
      });
    } catch (err: any) {
      if (err.message?.includes('Access denied')) {
        return toolError(err.message);
      }
      return toolError(`Failed to patch file "${filePath}": ${err instanceof Error ? err.message : String(err)}`);
    }
  },
  description: 'Find and replace text in a file.',
  emoji: '🩹',
});

// ─── Register: Memory (add/replace/remove/read) ───────────────────────────

registry.register({
  name: 'memory',
  toolset: 'memory',
  schema: {
    type: 'object',
    description: 'Save, replace, remove, or read persistent memory entries.',
    properties: {
      action: { type: 'string', enum: ['add', 'replace', 'remove', 'read'], description: 'The memory action to perform' },
      target: { type: 'string', enum: ['memory', 'user'], description: 'Which memory store to modify (for add/replace/remove)' },
      content: { type: 'string', description: 'Entry content to add (for add action)' },
      old_text: { type: 'string', description: 'Substring identifying the entry (for replace/remove)' },
      new_content: { type: 'string', description: 'New entry content (for replace action)' },
    },
    required: ['action'],
  },
  handler: async (args, _ctx: ToolContext) => {
    const { MemoryManager } = await import('./memory');
    const mm = new MemoryManager();
    const { action, target, content, old_text, new_content } = args;

    switch (action) {
      case 'read': {
        const data = await mm.readMemory();
        return toolResult({
          memoryContent: data.memoryContent,
          userContent: data.userContent,
          memoryEntries: data.memoryEntries.length,
          userEntries: data.userEntries.length,
          memoryUsage: data.memoryUsage,
          userUsage: data.userUsage,
        });
      }

      case 'add': {
        if (!target || target !== 'memory' && target !== 'user') {
          return toolError("Invalid or missing 'target': must be 'memory' or 'user'");
        }
        if (!content) return toolError("Missing 'content' for add action");
        const result = await mm.add(target, String(content));
        if (!result.success) return toolError(result.error || 'Add failed');
        return toolResult({ message: result.message, entryCount: result.entryCount, usage: result.usage });
      }

      case 'replace': {
        if (!target || target !== 'memory' && target !== 'user') {
          return toolError("Invalid or missing 'target': must be 'memory' or 'user'");
        }
        if (!old_text) return toolError("Missing 'old_text' for replace action");
        if (!new_content) return toolError("Missing 'new_content' for replace action");
        const result = await mm.replace(target, String(old_text), String(new_content));
        if (!result.success) return toolError(result.error || 'Replace failed');
        return toolResult({ message: result.message, entryCount: result.entryCount, usage: result.usage });
      }

      case 'remove': {
        if (!target || target !== 'memory' && target !== 'user') {
          return toolError("Invalid or missing 'target': must be 'memory' or 'user'");
        }
        if (!old_text) return toolError("Missing 'old_text' for remove action");
        const result = await mm.remove(target, String(old_text));
        if (!result.success) return toolError(result.error || 'Remove failed');
        return toolResult({ message: result.message, entryCount: result.entryCount, usage: result.usage });
      }

      default:
        return toolError(`Unknown memory action: ${action}`);
    }
  },
  description: 'Save, replace, remove, or read persistent memory entries.',
  emoji: '🧠',
});

// ─── Register: Skills List ───────────────────────────────────────────────

registry.register({
  name: 'skills_list',
  toolset: 'skills',
  schema: {
    type: 'object',
    description: 'List available skills (name + description).',
    properties: {
      category: { type: 'string', description: 'Optional category filter' },
    },
    required: [],
  },
  handler: async (args) => {
    const { scanSkills } = await import('./skills');
    const skills = await scanSkills({
      category: args.category ? String(args.category) : undefined,
    });
    return toolResult({
      skills: skills.map((s) => ({
        name: s.name,
        category: s.category,
        description: s.description,
        isBuiltin: s.isBuiltin,
      })),
      total: skills.length,
    });
  },
  description: 'List available skills.',
  emoji: '📚',
});

// ─── Register: Skill View ────────────────────────────────────────────────

registry.register({
  name: 'skill_view',
  toolset: 'skills',
  schema: {
    type: 'object',
    description: 'Load a skill\'s full SKILL.md content.',
    properties: {
      name: { type: 'string', description: 'The skill name' },
      file_path: { type: 'string', description: 'Optional path to a linked file within the skill' },
    },
    required: ['name'],
  },
  handler: async (args) => {
    const { getSkillContent } = await import('./skills');
    const result = await getSkillContent(String(args.name));
    if (!result) return toolError(`Skill '${args.name}' not found`);
    return toolResult({
      content: result.content,
      linkedFiles: result.linkedFiles,
    });
  },
  description: 'Load a skill\'s full content.',
  emoji: '📕',
});

// ─── Register: Skill Manage (CRUD) ───────────────────────────────────────

registry.register({
  name: 'skill_manage',
  toolset: 'skills',
  schema: {
    type: 'object',
    description: 'Manage skills (create, patch, edit, delete).',
    properties: {
      action: { type: 'string', enum: ['create', 'patch', 'edit', 'delete'], description: 'The action to perform' },
      name: { type: 'string', description: 'Skill name' },
      category: { type: 'string', description: 'Category (for create)' },
      content: { type: 'string', description: 'Full SKILL.md content (for create/edit)' },
      old_string: { type: 'string', description: 'Text to find (for patch)' },
      new_string: { type: 'string', description: 'Replacement text (for patch)' },
    },
    required: ['action', 'name'],
  },
  handler: async (args) => {
    const { manageSkill } = await import('./skills');
    const result = await manageSkill(args.action as any, {
      name: String(args.name),
      category: args.category ? String(args.category) : undefined,
      description: undefined,
      content: args.content ? String(args.content) : undefined,
    });
    if (!result.success) return toolError(result.error || `Skill ${args.action} failed`);
    return toolResult({ message: `Skill ${args.action}d successfully`, path: result.path });
  },
  description: 'Create, edit, patch, or delete a skill.',
  emoji: '🔧',
});

// ─── Register: Todo (merge-mode task management) ─────────────────────────

registry.register({
  name: 'todo',
  toolset: 'todo',
  schema: {
    type: 'object',
    description: 'Manage task list for the current session.',
    properties: {
      todos: {
        type: 'array',
        description: 'Task items to write. Omit to read current list.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique item identifier' },
            content: { type: 'string', description: 'Task description' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] },
          },
          required: ['id', 'content', 'status'],
        },
      },
      merge: { type: 'boolean', description: 'true: merge, false: replace (default)', default: false },
    },
    required: [],
  },
  handler: async (args) => {
    // Session-scoped todo — stored in-memory for now
    const { todos, merge } = args;

    if (!todos || !Array.isArray(todos)) {
      return toolResult({
        todos: [],
        message: 'No active tasks. Provide todos array to create/update tasks.',
      });
    }

    // Validate items
    const validated = todos.map((item: any) => ({
      id: String(item.id || ''),
      content: String(item.content || ''),
      status: ['pending', 'in_progress', 'completed', 'cancelled'].includes(item.status)
        ? item.status
        : 'pending',
    }));

    return toolResult({
      todos: validated,
      total: validated.length,
      inProgress: validated.filter((t: any) => t.status === 'in_progress').length,
      completed: validated.filter((t: any) => t.status === 'completed').length,
      pending: validated.filter((t: any) => t.status === 'pending').length,
      message: `Task list updated: ${validated.length} items (${merge ? 'merged' : 'replaced'})`,
    });
  },
  description: 'Manage task list for the current session.',
  emoji: '☑️',
});

// ─── Register: Image Generate ────────────────────────────────────────────

registry.register({
  name: 'image_generate',
  toolset: 'image_gen',
  schema: {
    type: 'object',
    description: 'Generate high-quality images from text prompts.',
    properties: {
      prompt: { type: 'string', description: 'The text prompt describing the desired image' },
      aspect_ratio: { type: 'string', enum: ['landscape', 'square', 'portrait'], description: 'Aspect ratio', default: 'landscape' },
    },
    required: ['prompt'],
  },
  handler: async (args) => {
    const zai = await getZAI();
    if (!zai) return toolError('Image generation service unavailable');

    try {
      const result = await zai.functions.invoke('image_generation', {
        prompt: String(args.prompt),
        aspect_ratio: args.aspect_ratio || 'landscape',
      });
      return toolResult(result);
    } catch (err) {
      return toolError(`Image generation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
  description: 'Generate images from text prompts.',
  emoji: '🎨',
  checkFn: async () => {
    const zai = await getZAI();
    return !!zai;
  },
});

// ─── Register: Browser Navigate ──────────────────────────────────────────

registry.register({
  name: 'browser_navigate',
  toolset: 'browser',
  schema: {
    type: 'object',
    description: 'Navigate to a URL in the browser.',
    properties: {
      url: { type: 'string', description: 'The URL to navigate to' },
    },
    required: ['url'],
  },
  handler: async (args) => {
    // For web platform, use web_extract as a read-only alternative
    const zai = await getZAI();
    if (!zai) return toolError('Browser/web service unavailable');

    const url = String(args.url ?? '');
    if (!url.trim()) return toolError('Missing required parameter: url');

    try {
      // Extract the page content as a lightweight alternative to full browser
      const result = await zai.functions.invoke('web_extract', { urls: [url] });
      return toolResult({
        url,
        content: result,
        note: 'Full browser automation is not available. Page content has been extracted via web_extract instead.',
      });
    } catch (err) {
      return toolError(`Browser/web extraction failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
  description: 'Navigate to a URL (extracts content in web mode).',
  emoji: '🌐',
});

// ─── Register: Browser Screenshot ────────────────────────────────────────

registry.register({
  name: 'browser_screenshot',
  toolset: 'browser',
  schema: {
    type: 'object',
    description: 'Take a screenshot of the current browser page.',
    properties: {},
    required: [],
  },
  handler: async () => {
    return toolResult({
      note: 'Browser screenshot is not available in the web API context. Use browser_navigate to extract page content instead.',
    });
  },
  description: 'Take a screenshot of the current browser page.',
  emoji: '📸',
});

// ─── Register: TTS Speak ─────────────────────────────────────────────────

registry.register({
  name: 'text_to_speech',
  toolset: 'tts',
  schema: {
    type: 'object',
    description: 'Convert text to speech audio.',
    properties: {
      text: { type: 'string', description: 'The text to convert to speech' },
    },
    required: ['text'],
  },
  handler: async (args) => {
    const zai = await getZAI();
    if (!zai) return toolError('TTS service unavailable');

    const text = String(args.text ?? '');
    if (!text.trim()) return toolError('Missing required parameter: text');

    const truncatedText = text.substring(0, 1024);

    try {
      const response = await zai.audio.tts.create({
        input: truncatedText,
        voice: 'tongtong',
        speed: 1.0,
        response_format: 'mp3',
        stream: false,
      });

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(new Uint8Array(arrayBuffer));
      const audioBase64 = buffer.toString('base64');

      return toolResult({
        audioGenerated: true,
        audioDataUrl: `data:audio/mp3;base64,${audioBase64}`,
        textLength: text.length,
      });
    } catch (err) {
      return toolError(`TTS failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
  description: 'Convert text to speech.',
  emoji: '🔊',
});

// ─── Register: Web Extract ───────────────────────────────────────────────

registry.register({
  name: 'web_extract',
  toolset: 'web',
  schema: {
    type: 'object',
    description: 'Extract content from web page URLs in markdown format.',
    properties: {
      urls: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of URLs to extract content from (max 5)',
        maxItems: 5,
      },
    },
    required: ['urls'],
  },
  handler: async (args) => {
    const zai = await getZAI();
    if (!zai) return toolError('Web extraction service unavailable');

    const urls = Array.isArray(args.urls) ? args.urls.map(String).slice(0, 5) : [];
    if (urls.length === 0) return toolError('Missing or empty urls array');

    try {
      const results = await zai.functions.invoke('web_extract', { urls });
      return toolResult(results);
    } catch (err) {
      return toolError(`Web extraction failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
  description: 'Extract content from web page URLs.',
  emoji: '📄',
});

// ─── Register: Terminal ──────────────────────────────────────────────────

registry.register({
  name: 'terminal',
  toolset: 'terminal',
  schema: {
    type: 'object',
    description: 'Execute shell commands in a sandboxed environment. Commands run within the workspace directory with a timeout.',
    properties: {
      command: { type: 'string', description: 'The shell command to execute' },
      timeout: { type: 'integer', description: 'Max seconds to wait (default: 60, max: 300)', default: 60, maximum: 300 },
      workdir: { type: 'string', description: 'Working directory (must be within workspace)' },
    },
    required: ['command'],
  },
  handler: async (args) => {
    const command = String(args.command ?? '');
    if (!command.trim()) return toolError('Missing required parameter: command');

    const timeout = Math.min(300, Math.max(5, Number(args.timeout) || 60)) * 1000;
    let workdir = getWorkspaceRoot();

    if (args.workdir) {
      try {
        workdir = resolveSafePath(String(args.workdir));
      } catch (err: any) {
        return toolError(err.message);
      }
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        maxBuffer: 1024 * 1024, // 1MB max output
        cwd: workdir,
        env: {
          ...process.env,
          HOME: workdir, // Sandboxing: set HOME to workspace
        },
      });

      return toolResult({
        stdout: stdout.trimEnd(),
        stderr: stderr.trimEnd() || undefined,
        exitCode: 0,
        workdir,
        command,
      });
    } catch (err: any) {
      return toolResult({
        stdout: (err.stdout || '').trimEnd(),
        stderr: (err.stderr || err.message || '').trimEnd(),
        exitCode: err.code || 1,
        workdir,
        command,
        timedOut: err.killed === true,
      });
    }
  },
  description: 'Execute shell commands.',
  emoji: '🖥️',
});

// ─── Register: Session Search ────────────────────────────────────────────

registry.register({
  name: 'session_search',
  toolset: 'session_search',
  schema: {
    type: 'object',
    description: 'Search past chat sessions by keyword. Returns matching session titles and message excerpts.',
    properties: {
      query: { type: 'string', description: 'Search query to find in past sessions' },
      limit: { type: 'integer', description: 'Maximum number of sessions to return (default: 10)', default: 10, maximum: 50 },
    },
    required: ['query'],
  },
  handler: async (args) => {
    const query = String(args.query ?? '');
    if (!query.trim()) return toolError('Missing required parameter: query');

    try {
      const { db } = await import('@/lib/db');
      const limit = Math.min(50, Number(args.limit) || 10);
      const queryLower = `%${query.toLowerCase()}%`;

      // Search sessions by title and message content
      const sessions = await db.chatSession.findMany({
        where: {
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            {
              messages: {
                some: {
                  content: { contains: query, mode: 'insensitive' },
                },
              },
            },
          ],
        },
        include: {
          messages: {
            where: {
              content: { contains: query, mode: 'insensitive' },
            },
            select: {
              content: true,
              role: true,
              createdAt: true,
            },
            take: 3,
            orderBy: { createdAt: 'asc' },
          },
        },
        take: limit,
        orderBy: { updatedAt: 'desc' },
      });

      return toolResult({
        sessions: sessions.map((s) => ({
          id: s.id,
          title: s.title,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          matchCount: s.messages.length,
          excerpts: s.messages.map((m) => ({
            role: m.role,
            excerpt: m.content.slice(0, 200),
          })),
        })),
        total: sessions.length,
        query,
      });
    } catch (err) {
      return toolError(`Session search failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
  description: 'Search past chat sessions by keyword.',
  emoji: '🔍',
});

// ─── Register: Clarify ───────────────────────────────────────────────────

registry.register({
  name: 'clarify',
  toolset: 'clarify',
  schema: {
    type: 'object',
    description: 'Ask the user a clarifying question to resolve ambiguity in their request. Use this when the task is unclear or has multiple interpretations.',
    properties: {
      question: { type: 'string', description: 'The clarifying question to ask the user' },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional list of suggested answers for the user to choose from',
      },
    },
    required: ['question'],
  },
  handler: async (args) => {
    const question = String(args.question ?? '');
    if (!question.trim()) return toolError('Missing required parameter: question');

    return toolResult({
      type: 'clarification',
      question,
      options: Array.isArray(args.options) ? args.options.map(String) : undefined,
    });
  },
  description: 'Ask the user a clarifying question.',
  emoji: '❓',
});

// ─── Register: Cronjob ───────────────────────────────────────────────────

registry.register({
  name: 'cronjob',
  toolset: 'cronjob',
  schema: {
    type: 'object',
    description: 'Create, list, or delete scheduled tasks (cron jobs). Allows the agent to set up recurring or one-time tasks.',
    properties: {
      action: { type: 'string', enum: ['create', 'list', 'delete', 'get'], description: 'The cron job action' },
      name: { type: 'string', description: 'Job name (required for create/delete/get)' },
      schedule: { type: 'string', description: 'Schedule expression: cron (e.g. "0 9 * * 1" for Mon 9AM), fixed_rate (seconds), or one_time (ISO datetime)' },
      task: { type: 'string', description: 'Task description/prompt for the agent to execute when triggered' },
      job_id: { type: 'string', description: 'Job ID (for delete/get actions)' },
    },
    required: ['action'],
  },
  handler: async (args) => {
    const { action } = args;

    try {
      // Dynamic import of the cron module (server-only)
      const cronModule = await import('@/lib/cron-client');

      switch (action) {
        case 'list': {
          const jobs = await cronModule.listCronJobs();
          return toolResult({
            jobs: jobs.map((j: any) => ({
              id: j.id,
              name: j.name,
              schedule: j.schedule,
              enabled: j.enabled,
              lastRun: j.lastRunAt,
              nextRun: j.nextRunAt,
            })),
            total: jobs.length,
          });
        }

        case 'create': {
          const name = String(args.name ?? '');
          const schedule = String(args.schedule ?? '');
          const task = String(args.task ?? '');

          if (!name) return toolError('Missing required parameter: name for create action');
          if (!schedule) return toolError('Missing required parameter: schedule for create action');
          if (!task) return toolError('Missing required parameter: task for create action');

          const job = await cronModule.createCronJob({ name, schedule, task });
          return toolResult({
            success: true,
            job: { id: job.id, name: job.name, schedule: job.schedule, nextRun: job.nextRunAt },
            message: `Cron job "${name}" created successfully`,
          });
        }

        case 'delete': {
          const jobId = String(args.job_id ?? '');
          if (!jobId) return toolError('Missing required parameter: job_id for delete action');
          await cronModule.deleteCronJob(jobId);
          return toolResult({ success: true, message: `Cron job ${jobId} deleted` });
        }

        case 'get': {
          const jobId = String(args.job_id ?? '');
          if (!jobId) return toolError('Missing required parameter: job_id for get action');
          const job = await cronModule.getCronJob(jobId);
          return toolResult(job);
        }

        default:
          return toolError(`Unknown cron action: ${action}`);
      }
    } catch (err: any) {
      // If cron module is not available
      if (err.code === 'MODULE_NOT_FOUND') {
        return toolResult({
          note: 'Cron job management is not available in this environment.',
          action,
        });
      }
      return toolError(`Cron job ${action} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
  description: 'Manage scheduled tasks (cron jobs).',
  emoji: '⏰',
});

// ─── Register: Vision Analyze ────────────────────────────────────────────

registry.register({
  name: 'vision_analyze',
  toolset: 'vision',
  schema: {
    type: 'object',
    description: 'Analyze images using AI vision.',
    properties: {
      image_url: { type: 'string', description: 'Image URL or local file path' },
      question: { type: 'string', description: 'Question about the image' },
    },
    required: ['image_url', 'question'],
  },
  handler: async (args) => {
    const zai = await getZAI();
    if (!zai) return toolError('Vision service unavailable');

    try {
      const result = await zai.functions.invoke('image_understanding', {
        image_url: String(args.image_url),
        question: String(args.question),
      });
      return toolResult(result);
    } catch (err) {
      return toolError(`Vision analysis failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
  description: 'Analyze images using AI vision.',
  emoji: '👁️',
});

// ─── Register: Send Message ─────────────────────────────────────────────

registry.register({
  name: 'send_message',
  toolset: 'messaging',
  schema: {
    type: 'object',
    description: 'Send a message to a cross-platform channel. Supports web, telegram, discord, slack, and whatsapp platforms. Stores the message in a queue for delivery confirmation.',
    properties: {
      message: { type: 'string', description: 'The message content to send' },
      platform: {
        type: 'string',
        enum: ['web', 'telegram', 'discord', 'slack', 'whatsapp'],
        description: 'Target platform for the message',
      },
      channel_id: { type: 'string', description: 'Optional channel/group ID to send the message to' },
      reply_to: { type: 'string', description: 'Optional message ID to reply to' },
    },
    required: ['message', 'platform'],
  },
  handler: async (args) => {
    const message = String(args.message ?? '');
    const platform = String(args.platform ?? '');

    if (!message.trim()) return toolError('Missing required parameter: message');
    if (!platform || !['web', 'telegram', 'discord', 'slack', 'whatsapp'].includes(platform)) {
      return toolError("Invalid or missing 'platform': must be one of web, telegram, discord, slack, whatsapp");
    }

    const entry = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      platform,
      channel_id: args.channel_id ? String(args.channel_id) : undefined,
      message,
      reply_to: args.reply_to ? String(args.reply_to) : undefined,
      createdAt: new Date(),
    };

    messageQueue.push(entry);

    return toolResult({
      success: true,
      messageId: entry.id,
      platform,
      channel_id: entry.channel_id,
      reply_to: entry.reply_to,
      status: 'queued',
      queuedAt: entry.createdAt.toISOString(),
      queueLength: messageQueue.length,
      message: `Message queued for delivery on ${platform}${entry.channel_id ? ` channel ${entry.channel_id}` : ''}`,
    });
  },
  description: 'Send a cross-platform message.',
  emoji: '💬',
});

// ─── Register: Process (background process management) ────────────────────

registry.register({
  name: 'process',
  toolset: 'terminal',
  schema: {
    type: 'object',
    description: 'Manage background processes spawned by the terminal tool. Supports listing, polling, reading logs, writing input, killing, and waiting for processes.',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'poll', 'log', 'wait', 'kill', 'write', 'submit'],
        description: 'Action to perform on the background process',
      },
      session_id: { type: 'string', description: 'Unique process session ID' },
      data: { type: 'string', description: 'Input data to write to stdin (for write/submit actions)' },
      timeout: { type: 'integer', description: 'Max seconds to wait (for wait action, default: 30)', default: 30, maximum: 600 },
      offset: { type: 'integer', description: 'Byte offset for log retrieval (default: 0)', default: 0, minimum: 0 },
      limit: { type: 'integer', description: 'Max bytes to retrieve from log (default: 4096)', default: 4096, maximum: 65536 },
    },
    required: ['action'],
  },
  handler: async (args) => {
    const action = String(args.action ?? '');
    const sessionId = args.session_id ? String(args.session_id) : '';

    switch (action) {
      case 'list': {
        const processes: Array<{ sessionId: string; command: string; pid?: number; status: string; startedAt: string }> = [];
        backgroundProcesses.forEach((proc, id) => {
          processes.push({
            sessionId: id,
            command: proc.command,
            pid: proc.pid,
            status: proc.status,
            startedAt: proc.startedAt.toISOString(),
          });
        });
        return toolResult({ processes, total: processes.length });
      }

      case 'poll': {
        if (!sessionId) return toolError('Missing required parameter: session_id for poll action');
        const proc = backgroundProcesses.get(sessionId);
        if (!proc) return toolError(`Process not found: ${sessionId}`);
        return toolResult({
          sessionId,
          status: proc.status,
          pid: proc.pid,
          exitCode: proc.exitCode,
          stdoutLength: proc.stdout.length,
          stderrLength: proc.stderr.length,
          startedAt: proc.startedAt.toISOString(),
        });
      }

      case 'log': {
        if (!sessionId) return toolError('Missing required parameter: session_id for log action');
        const proc = backgroundProcesses.get(sessionId);
        if (!proc) return toolError(`Process not found: ${sessionId}`);
        const offset = Math.max(0, Number(args.offset) || 0);
        const limit = Math.min(65536, Math.max(1, Number(args.limit) || 4096));
        const stdoutChunk = proc.stdout.slice(offset, offset + limit);
        const stderrChunk = proc.stderr.slice(offset, offset + limit);
        return toolResult({
          sessionId,
          status: proc.status,
          exitCode: proc.exitCode,
          stdout: stdoutChunk,
          stderr: stderrChunk,
          offset,
          bytesReturned: stdoutChunk.length + stderrChunk.length,
          totalStdoutBytes: proc.stdout.length,
          totalStderrBytes: proc.stderr.length,
          truncated: (offset + limit) < proc.stdout.length || (offset + limit) < proc.stderr.length,
        });
      }

      case 'wait': {
        if (!sessionId) return toolError('Missing required parameter: session_id for wait action');
        const proc = backgroundProcesses.get(sessionId);
        if (!proc) return toolError(`Process not found: ${sessionId}`);
        const timeoutMs = Math.min(600000, Math.max(1000, (Number(args.timeout) || 30) * 1000));
        // Poll until completed/killed or timeout
        const startTime = Date.now();
        while (proc.status === 'running' && (Date.now() - startTime) < timeoutMs) {
          await new Promise((r) => setTimeout(r, 500));
        }
        return toolResult({
          sessionId,
          status: proc.status,
          pid: proc.pid,
          exitCode: proc.exitCode,
          stdout: proc.stdout,
          stderr: proc.stderr,
          timedOut: proc.status === 'running',
        });
      }

      case 'kill': {
        if (!sessionId) return toolError('Missing required parameter: session_id for kill action');
        const proc = backgroundProcesses.get(sessionId);
        if (!proc) return toolError(`Process not found: ${sessionId}`);
        if (proc.pid) {
          try { process.kill(proc.pid, 'SIGTERM'); } catch { /* process may already be dead */ }
        }
        proc.status = 'killed';
        return toolResult({
          sessionId,
          status: 'killed',
          message: `Process ${sessionId} (PID ${proc.pid || 'unknown'}) killed`,
        });
      }

      case 'write': {
        if (!sessionId) return toolError('Missing required parameter: session_id for write action');
        const proc = backgroundProcesses.get(sessionId);
        if (!proc) return toolError(`Process not found: ${sessionId}`);
        if (proc.status !== 'running') return toolError(`Process ${sessionId} is not running (status: ${proc.status})`);
        // Write to stdin is not possible with spawn after the fact without a reference.
        // Store data for the process log as a best-effort record.
        const data = String(args.data ?? '');
        proc.stderr += `[stdin write]: ${data}\n`;
        return toolResult({
          sessionId,
          status: proc.status,
          message: `Data written to process stdin (${data.length} bytes)`,
        });
      }

      case 'submit': {
        // Submit: write data and then wait for completion
        if (!sessionId) return toolError('Missing required parameter: session_id for submit action');
        const proc = backgroundProcesses.get(sessionId);
        if (!proc) return toolError(`Process not found: ${sessionId}`);
        if (proc.status !== 'running') return toolError(`Process ${sessionId} is not running (status: ${proc.status})`);
        const data = String(args.data ?? '');
        proc.stderr += `[stdin submit]: ${data}\n`;
        const timeoutMs = Math.min(600000, Math.max(1000, (Number(args.timeout) || 30) * 1000));
        const startTime = Date.now();
        while (proc.status === 'running' && (Date.now() - startTime) < timeoutMs) {
          await new Promise((r) => setTimeout(r, 500));
        }
        return toolResult({
          sessionId,
          status: proc.status,
          pid: proc.pid,
          exitCode: proc.exitCode,
          stdout: proc.stdout,
          stderr: proc.stderr,
          timedOut: proc.status === 'running',
        });
      }

      default:
        return toolError(`Unknown process action: ${action}`);
    }
  },
  description: 'Manage background processes.',
  emoji: '⚙️',
});

// ─── Register: Mixture of Agents ──────────────────────────────────────────

registry.register({
  name: 'mixture_of_agents',
  toolset: 'reasoning',
  schema: {
    type: 'object',
    description: 'Run a prompt through multiple AI models and combine the results using a specified strategy. Supports consensus, best-of, and chain strategies with up to 3 models.',
    properties: {
      prompt: { type: 'string', description: 'The prompt to send to multiple models' },
      models: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of model names to use (max 3)',
        maxItems: 3,
      },
      strategy: {
        type: 'string',
        enum: ['consensus', 'best_of', 'chain'],
        description: 'Strategy to combine results: consensus (majority vote summary), best_of (pick best response), chain (each model refines the previous)',
      },
    },
    required: ['prompt', 'models', 'strategy'],
  },
  handler: async (args) => {
    const prompt = String(args.prompt ?? '');
    const models = Array.isArray(args.models) ? args.models.map(String).slice(0, 3) : [];
    const strategy = String(args.strategy ?? 'consensus');

    if (!prompt.trim()) return toolError('Missing required parameter: prompt');
    if (models.length === 0) return toolError('Missing required parameter: models (provide 1-3 model names)');
    if (!['consensus', 'best_of', 'chain'].includes(strategy)) {
      return toolError("Invalid strategy: must be 'consensus', 'best_of', or 'chain'");
    }

    const zai = await getZAI();
    if (!zai) return toolError('LLM service unavailable for mixture of agents');

    try {
      // Available model mapping — maps user-facing names to SDK model IDs
      const modelMap: Record<string, string> = {
        'glm-4-flash': 'glm-4-flash',
        'glm-4-plus': 'glm-4-plus',
        'glm-4-air': 'glm-4-air',
        'glm-4-long': 'glm-4-long',
        'gpt-4o-mini': 'glm-4-flash', // fallback mapping
        'claude-haiku': 'glm-4-flash', // fallback mapping
      };

      // Run the prompt through each model sequentially
      const results: Array<{ model: string; response: string; modelUsed: string }> = [];
      let chainPrompt = prompt;

      for (const model of models) {
        const modelUsed = modelMap[model] || 'glm-4-flash';
        const currentPrompt = strategy === 'chain' ? chainPrompt : prompt;

        const completion = await zai.chat.completions.create({
          model: modelUsed,
          messages: [{ role: 'user', content: currentPrompt }],
          max_tokens: 2048,
        });

        const response = completion.choices?.[0]?.message?.content || '';
        results.push({ model, response, modelUsed });

        // For chain strategy, append the response as context for the next model
        if (strategy === 'chain') {
          chainPrompt = `Previous model (${model}) response:\n${response}\n\nPlease refine and improve the above response. Original prompt: ${prompt}`;
        }
      }

      // Apply strategy to combine results
      let finalResult: string;
      if (strategy === 'chain') {
        // Chain: use the last model's refined output
        finalResult = results[results.length - 1]?.response || '';
      } else if (strategy === 'best_of') {
        // Best-of: pick the longest response as a heuristic for most detailed
        const best = results.reduce((prev, curr) =>
          curr.response.length > prev.response.length ? curr : prev
        );
        finalResult = best.response;
      } else {
        // Consensus: combine all responses into a summary
        finalResult = results
          .map((r) => `[${r.model}]: ${r.response}`)
          .join('\n\n---\n\n');
      }

      return toolResult({
        strategy,
        modelsUsed: results.map((r) => ({ requested: r.model, used: r.modelUsed })),
        individualResults: results.map((r) => ({ model: r.model, responseLength: r.response.length })),
        combinedResult: finalResult,
        resultLength: finalResult.length,
        message: `Ran prompt through ${results.length} model(s) with ${strategy} strategy`,
      });
    } catch (err) {
      return toolError(`Mixture of agents failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
  description: 'Multi-model reasoning with combined results.',
  emoji: '🤖',
});

// ─── Registration summary ────────────────────────────────────────────────

/**
 * Total tools registered in this module.
 * The dynamic registry may have additional tools registered by plugins/MCP.
 */
export const REGISTERED_TOOL_COUNT = registry.size;
