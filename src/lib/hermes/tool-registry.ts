/**
 * Dynamic Tool Registry
 *
 * TypeScript rewrite of hermes-agent/tools/registry.py — the central registry
 * that collects tool schemas, handlers, and availability checks. Tool modules
 * call `registry.register()` at load time; consumers query definitions and
 * dispatch calls through the same singleton.
 *
 * Companion file: `toolsets.ts` provides toolset grouping / resolution.
 *
 * Design notes vs Python:
 *   - All handlers are async (Promise<string>) — no sync→async bridging needed
 *   - `checkFn` returns boolean or Promise<boolean>
 *   - `dispatch` is async and catches exceptions into JSON error strings
 */

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Context passed to every tool handler at dispatch time. */
export interface ToolContext {
  taskId?: string;
  sessionId?: string;
  userTask?: string;
  toolCallId?: string;
}

/** Metadata for a single registered tool (mirrors Python's ToolEntry). */
export interface ToolEntry {
  /** Unique tool name (e.g. "web_search") */
  name: string;
  /** Toolset this tool belongs to (e.g. "web", "terminal") */
  toolset: string;
  /** JSON Schema with name, description, parameters — used for OpenAI function calling */
  schema: Record<string, any>;
  /** Async handler that executes the tool */
  handler: (args: Record<string, any>, context: ToolContext) => Promise<string>;
  /** Optional availability check — tool is hidden from definitions if this returns false */
  checkFn?: () => boolean | Promise<boolean>;
  /** Environment variable names this tool requires (for UI display) */
  requiresEnv: string[];
  /** Human-readable description (falls back to schema.description) */
  description: string;
  /** Emoji icon for quick visual identification */
  emoji: string;
  /** Optional per-tool max result size in characters */
  maxResultSizeChars?: number;
}

/** OpenAI function-calling tool definition format. */
export interface OpenAIToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, any>;
    [key: string]: any;
  };
}

/** Info about a toolset returned by `getAvailableToolsets`. */
export interface ToolsetInfo {
  available: boolean;
  tools: string[];
  description: string;
  requirements: string[];
}

/** Info about an unavailable toolset returned by `checkToolAvailability`. */
export interface UnavailableToolset {
  name: string;
  env_vars: string[];
  tools: string[];
}

// ---------------------------------------------------------------------------
// Helper functions — tool response serialization
// ---------------------------------------------------------------------------

/**
 * Return a JSON error string for tool handlers.
 *
 * Mirrors Python's `tool_error()`:
 * ```
 * toolError("file not found")          → '{"error":"file not found"}'
 * toolError("bad input", code=404)     → '{"error":"bad input","code":404}'
 * ```
 */
export function toolError(
  message: string,
  extra?: Record<string, any>,
): string {
  const result: Record<string, any> = { error: String(message) };
  if (extra) {
    Object.assign(result, extra);
  }
  return JSON.stringify(result);
}

/**
 * Return a JSON result string for tool handlers.
 *
 * Mirrors Python's `tool_result()` — accepts either a dict positional arg
 * or keyword-style extra fields (not both at once):
 * ```
 * toolResult({ success: true, count: 42 })  → '{"success":true,"count":42}'
 * toolResult(success, true, count, 42)      — not supported in TS; pass an object
 * ```
 */
export function toolResult(data: Record<string, any> | null): string {
  if (data !== null && data !== undefined) {
    return JSON.stringify(data);
  }
  return JSON.stringify({});
}

// ---------------------------------------------------------------------------
// ToolRegistry class
// ---------------------------------------------------------------------------

/**
 * Singleton registry that collects tool schemas + handlers.
 *
 * Mirrors Python's `ToolRegistry` from `tools/registry.py`.  Each tool file
 * (or equivalent TS module) calls `register()` to declare its schema, handler,
 * toolset membership, and availability check.
 */
export class ToolRegistry {
  private tools: Map<string, ToolEntry> = new Map();
  private toolsetChecks: Map<string, () => boolean | Promise<boolean>> = new Map();

  // ------------------------------------------------------------------
  // Registration
  // ------------------------------------------------------------------

  /**
   * Register a tool.  Typically called at module-load time.
   *
   * If a tool with the same name already exists in a *different* toolset,
   * a warning is logged to console.warn.
   */
  register(entry: {
    name: string;
    toolset: string;
    schema: Record<string, any>;
    handler: (args: Record<string, any>, context: ToolContext) => Promise<string>;
    checkFn?: () => boolean | Promise<boolean>;
    requiresEnv?: string[];
    description?: string;
    emoji?: string;
    maxResultSizeChars?: number;
  }): void {
    const existing = this.tools.get(entry.name);
    if (existing && existing.toolset !== entry.toolset) {
      console.warn(
        `Tool name collision: '${entry.name}' (toolset '${existing.toolset}') ` +
        `is being overwritten by toolset '${entry.toolset}'`,
      );
    }

    const toolEntry: ToolEntry = {
      name: entry.name,
      toolset: entry.toolset,
      schema: entry.schema,
      handler: entry.handler,
      checkFn: entry.checkFn,
      requiresEnv: entry.requiresEnv ?? [],
      description: entry.description || entry.schema?.description || '',
      emoji: entry.emoji || '',
      maxResultSizeChars: entry.maxResultSizeChars,
    };

    this.tools.set(entry.name, toolEntry);

    // Store the toolset check (one per toolset, first-wins)
    if (entry.checkFn && !this.toolsetChecks.has(entry.toolset)) {
      this.toolsetChecks.set(entry.toolset, entry.checkFn);
    }
  }

  /**
   * Remove a tool from the registry.
   *
   * Also cleans up the toolset check if no other tools remain in that
   * toolset.  Used by dynamic tool discovery (e.g. MCP) to nuke-and-repave
   * when a server sends `notifications/tools/list_changed`.
   */
  deregister(name: string): void {
    const entry = this.tools.get(name);
    if (!entry) return;

    this.tools.delete(name);

    // Drop the toolset check if this was the last tool in that toolset
    const hasRemaining = Array.from(this.tools.values()).some(
      (e) => e.toolset === entry.toolset,
    );
    if (this.toolsetChecks.has(entry.toolset) && !hasRemaining) {
      this.toolsetChecks.delete(entry.toolset);
    }

    console.debug(`Deregistered tool: ${name}`);
  }

  // ------------------------------------------------------------------
  // Schema retrieval — OpenAI function calling format
  // ------------------------------------------------------------------

  /**
   * Return OpenAI-format tool schemas for the requested tool names.
   *
   * Only tools whose `checkFn()` returns true (or have no checkFn)
   * are included.  Results are sorted alphabetically by name.
   */
  async getDefinitions(
    toolNames: Set<string>,
    quiet: boolean = false,
  ): Promise<OpenAIToolDefinition[]> {
    const result: OpenAIToolDefinition[] = [];
    const checkCache = new Map<
      () => boolean | Promise<boolean>,
      boolean
    >();

    for (const name of Array.from(toolNames).sort()) {
      const entry = this.tools.get(name);
      if (!entry) continue;

      // Run availability check (cached per checkFn reference)
      if (entry.checkFn) {
        if (!checkCache.has(entry.checkFn)) {
          try {
            checkCache.set(entry.checkFn, Boolean(await entry.checkFn()));
          } catch {
            checkCache.set(entry.checkFn, false);
            if (!quiet) {
              console.debug(`Tool ${name} check raised; skipping`);
            }
          }
        }
        if (!checkCache.get(entry.checkFn)) {
          if (!quiet) {
            console.debug(`Tool ${name} unavailable (check failed)`);
          }
          continue;
        }
      }

      // Ensure schema always has a "name" field
      const schemaWithName = { ...entry.schema, name: entry.name };
      result.push({ type: 'function', function: schemaWithName });
    }

    return result;
  }

  // ------------------------------------------------------------------
  // Dispatch
  // ------------------------------------------------------------------

  /**
   * Execute a tool handler by name.
   *
   * All exceptions are caught and returned as `{"error": "..."}` for
   * consistent error format.  Handlers are always async in the TS version
   * (no sync→async bridging needed).
   */
  async dispatch(
    name: string,
    args: Record<string, any>,
    context: ToolContext = {},
  ): Promise<string> {
    const entry = this.tools.get(name);
    if (!entry) {
      return toolError(`Unknown tool: ${name}`);
    }
    try {
      return await entry.handler(args, context);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Tool ${name} dispatch error: ${msg}`);
      return toolError(
        `Tool execution failed: ${e instanceof Error ? e.constructor.name : typeof e}: ${msg}`,
      );
    }
  }

  // ------------------------------------------------------------------
  // Query helpers
  // ------------------------------------------------------------------

  /**
   * Return per-tool max result size, or *default*.
   *
   * Falls back to a global default of 100_000 if neither per-tool nor
   * caller-supplied default is set (mirrors Python's DEFAULT_RESULT_SIZE_CHARS).
   */
  getMaxResultSize(
    name: string,
    defaultSize?: number | null,
  ): number {
    const entry = this.tools.get(name);
    if (entry?.maxResultSizeChars !== undefined && entry.maxResultSizeChars !== null) {
      return entry.maxResultSizeChars;
    }
    if (defaultSize !== undefined && defaultSize !== null) {
      return defaultSize;
    }
    return 100_000;
  }

  /** Return sorted list of all registered tool names. */
  getAllToolNames(): string[] {
    return Array.from(this.tools.keys()).sort();
  }

  /**
   * Return a tool's raw schema dict, bypassing checkFn filtering.
   *
   * Useful for token estimation and introspection where availability
   * doesn't matter — only the schema content does.
   */
  getSchema(name: string): Record<string, any> | undefined {
    return this.tools.get(name)?.schema;
  }

  /** Return the toolset a tool belongs to, or undefined. */
  getToolsetForTool(name: string): string | undefined {
    return this.tools.get(name)?.toolset;
  }

  /** Return the emoji for a tool, or *default* if unset. */
  getEmoji(name: string, defaultEmoji: string = '⚡'): string {
    const entry = this.tools.get(name);
    return entry?.emoji || defaultEmoji;
  }

  /** Return `{tool_name: toolset_name}` for every registered tool. */
  getToolToToolsetMap(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const [name, entry] of Array.from(this.tools)) {
      map[name] = entry.toolset;
    }
    return map;
  }

  /**
   * Check if a toolset's requirements are met.
   *
   * Returns false (rather than crashing) when the check function raises
   * an unexpected exception (e.g. network error, missing import, bad config).
   */
  async isToolsetAvailable(toolset: string): Promise<boolean> {
    const check = this.toolsetChecks.get(toolset);
    if (!check) return true;
    try {
      return Boolean(await check());
    } catch {
      console.debug(`Toolset ${toolset} check raised; marking unavailable`);
      return false;
    }
  }

  /** Return `{toolset: available_bool}` for every toolset (awaitable). */
  async checkToolsetRequirements(): Promise<Record<string, boolean>> {
    const toolsets = new Set(
      Array.from(this.tools.values()).map((e) => e.toolset),
    );
    const result: Record<string, boolean> = {};
    for (const ts of Array.from(toolsets).sort()) {
      result[ts] = await this.isToolsetAvailable(ts);
    }
    return result;
  }

  /**
   * Return toolset metadata for UI display.
   *
   * Mirrors Python's `get_available_toolsets()`.  Each toolset entry
   * includes availability status, tool list, description, and required
   * environment variables.
   */
  async getAvailableToolsets(): Promise<Record<string, ToolsetInfo>> {
    const toolsets: Record<string, ToolsetInfo> = {};

    for (const entry of Array.from(this.tools.values())) {
      const ts = entry.toolset;
      if (!toolsets[ts]) {
        toolsets[ts] = {
          available: await this.isToolsetAvailable(ts),
          tools: [],
          description: '',
          requirements: [],
        };
      }
      toolsets[ts].tools.push(entry.name);

      if (entry.requiresEnv) {
        for (const env of entry.requiresEnv) {
          if (!toolsets[ts].requirements.includes(env)) {
            toolsets[ts].requirements.push(env);
          }
        }
      }
    }

    return toolsets;
  }

  /**
   * Return `(available_toolsets, unavailable_info)` — compatible with
   * the old Python `check_tool_availability()` function.
   */
  async checkToolAvailability(
    quiet: boolean = false,
  ): Promise<{ available: string[]; unavailable: UnavailableToolset[] }> {
    const available: string[] = [];
    const unavailable: UnavailableToolset[] = [];
    const seen = new Set<string>();

    for (const entry of Array.from(this.tools.values())) {
      const ts = entry.toolset;
      if (seen.has(ts)) continue;
      seen.add(ts);

      if (await this.isToolsetAvailable(ts)) {
        available.push(ts);
      } else {
        unavailable.push({
          name: ts,
          env_vars: entry.requiresEnv,
          tools: Array.from(this.tools.values())
            .filter((e) => e.toolset === ts)
            .map((e) => e.name),
        });
      }
    }

    return { available, unavailable };
  }

  // ------------------------------------------------------------------
  // Argument coercion (mirrors model_tools.py coerce_tool_args)
  // ------------------------------------------------------------------

  /**
   * Coerce tool call arguments to match their JSON Schema types.
   *
   * LLMs frequently return numbers as strings (`"42"` instead of `42`)
   * and booleans as strings (`"true"` instead of `true`). This method
   * compares each argument value against the tool's registered JSON Schema
   * and attempts safe coercion when the value is a string but the schema
   * expects a different type.
   */
  coerceToolArgs(
    toolName: string,
    args: Record<string, any>,
  ): Record<string, any> {
    if (!args || typeof args !== 'object') return args;

    const schema = this.getSchema(toolName);
    if (!schema) return args;

    const properties = (schema.parameters as Record<string, any>)?.properties;
    if (!properties) return args;

    const result = { ...args };
    for (const key of Object.keys(result)) {
      const value = result[key];
      if (typeof value !== 'string') continue;

      const propSchema = properties[key];
      if (!propSchema) continue;

      const expected = propSchema.type;
      if (!expected) continue;

      const coerced = coerceValue(value, expected);
      if (coerced !== value) {
        result[key] = coerced;
      }
    }

    return result;
  }

  // ------------------------------------------------------------------
  // Direct tool entry access
  // ------------------------------------------------------------------

  /** Get a tool entry directly (for advanced use). */
  getEntry(name: string): ToolEntry | undefined {
    return this.tools.get(name);
  }

  /** Return the total number of registered tools. */
  get size(): number {
    return this.tools.size;
  }
}

// ---------------------------------------------------------------------------
// Argument coercion helpers (private)
// ---------------------------------------------------------------------------

function coerceValue(value: string, expectedType: any): any {
  if (Array.isArray(expectedType)) {
    // Union type — try each in order, return first successful coercion
    for (const t of expectedType) {
      const result = coerceValue(value, t);
      if (result !== value) return result;
    }
    return value;
  }

  if (expectedType === 'integer' || expectedType === 'number') {
    return coerceNumber(value, expectedType === 'integer');
  }
  if (expectedType === 'boolean') {
    return coerceBoolean(value);
  }
  return value;
}

function coerceNumber(value: string, integerOnly: boolean): any {
  try {
    const f = parseFloat(value);
    if (Number.isNaN(f) || !Number.isFinite(f)) return value;
    if (f === Math.floor(f)) return f;
    if (integerOnly) return value; // Has decimals but schema wants int
    return f;
  } catch {
    return value;
  }
}

function coerceBoolean(value: string): any {
  const low = value.trim().toLowerCase();
  if (low === 'true') return true;
  if (low === 'false') return false;
  return value;
}

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

/** The global tool registry singleton. */
export const registry = new ToolRegistry();
