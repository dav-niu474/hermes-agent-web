/**
 * Hermes Agent Core — Embedded Agent System
 *
 * This module contains the complete hermes-agent system rewritten in TypeScript
 * for the Next.js backend. No separate hermes-agent server needed.
 *
 * Architecture:
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │                    Next.js API Routes                     │
 *   │  /api/chat  /api/tools  /api/skills  /api/memory  /api/models │
 *   └──────────────────────────┬──────────────────────────────────┘
   │                             │
 *   │              ┌──────────▼──────────┐
 *   │              │   Agent Loop (Core)   │
 *   │              │  agent-loop.ts       │
 *   │              └──┬─────────┬───────┘
 *   │                 │         │
 *   │        ┌────────▼──┐  ┌──▼──────────┐
 *   │        │  Provider  │  │   Tool      │
 *   │        │ provider.ts │  │ Registry   │
 *   │        └───────────┘  │ tool-registry│
   │                         └──────┬──────┘
   │                                │
   │        ┌───────────┐  ┌──────▼──────┐
   │        │  Skills   │  │   Memory    │
   │        │ skills.ts │  │  memory.ts  │
   │        └───────────┘  └─────────────┘
   │
 *        ┌───────────┐  ┌───────────┐
   │        │  Config  │  │ Toolsets │
   │        │ config.ts │  │toolsets.ts│
   │        └───────────┘  └───────────┘
   │
 *        ┌──────────────┐
 *   │  Prompt Builder  │
 *   │ prompt-builder.ts │
 *   └────────────────┘
   └──────────────────────────────────────────────────────────
 *
 * All modules are server-side only ('use server' or used in API routes).
 */

// Core agent loop — the heart of hermes-agent
export { AgentLoop, IterationBudget } from "./agent-loop";
export type {
  AgentConfig,
  AgentMessage,
  AgentResult,
  ToolCall,
  SSEEvent,
  TokenUsage,
  ToolContext,
  ToolHandler,
  ToolRegistry as ToolRegistryInterface,
  MemoryManager as MemoryManagerInterface,
} from "./agent-loop";

// Provider abstraction — unified LLM interface
export {
  resolveProvider,
  resolveChatProvider,
  Provider,
  NvidiaProvider,
  OpenAIProvider,
  OpenRouterProvider,
  AnthropicProvider,
  GoogleProvider,
  GlmProvider,
  consumeStream,
  mergeReasoningContent,
  type CompletionResponse,
  type CompletionOptions,
  type StreamChunk,
  type ToolDef,
  type Message,
  type ToolCall as ProviderToolCall,
} from "./provider";

// Configuration management
export { getHermesHome, loadConfig, getConfigValue, updateConfig, getLLMConfig, getToolsetFilter } from "./config";
export type { LLMConfig, HermesConfig, ToolsetFilter } from "./config";

// Tool registry — dynamic tool registration and dispatch
export { ToolRegistry, toolError, toolResult } from "./tool-registry";
export type { ToolEntry, ToolContext as RegistryToolContext } from "./tool-registry";

// Toolset system — tool grouping and resolution
export {
  TOOLSETS,
  HERMES_CORE_TOOLS,
  resolveToolset,
  resolveMultipleToolsets,
  getToolsetInfo,
  getToolsetNames,
  getAllToolsets,
  validateToolset,
  createCustomToolset,
  getToolset,
  setPluginToolsetResolver,
} from "./toolsets";
export type { ToolsetDefinition, ResolvedToolsetInfo, ToolsetInfo } from "./toolsets";

// Skills system — skill scanning and management
export { scanSkills, getSkillContent, manageSkill, buildSkillsSystemPrompt, parseFrontmatter } from "./skills";
export type { SkillInfo, LinkedFile } from "./skills";

// Memory system — persistent memory across sessions
export { MemoryManager, buildMemoryContextBlock } from "./memory";
export type { MemoryData, MemoryEntry } from "./memory";

// System prompt builder — hermes-agent prompt assembly
export {
  DEFAULT_AGENT_IDENTITY,
  MEMORY_GUIDANCE,
  SESSION_SEARCH_GUIDANCE,
  SKILLS_GUIDANCE,
  TOOL_USE_ENFORCEMENT_GUIDANCE,
  TOOL_USE_ENFORCEMENT_MODELS,
  OPENAI_MODEL_EXECUTION_GUIDANCE,
  GOOGLE_MODEL_OPERATIONAL_GUIDANCE,
  PLATFORM_HINTS,
  buildSystemPrompt,
} from "./prompt-builder";

// Static tool definitions (for UI display — extracted from Python source)
export {
  ALL_TOOLS,
  ALL_TOOLSETS,
  CATEGORIES,
  getToolByName,
  getToolsByToolset,
  getToolsByCategory,
  getToolsets,
} from "./tools-registry";
export type {
  ToolDefinition,
  ToolsetDefinition as StaticToolsetDefinition,
  CategoryMeta,
} from "./tools-registry";
