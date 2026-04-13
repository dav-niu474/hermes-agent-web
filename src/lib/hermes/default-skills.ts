/**
 * Default Skills — Core hermes-agent capabilities
 *
 * Exports an array of built-in skill definitions with SKILL.md content.
 * These are the fundamental skills that ship with hermes-agent and are
 * always available regardless of which skill directories are discovered.
 *
 * Used by the skills system to provide a baseline of capabilities even
 * when no external skill directories are found.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DefaultSkill {
  /** Unique skill identifier */
  name: string;
  /** Category grouping */
  category: string;
  /** Short description for skill listings */
  description: string;
  /** Skill version */
  version: string;
  /** Tags for discovery and filtering */
  tags: string[];
  /** Full SKILL.md content (YAML frontmatter + instructions) */
  content: string;
}

// ─── Skills Data ────────────────────────────────────────────────────────────

export const DEFAULT_SKILLS: DefaultSkill[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // Web Search
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'web-search',
    category: 'productivity',
    description: 'Search the web for information retrieval, news, documentation, and research.',
    version: '1.0.0',
    tags: ['web', 'search', 'research', 'information', 'browser'],
    content: `---
name: web-search
description: Search the web for information retrieval, news, documentation, and research.
tags: [web, search, research, information]
---

# Web Search

Search the web for up-to-date information on any topic. Returns relevant results with titles, URLs, and descriptions.

## When to Use

- Looking up current information, news, or events
- Finding documentation for libraries, APIs, or tools
- Researching a topic before providing an answer
- Verifying facts or getting the latest data
- Finding URLs for further reading

## Instructions

1. Use \`web_search(query)\` to search for information.
2. Keep queries specific and well-formed for best results.
3. Review the returned results for relevance before sharing with the user.
4. For detailed content extraction from a URL, use \`web_extract(urls)\` instead.
5. If search results are insufficient, try refining the query with different keywords.
6. For technical documentation searches, include relevant technology names and version numbers.

## Tips

- Use quotation marks for exact phrase searches (e.g., "React 19 features")
- Include "how to" or "tutorial" for learning-oriented queries
- Add "documentation" or "API reference" for developer-focused results
- Use \`web_extract\` to get full content from promising URLs
`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Code Execution
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'code-execution',
    category: 'software-development',
    description: 'Execute Python code in a sandboxed environment with tool access.',
    version: '1.0.0',
    tags: ['code', 'execution', 'python', 'sandbox', 'programming'],
    content: `---
name: code-execution
description: Execute Python code in a sandboxed environment with tool access.
tags: [code, execution, python, sandbox, programming]
---

# Code Execution

Run Python scripts that can call Hermes tools programmatically. Useful for complex multi-step operations, data processing, and conditional logic.

## When to Use

- Processing or filtering large tool outputs before they enter context
- Needing 3+ tool calls with processing logic between them
- Conditional branching (if X then Y else Z)
- Looping (fetch N pages, process N files, retry on failure)
- Mathematical computations, data transformations, or analysis

## When NOT to Use

- Single tool call with no processing — just call the tool directly
- You need to see the full result and apply complex reasoning
- The task requires interactive user input

## Instructions

1. Use \`execute_code(code)\` with a Python script as the code parameter.
2. Import tools: \`from hermes_tools import web_search, terminal\`
3. Print your final result to stdout.
4. Helpers available: \`json_parse(text)\`, \`shell_quote(s)\`, \`retry(fn, max_attempts=3)\`

## Limits

- 5-minute timeout
- 50KB stdout cap
- Max 50 tool calls per script
- terminal() is foreground-only (no background or pty)
`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // File Operations
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'file-operations',
    category: 'software-development',
    description: 'Read, write, search, and patch files on the filesystem.',
    version: '1.0.0',
    tags: ['files', 'read', 'write', 'search', 'filesystem'],
    content: `---
name: file-operations
description: Read, write, search, and patch files on the filesystem.
tags: [files, read, write, search, filesystem]
---

# File Operations

Read, write, search, and edit files. Use these tools instead of terminal commands like cat, head, tail, grep, find, sed, or awk.

## Available Tools

- \`read_file(path, offset?, limit?)\` — Read file with line numbers. Max 100K chars per read.
- \`write_file(path, content)\` — Write/overwrite a file. Creates parent dirs automatically.
- \`patch(mode, ...)\` — Targeted find-and-replace or V4A multi-file patches.
- \`search_files(pattern, target, ...)\` — Regex content search or glob file search.

## Instructions

1. **Read before write**: Always read a file before editing to understand its structure.
2. **Use patch for edits**: Use \`patch(mode="replace", old_string, new_string)\` instead of rewriting entire files.
3. **Search efficiently**: Use \`search_files(target="files", pattern="*.ts")\` instead of ls.
4. **Large files**: Use \`offset\` and \`limit\` to read specific sections.
5. **Unique matches**: Ensure \`old_string\` in patch is unique, or use \`replace_all=true\`.

## Do NOT

- Use cat/head/tail to read files — use read_file
- Use grep/rg/find to search — use search_files
- Use sed/awk to edit — use patch
- Use echo/cat heredoc to create files — use write_file
`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Memory
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'memory',
    category: 'productivity',
    description: 'Agent memory management — save, recall, and organize persistent knowledge.',
    version: '1.0.0',
    tags: ['memory', 'persistence', 'knowledge', 'context', 'preferences'],
    content: `---
name: memory
description: Agent memory management — save, recall, and organize persistent knowledge.
tags: [memory, persistence, knowledge, context, preferences]
---

# Memory Management

Save durable information to persistent memory that survives across sessions. Memory is injected into every turn, so keep it compact and focused.

## When to Save (do this proactively)

- User corrects you or says "remember this" / "don't do that again"
- User shares a preference, habit, or personal detail (name, role, timezone, coding style)
- You discover something about the environment (OS, installed tools, project structure)
- You learn a convention, API quirk, or workflow specific to this user's setup
- You identify a stable fact that will be useful again in future sessions

## When NOT to Save

- Task progress, session outcomes, or completed-work logs
- Temporary TODO state — use the todo tool instead
- Information the user explicitly said not to remember

## Actions

- \`memory(action="add", target="memory"|"user", content="...")\` — Add new entry
- \`memory(action="replace", target="memory"|"user", old_text="...", new_content="...")\` — Replace existing
- \`memory(action="remove", target="memory"|"user", old_text="...")\` — Remove entry
- \`memory(action="read")\` — Read all memory entries

## Priority

User preferences and corrections > environment facts > procedural knowledge.

## Tips

- Keep entries concise — memory is injected into every system prompt
- Use "user" target for user-specific info, "memory" for environment/tool facts
- After complex tasks, proactively save useful discoveries
`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Skill Manager
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'skill-manager',
    category: 'productivity',
    description: 'Create, edit, and delete skills - the agent self-evolution capability.',
    version: '1.0.0',
    tags: ['skills', 'create', 'edit', 'delete', 'self-improvement'],
    content: `---
name: skill-manager
description: Create, edit, and delete skills — the agent's self-evolution capability.
tags: [skills, create, edit, delete, self-improvement]
---

# Skill Manager

Manage skills (create, update, delete). Skills are your procedural memory — reusable approaches for recurring task types.

## When to Create a Skill

- Complex task succeeded (5+ tool calls)
- Errors were overcome with a non-obvious approach
- User corrected your approach and it worked better
- You discovered a non-trivial workflow worth repeating
- User asks you to remember a procedure

## When to Update a Skill

- Instructions are stale or contain wrong commands
- You hit OS-specific failures not covered by the skill
- Missing steps or pitfalls found during use
- If you used a skill and hit issues not covered by it, patch it immediately

## Actions

- \`skill_manage(action="create", name, category?, content)\` — Create new skill
- \`skill_manage(action="patch", name, old_string, new_string)\` — Targeted fix (preferred)
- \`skill_manage(action="edit", name, content)\` — Full rewrite (major overhauls only)
- \`skill_manage(action="delete", name)\` — Remove a skill

## Good Skill Structure

1. Trigger conditions — when should this skill be used
2. Numbered steps with exact commands
3. Pitfalls section — common errors and solutions
4. Verification steps — how to confirm it worked

## Tips

- Always confirm with user before creating or deleting skills
- Use patch over edit for small fixes — it's safer and preserves context
- After difficult tasks, offer to save as a skill
- Skip saving simple one-off tasks
`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Todo
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'todo',
    category: 'productivity',
    description: 'Task management — plan, track, and complete multi-step tasks.',
    version: '1.0.0',
    tags: ['todo', 'tasks', 'planning', 'tracking', 'management'],
    content: `---
name: todo
description: Task management — plan, track, and complete multi-step tasks.
tags: [todo, tasks, planning, tracking, management]
---

# Task Management (Todo)

Manage your task list for the current session. Use for complex tasks with 3+ steps or when the user provides multiple tasks.

## When to Use

- User gives you a multi-step task
- You need to break down a complex goal into actionable steps
- Tracking progress on a long-running operation
- User provides a list of items to work through

## Actions

- \`todo()\` — Read the current task list
- \`todo(todos=[...], merge=false)\` — Replace entire list
- \`todo(todos=[...], merge=true)\` — Update items by id, add new ones

## Item Format

Each item: \`{id: string, content: string, status: "pending"|"in_progress"|"completed"|"cancelled"}\`

- List order is priority
- Only ONE item should be in_progress at a time
- Mark items completed immediately when done
- If something fails, cancel it and add a revised item

## Instructions

1. When starting a multi-step task, create a plan with clear items
2. Set the first item to in_progress and work on it
3. As you complete each item, mark it completed and move to the next
4. Use merge=true to update status of existing items
5. Return the current list to show progress
`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Terminal
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'terminal',
    category: 'software-development',
    description: 'Execute shell commands for builds, installs, git, and system operations.',
    version: '1.0.0',
    tags: ['terminal', 'shell', 'command', 'cli', 'system'],
    content: `---
name: terminal
description: Execute shell commands for builds, installs, git, and system operations.
tags: [terminal, shell, command, cli, system]
---

# Terminal / Shell Commands

Execute shell commands in a Linux environment. Reserve terminal for operations that genuinely need a shell.

## When to Use Terminal

- Building and compiling code
- Installing packages and dependencies
- Git operations (commit, push, pull, branch, merge)
- Running scripts and test suites
- Process management (ps, kill, top)
- Network operations (curl, ping, netstat)
- Package manager operations (npm, pip, apt, brew)

## When NOT to Use Terminal

- Reading files — use read_file
- Searching files — use search_files
- Editing files — use patch or write_file
- Listing directories — use search_files(target="files")

## Instructions

1. Use \`terminal(command, timeout?)\` for foreground commands.
2. Use \`terminal(command, background=true)\` for long-running processes.
3. Use \`process(action="list"|"poll"|"log"|"wait"|"kill")\` to manage background processes.
4. Set \`timeout=300\` for long builds — it returns instantly when done.
5. Use \`workdir\` for per-command working directory.
6. Use \`pty=true\` for interactive CLI tools.

## Tips

- Don't use vim/nano without pty=true — they hang
- Pipe git output to \`cat\` if it might page
- Use non-interactive flags (-y, --yes) when possible
`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Image Generation
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'image-generation',
    category: 'creative',
    description: 'Generate high-quality images from text prompts using AI.',
    version: '1.0.0',
    tags: ['image', 'generation', 'ai', 'art', 'creative'],
    content: `---
name: image-generation
description: Generate high-quality images from text prompts using AI.
tags: [image, generation, ai, art, creative]
---

# Image Generation

Generate high-quality images from text prompts using FLUX 2 Pro model with automatic 2x upscaling.

## When to Use

- User requests an image, illustration, or artwork
- Creating visual content for presentations or documents
- Generating diagrams, logos, or design concepts
- Visual storytelling or concept art

## Instructions

1. Use \`image_generate(prompt, aspect_ratio?)\` to generate an image.
2. Be detailed and descriptive in prompts for best results.
3. Choose aspect ratio: "landscape" (16:9), "square" (1:1), or "portrait" (16:9 tall).
4. Display the result using markdown: \`![description](URL)\`

## Prompt Tips

- Include style descriptors: "watercolor painting", "photorealistic", "vector illustration"
- Specify composition: "centered subject", "rule of thirds", "close-up shot"
- Add mood/atmosphere: "warm lighting", "dramatic shadows", "pastel colors"
- Be specific about subject details: "red-haired woman in blue dress"
`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TTS
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'tts',
    category: 'creative',
    description: 'Convert text to speech audio for voice messages and audio output.',
    version: '1.0.0',
    tags: ['tts', 'speech', 'audio', 'voice', 'text-to-speech'],
    content: `---
name: tts
description: Convert text to speech audio for voice messages and audio output.
tags: [tts, speech, audio, voice, text-to-speech]
---

# Text-to-Speech (TTS)

Convert text to speech audio. Returns a MEDIA: path that the platform delivers as a voice message.

## When to Use

- User asks for a voice message or audio version of text
- Creating audio content for messaging platforms (Telegram, Discord, WhatsApp)
- Reading long content aloud
- Generating voice memos

## Instructions

1. Use \`text_to_speech(text, output_path?)\` to generate audio.
2. Keep text under 4000 characters.
3. The voice and provider are user-configured, not model-selected.
4. On Telegram, audio plays as a voice bubble.
5. On Discord/WhatsApp, audio is sent as an attachment.

## Tips

- Write naturally — avoid excessive abbreviations or technical jargon
- Break very long text into multiple TTS calls for better quality
- Use punctuation to control pacing (commas for short pauses, periods for longer)
`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Web Browser
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'web-browser',
    category: 'productivity',
    description: 'Browse web pages, interact with forms, take screenshots, and automate browsers.',
    version: '1.0.0',
    tags: ['browser', 'web', 'automation', 'interaction', 'navigation'],
    content: `---
name: web-browser
description: Browse web pages, interact with forms, take screenshots, and automate browsers.
tags: [browser, web, automation, interaction, navigation]
---

# Web Browser

Interact with web pages through a browser automation tool. Navigate, click, type, scroll, and take screenshots.

## When to Use Browser vs Web Search

- Use \`web_search\` or \`web_extract\` for simple information retrieval (faster, cheaper)
- Use browser tools when you need to: interact with a page, click buttons, fill forms, handle dynamic content, or see visual layout

## Available Actions

- \`browser_navigate(url)\` — Navigate to a URL (returns compact snapshot)
- \`browser_snapshot(full?)\` — Get page accessibility tree
- \`browser_click(ref)\` — Click an element (e.g., @e5)
- \`browser_type(ref, text)\` — Type into an input field
- \`browser_scroll(direction)\` — Scroll up or down
- \`browser_back()\` — Go back in history
- \`browser_press(key)\` — Press keyboard keys
- \`browser_close()\` — Close browser session
- \`browser_vision(question?)\` — Screenshot + AI analysis

## Instructions

1. Always call \`browser_navigate(url)\` first to initialize the session.
2. The snapshot returns interactive elements with ref IDs (like @e1, @e2).
3. Use ref IDs with browser_click and browser_type.
4. Call \`browser_close()\` when done to free resources.

## Tips

- browser_navigate already returns a compact snapshot — no need for browser_snapshot immediately after
- Use browser_vision for visual verification or CAPTCHA solving
- Close the browser when done to free cloud browser session quota
`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Clipboard
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'clipboard',
    category: 'productivity',
    description: 'Read and write system clipboard content.',
    version: '1.0.0',
    tags: ['clipboard', 'copy', 'paste', 'system', 'utility'],
    content: `---
name: clipboard
description: Read and write system clipboard content.
tags: [clipboard, copy, paste, system, utility]
---

# Clipboard Operations

Read and write the system clipboard. Useful for transferring content between the agent and user's local environment.

## When to Use

- User wants to copy something to their clipboard
- User asks you to read what's currently copied
- Transferring data between tools and the user's environment
- Sharing code snippets, URLs, or text that the user needs

## Instructions

1. Use the clipboard tool to read or write clipboard content.
2. When writing to clipboard, the content is placed in the user's system clipboard.
3. When reading from clipboard, you get the current clipboard content.
4. Clipboard content is text-only (no images or binary data).

## Tips

- Always confirm before overwriting clipboard content
- Large clipboard operations may fail — keep content reasonable in size
- Clipboard state may be lost if the session ends
`,
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Get a default skill by name */
export function getDefaultSkill(name: string): DefaultSkill | undefined {
  return DEFAULT_SKILLS.find((s) => s.name === name);
}

/** Get all default skill names */
export function getDefaultSkillNames(): string[] {
  return DEFAULT_SKILLS.map((s) => s.name);
}

/** Get default skills by category */
export function getDefaultSkillsByCategory(category: string): DefaultSkill[] {
  return DEFAULT_SKILLS.filter((s) => s.category === category);
}

/** Get all default skill categories */
export function getDefaultSkillCategories(): string[] {
  return Array.from(new Set(DEFAULT_SKILLS.map((s) => s.category)));
}
