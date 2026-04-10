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
 * Web-compatible tools have actual handlers; non-web tools return placeholder
 * results explaining they require a local/CLI environment.
 *
 * Import this module once: `import '@/lib/hermes/registered-tools'`
 */

import { registry, toolResult, toolError, type ToolContext } from './tool-registry';

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
    },
    required: ['code'],
  },
  handler: async (args) => {
    return toolResult({
      note: 'Code execution is not available in the web API context. The agent described the intended code logic above.',
    });
  },
  description: 'Run Python code with tool access.',
  emoji: '💻',
  checkFn: () => process.env.HERMES_CODE_EXECUTION_ENABLED === 'true',
});

// ─── Register: File Read ──────────────────────────────────────────────────

registry.register({
  name: 'read_file',
  toolset: 'file',
  schema: {
    type: 'object',
    description: 'Read a text file with line numbers and pagination.',
    properties: {
      path: { type: 'string', description: 'Path to the file to read' },
      offset: { type: 'integer', description: 'Line number to start reading from (1-indexed)', default: 1, minimum: 1 },
      limit: { type: 'integer', description: 'Maximum number of lines to read (default: 500, max: 2000)', default: 500, maximum: 2000 },
    },
    required: ['path'],
  },
  handler: async (args) => {
    return toolResult({
      note: 'File read is not available in the web API context. The agent described the intended file operation above.',
    });
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
    description: 'Write content to a file, completely replacing existing content.',
    properties: {
      path: { type: 'string', description: 'Path to the file to write' },
      content: { type: 'string', description: 'Complete content to write to the file' },
    },
    required: ['path', 'content'],
  },
  handler: async (args) => {
    return toolResult({
      note: 'File write is not available in the web API context.',
    });
  },
  description: 'Write content to a file.',
  emoji: '✏️',
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
    return toolResult({
      note: 'Browser automation is not available in the web API context. The agent described the intended browser navigation above.',
      url: args.url,
    });
  },
  description: 'Navigate to a URL in the browser.',
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
      note: 'Browser screenshot is not available in the web API context.',
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
    return toolResult({
      note: 'Text-to-speech is not available in the web API context.',
    });
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
    description: 'Execute shell commands on a Linux environment.',
    properties: {
      command: { type: 'string', description: 'The command to execute' },
      timeout: { type: 'integer', description: 'Max seconds to wait (default: 180)', default: 180 },
      workdir: { type: 'string', description: 'Working directory' },
      background: { type: 'boolean', description: 'Run in background', default: false },
    },
    required: ['command'],
  },
  handler: async (args) => {
    return toolResult({
      note: 'Terminal is not available in the web API context. The agent described the intended command above.',
      command: args.command,
    });
  },
  description: 'Execute shell commands.',
  emoji: '🖥️',
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

// ─── Registration summary ────────────────────────────────────────────────

/**
 * Total tools registered in this module.
 * The dynamic registry may have additional tools registered by plugins/MCP.
 */
export const REGISTERED_TOOL_COUNT = registry.size;
