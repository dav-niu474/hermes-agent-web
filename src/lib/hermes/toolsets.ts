'use server';

/**
 * Toolset System
 *
 * TypeScript rewrite of hermes-agent/toolsets.py — a flexible system for
 * defining and managing tool aliases / toolsets.  Toolsets group tools
 * together for specific scenarios and can be composed from individual tools
 * or other toolsets (with recursive resolution and cycle detection).
 *
 * Companion file: `tool-registry.ts` provides the dynamic tool registry.
 *
 * Features:
 *   - Define custom toolsets with specific tools
 *   - Compose toolsets from other toolsets (recursive resolution)
 *   - Built-in common toolsets for typical use cases
 *   - Cycle detection via visited-set tracking
 *   - Dynamic toolset creation at runtime via `createCustomToolset()`
 */

import type { ToolsetInfo } from './tool-registry';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Definition of a single toolset (mirrors Python's TOOLSETS dict values). */
export interface ToolsetDefinition {
  description: string;
  tools: string[];
  includes: string[];
}

/** Detailed info returned by `getToolsetInfo()`. */
export interface ResolvedToolsetInfo extends ToolsetInfo {
  name: string;
  direct_tools: string[];
  includes: string[];
  resolved_tools: string[];
  tool_count: number;
  is_composite: boolean;
}

// ---------------------------------------------------------------------------
// _HERMES_CORE_TOOLS — shared tool list for CLI and messaging platforms
// ---------------------------------------------------------------------------

/**
 * Core tools shared by all hermes-* platform toolsets.
 * Edit this once to update all platforms simultaneously.
 */
export const HERMES_CORE_TOOLS: readonly string[] = [
  // Web
  'web_search', 'web_extract',
  // Terminal + process management
  'terminal', 'process',
  // File manipulation
  'read_file', 'write_file', 'patch', 'search_files',
  // Vision + image generation
  'vision_analyze', 'image_generate',
  // Skills
  'skills_list', 'skill_view', 'skill_manage',
  // Browser automation
  'browser_navigate', 'browser_snapshot', 'browser_click',
  'browser_type', 'browser_scroll', 'browser_back',
  'browser_press', 'browser_get_images',
  'browser_vision', 'browser_console',
  // Text-to-speech
  'text_to_speech',
  // Planning & memory
  'todo', 'memory',
  // Session history search
  'session_search',
  // Clarifying questions
  'clarify',
  // Code execution + delegation
  'execute_code', 'delegate_task',
  // Cronjob management
  'cronjob',
  // Cross-platform messaging (gated on gateway running via check_fn)
  'send_message',
  // Home Assistant smart home control (gated on HASS_TOKEN via check_fn)
  'ha_list_entities', 'ha_get_state', 'ha_list_services', 'ha_call_service',
];

// ---------------------------------------------------------------------------
// TOOLSETS — core toolset definitions
// ---------------------------------------------------------------------------

/**
 * All statically-defined toolsets.
 *
 * These can include individual tools or reference other toolsets
 * via the `includes` field (resolved recursively by `resolveToolset()`).
 */
export const TOOLSETS: Record<string, ToolsetDefinition> = {
  // =========================================================================
  // Basic toolsets — individual tool categories
  // =========================================================================

  web: {
    description: 'Web research and content extraction tools',
    tools: ['web_search', 'web_extract'],
    includes: [],
  },

  search: {
    description: 'Web search only (no content extraction/scraping)',
    tools: ['web_search'],
    includes: [],
  },

  vision: {
    description: 'Image analysis and vision tools',
    tools: ['vision_analyze'],
    includes: [],
  },

  image_gen: {
    description: 'Creative generation tools (images)',
    tools: ['image_generate'],
    includes: [],
  },

  terminal: {
    description: 'Terminal/command execution and process management tools',
    tools: ['terminal', 'process'],
    includes: [],
  },

  moa: {
    description: 'Advanced reasoning and problem-solving tools',
    tools: ['mixture_of_agents'],
    includes: [],
  },

  skills: {
    description: 'Access, create, edit, and manage skill documents with specialized instructions and knowledge',
    tools: ['skills_list', 'skill_view', 'skill_manage'],
    includes: [],
  },

  browser: {
    description: 'Browser automation for web interaction (navigate, click, type, scroll, iframes, hold-click) with web search for finding URLs',
    tools: [
      'browser_navigate', 'browser_snapshot', 'browser_click',
      'browser_type', 'browser_scroll', 'browser_back',
      'browser_press', 'browser_get_images',
      'browser_vision', 'browser_console', 'web_search',
    ],
    includes: [],
  },

  cronjob: {
    description: 'Cronjob management tool - create, list, update, pause, resume, remove, and trigger scheduled tasks',
    tools: ['cronjob'],
    includes: [],
  },

  messaging: {
    description: 'Cross-platform messaging: send messages to Telegram, Discord, Slack, SMS, etc.',
    tools: ['send_message'],
    includes: [],
  },

  rl: {
    description: 'RL training tools for running reinforcement learning on Tinker-Atropos',
    tools: [
      'rl_list_environments', 'rl_select_environment',
      'rl_get_current_config', 'rl_edit_config',
      'rl_start_training', 'rl_check_status',
      'rl_stop_training', 'rl_get_results',
      'rl_list_runs', 'rl_test_inference',
    ],
    includes: [],
  },

  file: {
    description: 'File manipulation tools: read, write, patch (with fuzzy matching), and search (content + files)',
    tools: ['read_file', 'write_file', 'patch', 'search_files'],
    includes: [],
  },

  tts: {
    description: 'Text-to-speech: convert text to audio with Edge TTS (free), ElevenLabs, or OpenAI',
    tools: ['text_to_speech'],
    includes: [],
  },

  todo: {
    description: 'Task planning and tracking for multi-step work',
    tools: ['todo'],
    includes: [],
  },

  memory: {
    description: 'Persistent memory across sessions (personal notes + user profile)',
    tools: ['memory'],
    includes: [],
  },

  session_search: {
    description: 'Search and recall past conversations with summarization',
    tools: ['session_search'],
    includes: [],
  },

  clarify: {
    description: 'Ask the user clarifying questions (multiple-choice or open-ended)',
    tools: ['clarify'],
    includes: [],
  },

  code_execution: {
    description: 'Run Python scripts that call tools programmatically (reduces LLM round trips)',
    tools: ['execute_code'],
    includes: [],
  },

  delegation: {
    description: 'Spawn subagents with isolated context for complex subtasks',
    tools: ['delegate_task'],
    includes: [],
  },

  // "honcho" toolset removed — Honcho is now a memory provider plugin.
  // Tools are injected via MemoryManager, not the toolset system.

  homeassistant: {
    description: 'Home Assistant smart home control and monitoring',
    tools: ['ha_list_entities', 'ha_get_state', 'ha_list_services', 'ha_call_service'],
    includes: [],
  },

  // =========================================================================
  // Scenario-specific toolsets
  // =========================================================================

  debugging: {
    description: 'Debugging and troubleshooting toolkit',
    tools: ['terminal', 'process'],
    includes: ['web', 'file'],
  },

  safe: {
    description: 'Safe toolkit without terminal access',
    tools: [],
    includes: ['web', 'vision', 'image_gen'],
  },

  // =========================================================================
  // Full Hermes toolsets (CLI + messaging platforms)
  //
  // All platforms share the same core tools (including send_message,
  // which is gated on gateway running via its check_fn).
  // =========================================================================

  'hermes-acp': {
    description: 'Editor integration (VS Code, Zed, JetBrains) — coding-focused tools without messaging, audio, or clarify UI',
    tools: [
      'web_search', 'web_extract',
      'terminal', 'process',
      'read_file', 'write_file', 'patch', 'search_files',
      'vision_analyze',
      'skills_list', 'skill_view', 'skill_manage',
      'browser_navigate', 'browser_snapshot', 'browser_click',
      'browser_type', 'browser_scroll', 'browser_back',
      'browser_press', 'browser_get_images',
      'browser_vision', 'browser_console',
      'todo', 'memory',
      'session_search',
      'execute_code', 'delegate_task',
    ],
    includes: [],
  },

  'hermes-api-server': {
    description: 'OpenAI-compatible API server — full agent tools accessible via HTTP (no interactive UI tools like clarify or send_message)',
    tools: [
      // Web
      'web_search', 'web_extract',
      // Terminal + process management
      'terminal', 'process',
      // File manipulation
      'read_file', 'write_file', 'patch', 'search_files',
      // Vision + image generation
      'vision_analyze', 'image_generate',
      // Skills
      'skills_list', 'skill_view', 'skill_manage',
      // Browser automation
      'browser_navigate', 'browser_snapshot', 'browser_click',
      'browser_type', 'browser_scroll', 'browser_back',
      'browser_press', 'browser_get_images',
      'browser_vision', 'browser_console',
      // Planning & memory
      'todo', 'memory',
      // Session history search
      'session_search',
      // Code execution + delegation
      'execute_code', 'delegate_task',
      // Cronjob management
      'cronjob',
      // Home Assistant smart home control (gated on HASS_TOKEN via check_fn)
      'ha_list_entities', 'ha_get_state', 'ha_list_services', 'ha_call_service',
    ],
    includes: [],
  },

  'hermes-cli': {
    description: 'Full interactive CLI toolset - all default tools plus cronjob management',
    tools: [...HERMES_CORE_TOOLS],
    includes: [],
  },

  'hermes-telegram': {
    description: 'Telegram bot toolset - full access for personal use (terminal has safety checks)',
    tools: [...HERMES_CORE_TOOLS],
    includes: [],
  },

  'hermes-discord': {
    description: 'Discord bot toolset - full access (terminal has safety checks via dangerous command approval)',
    tools: [...HERMES_CORE_TOOLS],
    includes: [],
  },

  'hermes-whatsapp': {
    description: 'WhatsApp bot toolset - similar to Telegram (personal messaging, more trusted)',
    tools: [...HERMES_CORE_TOOLS],
    includes: [],
  },

  'hermes-slack': {
    description: 'Slack bot toolset - full access for workspace use (terminal has safety checks)',
    tools: [...HERMES_CORE_TOOLS],
    includes: [],
  },

  'hermes-signal': {
    description: 'Signal bot toolset - encrypted messaging platform (full access)',
    tools: [...HERMES_CORE_TOOLS],
    includes: [],
  },

  'hermes-homeassistant': {
    description: 'Home Assistant bot toolset - smart home event monitoring and control',
    tools: [...HERMES_CORE_TOOLS],
    includes: [],
  },

  'hermes-email': {
    description: 'Email bot toolset - interact with Hermes via email (IMAP/SMTP)',
    tools: [...HERMES_CORE_TOOLS],
    includes: [],
  },

  'hermes-mattermost': {
    description: 'Mattermost bot toolset - self-hosted team messaging (full access)',
    tools: [...HERMES_CORE_TOOLS],
    includes: [],
  },

  'hermes-matrix': {
    description: 'Matrix bot toolset - decentralized encrypted messaging (full access)',
    tools: [...HERMES_CORE_TOOLS],
    includes: [],
  },

  'hermes-dingtalk': {
    description: 'DingTalk bot toolset - enterprise messaging platform (full access)',
    tools: [...HERMES_CORE_TOOLS],
    includes: [],
  },

  'hermes-feishu': {
    description: 'Feishu/Lark bot toolset - enterprise messaging via Feishu/Lark (full access)',
    tools: [...HERMES_CORE_TOOLS],
    includes: [],
  },

  'hermes-wecom': {
    description: 'WeCom bot toolset - enterprise WeChat messaging (full access)',
    tools: [...HERMES_CORE_TOOLS],
    includes: [],
  },

  'hermes-sms': {
    description: 'SMS bot toolset - interact with Hermes via SMS (Twilio)',
    tools: [...HERMES_CORE_TOOLS],
    includes: [],
  },

  'hermes-webhook': {
    description: 'Webhook toolset - receive and process external webhook events',
    tools: [...HERMES_CORE_TOOLS],
    includes: [],
  },

  'hermes-gateway': {
    description: 'Gateway toolset - union of all messaging platform tools',
    tools: [],
    includes: [
      'hermes-telegram', 'hermes-discord', 'hermes-whatsapp',
      'hermes-slack', 'hermes-signal', 'hermes-homeassistant',
      'hermes-email', 'hermes-sms', 'hermes-mattermost',
      'hermes-matrix', 'hermes-dingtalk', 'hermes-feishu',
      'hermes-wecom', 'hermes-webhook',
    ],
  },
};

// ---------------------------------------------------------------------------
// Plugin toolset bridge
// ---------------------------------------------------------------------------

/**
 * Optional registry reference for plugin-provided toolsets.
 *
 * In Python, this calls `from tools.registry import registry` to discover
 * toolsets that plugins registered at load time.  In TypeScript, the caller
 * can set this via `setPluginToolsetResolver()` to provide the same bridge.
 */
let pluginToolsetResolver: (() => Map<string, string[]>) | null = null;

/**
 * Set the plugin toolset resolver function.
 *
 * The resolver should return a Map of `{toolsetName: [tool_names...]}` for
 * any toolsets registered by plugins that aren't in the static `TOOLSETS` dict.
 */
export function setPluginToolsetResolver(
  resolver: (() => Map<string, string[]>) | null,
): void {
  pluginToolsetResolver = resolver;
}

function getPluginToolsetNames(): Set<string> {
  if (!pluginToolsetResolver) return new Set();
  try {
    const pluginToolsets = pluginToolsetResolver();
    return new Set(
      Array.from(pluginToolsets.keys()).filter((name) => !(name in TOOLSETS)),
    );
  } catch {
    return new Set();
  }
}

function getPluginToolsetTools(name: string): string[] {
  if (!pluginToolsetResolver) return [];
  try {
    const pluginToolsets = pluginToolsetResolver();
    return pluginToolsets.get(name) ?? [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Resolution functions
// ---------------------------------------------------------------------------

/**
 * Recursively resolve a toolset to get all tool names.
 *
 * Handles toolset composition by recursively resolving included toolsets
 * and combining all tools.  Cycle detection uses a visited-set — diamond
 * dependencies are safely handled (tools are only collected once).
 *
 * Special aliases:
 *   - `"all"` or `"*"` → resolves every registered toolset
 */
export function resolveToolset(
  name: string,
  visited?: Set<string>,
): string[] {
  const v = visited ?? new Set<string>();

  // Special aliases that represent all tools across every toolset.
  // Uses a fresh visited set per branch to avoid cross-branch contamination.
  if (name === 'all' || name === '*') {
    const allTools = new Set<string>();
    for (const toolsetName of getToolsetNames()) {
      const resolved = resolveToolset(toolsetName, new Set(v));
      for (const t of resolved) allTools.add(t);
    }
    return Array.from(allTools);
  }

  // Check for cycles / already-resolved (diamond deps).
  // Silently return [] — either this is a diamond (not a bug, tools already
  // collected via another path) or a genuine cycle (safe to skip).
  if (v.has(name)) return [];

  v.add(name);

  // Get toolset definition
  const toolset = TOOLSETS[name];
  if (!toolset) {
    // Fall back to plugin registry
    if (getPluginToolsetNames().has(name)) {
      return getPluginToolsetTools(name);
    }
    return [];
  }

  // Collect direct tools
  const tools = new Set<string>(toolset.tools);

  // Recursively resolve included toolsets, sharing the visited set across
  // sibling includes so diamond dependencies are only resolved once.
  for (const includedName of toolset.includes) {
    const includedTools = resolveToolset(includedName, v);
    for (const t of includedTools) tools.add(t);
  }

  return Array.from(tools);
}

/**
 * Resolve multiple toolsets and combine their tools (deduplicated).
 */
export function resolveMultipleToolsets(toolsetNames: string[]): string[] {
  const allTools = new Set<string>();
  for (const name of toolsetNames) {
    const tools = resolveToolset(name);
    for (const t of tools) allTools.add(t);
  }
  return Array.from(allTools);
}

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

/**
 * Get a toolset definition by name.
 *
 * Returns null if the toolset is not found.
 */
export function getToolset(name: string): ToolsetDefinition | null {
  return TOOLSETS[name] ?? null;
}

/**
 * Get all available toolsets with their definitions.
 *
 * Includes both statically-defined toolsets and plugin-registered ones.
 */
export function getAllToolsets(): Record<string, ToolsetDefinition> {
  const result: Record<string, ToolsetDefinition> = { ...TOOLSETS };

  // Add plugin-provided toolsets (synthetic entries)
  for (const tsName of Array.from(getPluginToolsetNames())) {
    if (tsName in result) continue;
    const tools = getPluginToolsetTools(tsName);
    result[tsName] = {
      description: `Plugin toolset: ${tsName}`,
      tools,
      includes: [],
    };
  }

  return result;
}

/**
 * Get names of all available toolsets (excluding aliases).
 *
 * Includes plugin-registered toolset names.
 */
export function getToolsetNames(): string[] {
  const names = new Set<string>(Object.keys(TOOLSETS));
  for (const pluginName of Array.from(getPluginToolsetNames())) {
    names.add(pluginName);
  }
  return Array.from(names).sort();
}

/**
 * Check if a toolset name is valid.
 *
 * Accepts special alias names ("all", "*") for convenience.
 */
export function validateToolset(name: string): boolean {
  if (name === 'all' || name === '*') return true;
  if (name in TOOLSETS) return true;
  return getPluginToolsetNames().has(name);
}

/**
 * Get detailed information about a toolset including resolved tools.
 *
 * Returns null if the toolset is not found.
 */
export function getToolsetInfo(name: string): ResolvedToolsetInfo | null {
  const toolset = TOOLSETS[name];
  if (!toolset) {
    // Check plugin toolsets
    if (getPluginToolsetNames().has(name)) {
      const tools = getPluginToolsetTools(name);
      return {
        name,
        description: `Plugin toolset: ${name}`,
        direct_tools: tools,
        includes: [],
        resolved_tools: tools,
        tool_count: tools.length,
        is_composite: false,
        available: true,
        tools: tools,
        requirements: [],
      };
    }
    return null;
  }

  const resolvedTools = resolveToolset(name);

  return {
    name,
    description: toolset.description,
    direct_tools: toolset.tools,
    includes: toolset.includes,
    resolved_tools: resolvedTools,
    tool_count: resolvedTools.length,
    is_composite: toolset.includes.length > 0,
    // Default availability / requirements — real values come from ToolRegistry
    available: true,
    tools: toolset.tools,
    requirements: [],
  };
}

// ---------------------------------------------------------------------------
// Custom toolset creation
// ---------------------------------------------------------------------------

/**
 * Create a custom toolset at runtime.
 *
 * Adds or overwrites a toolset in the static TOOLSETS dict.
 * Note: This mutates the exported `TOOLSETS` object.
 */
export function createCustomToolset(
  name: string,
  description: string,
  tools: string[] = [],
  includes: string[] = [],
): void {
  TOOLSETS[name] = { description, tools, includes };
}
