# Worklog

## Task 3-a: Main Layout & Sidebar Navigation

**Status**: ✅ Completed
**Date**: 2025-07-09

### Summary
Built the main application shell with premium sidebar navigation, theme provider, and view routing system for the Hermes Agent web platform.

### Files Created
1. **`src/components/hermes/theme-provider.tsx`** — Thin client wrapper around `next-themes` ThemeProvider, enabling dark/light mode via class attribute.

2. **`src/components/hermes/view-router.tsx`** — Client component that reads `currentView` from Zustand store and conditionally renders the matching view panel component.

3. **`src/components/hermes/sidebar.tsx`** — Premium sidebar component featuring:
   - Winged-helmet SVG logo with animated gradient orb and "Hermes / AI Agent Platform" branding
   - 8 navigation items (Chat, Dashboard, Tools, Skills, Sessions, Memory, Settings, Cron Jobs) with lucide-react icons
   - Active state with accent background + animated left indicator bar (framer-motion `layoutId`)
   - Agent status indicator with pulsing glow animation (connected=green, disconnected=gray, error=red)
   - 4-option theme style switcher (default, emerald, rose, ocean) as color circles
   - Dark/light mode toggle using next-themes `useTheme`
   - Desktop: Collapsible fixed sidebar (240px ↔ 56px) with spring animation
   - Mobile: Sheet-based overlay with hamburger menu trigger
   - Subtle hover animations, tooltips for collapsed state, glass/frosted backdrop

4. **`src/components/hermes/app-shell.tsx`** — Client component wrapping the full layout: Sidebar + main content area, mobile header spacer, TooltipProvider, and Sonner Toaster.

5. **`src/components/hermes/views/*.tsx`** — 8 placeholder view components (chat, dashboard, tools, skills, sessions, memory, settings, cronjobs) each displaying centered branding placeholder content.

### Files Updated
1. **`src/app/layout.tsx`** — Added ThemeProvider (attribute="class", defaultTheme="system"), AppShell wrapper, updated metadata to "Hermes Agent Web".
2. **`src/app/page.tsx`** — Now renders `<ViewRouter />` which conditionally shows the active view.

### Technical Notes
- ESLint passes with zero errors
- Dev server compiles successfully (no module resolution errors)
- Uses existing shadcn/ui components: Sheet, Button, Tooltip, Separator
- All sidebar state managed through Zustand store (`currentView`, `sidebarOpen`, `themeStyle`, `agentStatus`)
- `data-theme` attribute synced on mount for multi-theme support
- Framer-motion used for sidebar width animation, nav item hover/press effects, and active indicator layout animation

---

## Task 5: Dashboard View

**Status**: ✅ Completed
**Date**: 2025-07-09

### Summary
Replaced the placeholder dashboard view with a comprehensive, mission-control-style dashboard featuring real-time stat cards, interactive charts, system resource monitors, session history, and quick action navigation.

### File Modified
1. **`src/components/hermes/views/dashboard-view.tsx`** — Complete rewrite from placeholder to full dashboard (~1000 lines):

#### Stat Cards (4x, responsive grid 1/2/4 cols)
- **Agent Status** — Reads `agentStatus` from Zustand store, displays color-coded badge (green/gray/red) with pulsing dot animation using existing `.pulse-glow` CSS class, Wifi/WifiOff/AlertTriangle icons
- **Total Sessions** — Animated count-up number using custom `useCountUp` hook (ease-out cubic), "+N today" delta badge, reads `chatSessions` from store
- **Messages Today** — Count with comparison to yesterday, trend arrow (TrendingUp/TrendingDown) with percentage delta
- **Tools Used** — Top 3 tool usage shown as animated mini horizontal bar charts, total count with count-up animation

#### Charts (recharts)
- **Message Activity** — AreaChart with 7-day message data, gradient fill under line (`linearGradient`), responsive container, theme-aware tooltip/card styling using CSS variables, animated mount
- **Token Usage** — BarChart showing daily token consumption, rounded bar corners, `k` formatter on Y-axis, responsive container

#### System Resources Panel
- Three animated horizontal progress bars: Context Window (45k/200k tokens), Memory Storage (128/512 MB), Active Skills (12/20)
- Each with icon, label, sublabel, and percentage
- SVG circular progress indicators (3x) for overall health summary: animated stroke-dashoffset with framer-motion, icon centered in circle

#### Recent Sessions Table
- Uses shadcn/ui Table component with custom scrollbar (`custom-scrollbar`)
- Columns: Title (truncated with MessageSquare icon), Model (Badge), Messages count, Last Active, Status (color-coded active/archived badges)
- Responsive: hides columns progressively on smaller screens (sm, md, lg breakpoints)
- Row click navigates to chat view and sets current session ID
- Shows store sessions when available, falls back to mock data

#### Quick Actions Grid
- 6 action cards in 2/3-column responsive grid: New Chat, Browse Tools, Manage Skills, View Memory, Settings, Schedule Task
- Each with colored icon background, label, description
- Click navigates via `setCurrentView()` from store
- Framer-motion hover lift + scale, tap compress

#### Animations & UX
- Container stagger animation (`containerVariants` + `itemVariants`) with spring physics
- Cards have subtle hover lift (`whileHover={{ y: -2 }}`)
- Progress bars animate from 0 to target width with staggered delays
- Charts use `AnimatePresence` + delayed mount via `requestAnimationFrame` for SSR safety
- Custom `useCountUp` hook with `requestAnimationFrame`-based animation loop
- Empty state shown when no sessions and agent disconnected, with animated floating icon and CTA button

#### Design
- All colors use theme CSS variables (`chart-1` through `chart-5`, `muted`, `border`, etc.) — NO indigo/blue
- Responsive: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` for stats, `lg:grid-cols-2` for charts, `xl:grid-cols-5` for bottom row
- Consistent card styling with hover shadows and border transitions
- Max-width container (`1400px`) with responsive padding

### Technical Notes
- ESLint passes with zero errors (3 `react-hooks/set-state-in-effect` warnings fixed by wrapping `setState` calls in `requestAnimationFrame`)
- Dev server compiles and serves the dashboard successfully
- Uses shadcn/ui: Card, Badge, Table, Progress
- Uses recharts: AreaChart, BarChart, ResponsiveContainer, Tooltip
- Uses framer-motion: motion.div, AnimatePresence, whileHover, whileTap, variants
- Uses Zustand store: `agentStatus`, `chatSessions`, `setCurrentView`, `setCurrentSessionId`

---

## Task 6: Tools Explorer & Skills Manager Views

**Status**: ✅ Completed
**Date**: 2025-07-09

### Summary
Replaced placeholder Tools and Skills views with fully functional, interactive explorer and manager components featuring search, filtering, grid/list views, detail dialogs, and skill CRUD operations.

### Files Modified

#### 1. `src/components/hermes/views/tools-view.tsx` — Tools Explorer (~400 lines)

**Data Layer:**
- 11 tool categories with unique color schemes and icons (Web & Search, Terminal & Code, File System, Browser, Vision & Media, Skills, Memory, Messaging, Agent & Delegation, Smart Home, Automation)
- 38 tools with full metadata: name, category, description, status, usage examples, and parameter signatures
- Category color mapping: emerald (web), amber (terminal), orange (file), rose (browser), violet (vision), yellow (skills), teal (memory), sky (messaging), fuchsia (agent), lime (home), red (automation)

**Header:**
- Title with dynamic filtered count display
- Search input with icon, real-time filtering by name and description
- Category pill buttons with active state highlighting, icon, label, and count badge
- Grid/List view toggle with segmented button control

**Grid View (ToolCardGrid):**
- Responsive grid: 1/2/3/4 columns across breakpoints
- Category-colored icon in rounded background
- Monospace font tool name with hover color transition
- 2-line clamped description
- Category badge at bottom
- Status indicator dot (top-right, green for active)
- Hover: lift + shadow + border transition

**List View (ToolCardList):**
- Compact horizontal card layout with icon, name, description, category badge, and chevron
- Status dot inline with name
- Same hover animations as grid

**Detail Dialog (ToolDetailDialog):**
- Category icon and name header with status badge
- Full description section
- Parameters display in code block with copy-to-clipboard button
- Numbered usage examples list
- Related tools section (same category, up to 3)
- ScrollArea for long content
- Framer-motion layout animations throughout

**Animations:**
- AnimatePresence with popLayout mode for smooth filtering transitions
- Grid cards: fade + slide-up entrance, scale-down exit
- List cards: fade + slide-left entrance, slide-right exit
- Empty state with animated search icon

#### 2. `src/components/hermes/views/skills-view.tsx` — Skills Manager (~450 lines)

**Data Layer:**
- 9 skill categories with color/icon mapping (matching design spec)
- 19 representative skills with name, category, description, isBuiltin, usageCount, enabled status
- Local state management for skills (enable/disable, create, edit)

**Header:**
- Title with filtered count and enabled count display (color-coded green)
- Search input with real-time filtering
- Category pill buttons (same design as Tools view)
- "Create Skill" button (primary, with Plus icon)

**Skill Cards:**
- Category icon with colored background
- "Built-in" badge (with Star icon) vs "Custom" badge (with Sparkles icon, amber color)
- Skill name with hover color transition
- 2-line clamped description
- Enable/disable toggle switch (top-right)
- Hover-revealed Edit (Pencil) and View (Eye) action buttons with tooltips
- Bottom row: category badge + usage count with TrendingUp icon
- Responsive grid: 1/2/3/4 columns

**Skill Detail Dialog (SkillDetailDialog):**
- Category icon + skill name header with Built-in/Custom badge
- Full description
- Stats grid: Usage Count (with TrendingUp icon) and Status (with colored dot)
- "Edit Skill" footer button that opens the edit dialog

**Create/Edit Dialog (SkillFormDialog):**
- Form fields: Name input, Category select (dropdown with icons), Description textarea, Instructions textarea (monospace, larger)
- Enable/disable toggle switch
- Form validation (required fields with toast error)
- Dual-purpose: Create mode (empty form) and Edit mode (pre-populated)
- State sync on dialog open via handleOpenChange
- Sonner toast notifications for success

**Interactions:**
- Toggle skills on/off from card or detail view
- Create new custom skills with full form
- Edit existing skills (updates in-place)
- View detailed skill information
- Toast feedback on create/edit actions

### Design Patterns
- Consistent card styling across both views (rounded-xl, border-border/60, hover shadow/lift)
- Same category pill design language in both views
- Same empty state pattern (icon in circle, title, subtitle)
- Theme-aware: uses CSS variables (bg-card, text-foreground, text-muted-foreground, border-border, etc.)
- NO indigo/blue — uses emerald, amber, orange, rose, violet, teal, sky, fuchsia, lime, red
- Responsive: mobile-first with sm/md/lg/xl breakpoints
- All cards use framer-motion for mount/unmount transitions

### Components Used (shadcn/ui)
Input, Badge, Button, ScrollArea, Switch, Label, Textarea, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tooltip, TooltipContent, TooltipTrigger

### Technical Notes
- ESLint passes with zero errors
- Dev server compiles successfully
- All state is local (useState) — no backend dependency for this task
- Framer-motion AnimatePresence with mode="popLayout" for smooth filtering
- Sonner toast integration for user feedback on skill CRUD operations

---

## Task 7: Hermes Tool Registry (TypeScript)

**Status**: ✅ Completed
**Date**: 2025-07-09

### Summary
Created a comprehensive TypeScript tool registry file that mirrors all ~45 hermes-agent tool definitions from the Python source. This provides a single source of truth for the web UI to render tool documentation, parameter forms, category filtering, and toolset grouping.

### File Created
1. **`src/lib/hermes/tools-registry.ts`** (~1240 lines) — Complete registry with:

#### Exported Interfaces
- `ToolDefinition` — name, description, category, toolset, emoji, parameters (JSON Schema), isWebCompatible
- `ToolsetDefinition` — name, description, tools[], emoji, color
- `CategoryMeta` — label, icon name, color, hex

#### Exported Constants
- `ALL_TOOLS` — Flat array of 45 tools with full JSON Schema parameters extracted directly from the Python registry (`hermes-agent/tools/*.py`)
- `ALL_TOOLSETS` — 18 toolset definitions matching `toolsets.py` (web, terminal, file, browser, vision, image_gen, tts, skills, todo, memory, session_search, clarify, code_execution, delegation, messaging, cronjob, homeassistant, rl)
- `CATEGORIES` — 11 category metadata entries (Web & Search, Terminal & Code, File System, Browser, Vision & Media, Skills, Planning & Memory, Messaging, Automation, Smart Home, RL Training)
- `TOOL_COUNT` — Total number of registered tools

#### Exported Helper Functions
- `getToolByName(name)` — O(1) lookup via pre-built `Map`
- `getToolsByToolset(toolset)` — Filter tools by toolset name
- `getToolsByCategory(category)` — Filter tools by category name
- `getToolsets(name?)` — Get all or filtered toolset definitions
- `getCategoryForToolset(toolset)` — Map toolset → category
- `getActiveCategories()` — Deduplicated list of categories with tools

#### Tool Schemas (extracted from Python source)
All tool schemas match the exact JSON Schema from the Python registry:
- **Web**: web_search, web_extract
- **Terminal**: terminal (with background/pty/workdir/timeout), process (7 actions)
- **Code**: execute_code, delegate_task (batch mode with tasks array)
- **File**: read_file (pagination, 100K char cap), write_file, patch (replace + V4A modes, fuzzy matching), search_files (content/files targets, ripgrep-backed)
- **Browser**: browser_navigate, browser_snapshot, browser_click, browser_type, browser_scroll, browser_back, browser_press, browser_close, browser_get_images, browser_vision, browser_console
- **Vision & Media**: vision_analyze (AI vision), image_generate (FLUX 2 Pro, aspect ratios), text_to_speech
- **Skills**: skills_list, skill_view (linked files), skill_manage (CRUD + write_file/remove_file)
- **Planning & Memory**: todo (merge mode), memory (add/replace/remove, user/memory targets), session_search (FTS5 with OR syntax), clarify (multiple choice + open-ended)
- **Messaging**: send_message (multi-platform targets)
- **Automation**: cronjob (create/list/update/pause/resume/remove/run with model override)
- **Smart Home**: ha_list_entities, ha_get_state, ha_list_services, ha_call_service
- **RL Training**: rl_list_environments, rl_select_environment, rl_get_current_config, rl_edit_config, rl_start_training, rl_check_status (rate-limited), rl_stop_training, rl_get_results, rl_list_runs, rl_test_inference

#### Web Compatibility
10 tools marked `isWebCompatible: true`: web_search, web_extract, vision_analyze, image_generate, text_to_speech, skills_list, skill_view, memory, session_search, clarify. All other tools require CLI/local environment access.

### Technical Notes
- ESLint: zero new errors (all 5 errors are pre-existing in hermes-agent/)
- No `downlevelIteration` issues (used `Array.from()` instead of spread on Set)
- TypeScript strict mode compatible
- File is purely declarative (no side effects) — safe for tree-shaking
- Descriptions are copied verbatim from the Python tool schemas for accuracy

---

## Task 2-5: Rewrite API Routes to Proxy to hermes-api Mini-Service

**Status**: ✅ Completed
**Date**: 2025-07-09

### Summary
Rewrote all 6 Next.js API routes to proxy requests to the Python hermes-api mini-service (port 8643) instead of calling LLM APIs directly or reading from local Prisma DB. All cross-port requests use the gateway rule `?XTransformPort=8643` with relative paths. The chat route retains local Prisma session management for web UI persistence while forwarding messages to hermes-api.

### Files Modified

#### 1. `src/app/api/chat/route.ts` — Chat completions proxy (~200 lines)
- **POST**: Forwards request body (messages, stream, model) to `/v1/chat/completions?XTransformPort=8643`
- **Streaming**: Transparently pipes SSE response body from hermes-api, accumulating full content and token count for local DB save
- **Non-streaming**: Returns JSON response from hermes-api with local session metadata
- **Headers forwarded**: `Content-Type`, `X-Hermes-Session-Id`; response forwards `X-Hermes-Session-Id` and `X-Model`
- **Local DB**: Still manages chatSession/chatMessage in Prisma for session persistence — creates/updates sessions, saves user and assistant messages
- **Error handling**: Propagates hermes-api errors, graceful fallback on DB failures

#### 2. `src/app/api/tools/route.ts` — Tools proxy (~40 lines)
- **GET**: Forwards query params (`?category=`, `?toolset=`, `?search=`) to `/v1/tools?XTransformPort=8643`
- Returns full hermes-api response as-is (tools array, toolsets, categories, total count)
- Removed dependency on local TypeScript tools-registry

#### 3. `src/app/api/skills/route.ts` — Skills proxy (~40 lines)
- **GET**: Forwards query params (`?category=`, `?search=`) to `/v1/skills?XTransformPort=8643`
- Returns full hermes-api response (skills array, total, categories)
- Removed local Prisma DB reads for skills

#### 4. `src/app/api/skills/[name]/route.ts` — Skill detail proxy (NEW)
- **GET**: Proxies to `/v1/skills/{name}?XTransformPort=8643` for individual skill content
- URL-encodes skill name for safe path construction
- Returns skill content, linked files, and metadata from hermes-api

#### 5. `src/app/api/memory/route.ts` — Memory proxy (~65 lines)
- **GET**: Proxies to `/v1/memory?XTransformPort=8643` to read hermes-agent memory
- **PUT**: Forwards body to `/v1/memory?XTransformPort=8643` to update memory
- Removed local Prisma DB CRUD for memory entries

#### 6. `src/app/api/hermes/route.ts` — Health/connection check proxy (~100 lines)
- **GET**: Checks health at `/health?XTransformPort=8643`, models at `/v1/models?XTransformPort=8643`, and config at `/v1/config?XTransformPort=8643` — all in parallel via `Promise.allSettled`
- Returns connection status (connected/disconnected/error), health data, model list, and config
- **PUT**: Saves hermes connection config to local DB (hermes_url, hermes_api_key) and optionally forwards config payload to hermes-api `/v1/config`

#### 7. `src/app/api/config/route.ts` — Config proxy (~55 lines)
- **GET**: Proxies to `/v1/config?XTransformPort=8643`, falls back to empty object on failure
- **PUT**: Forwards config body to `/v1/config?XTransformPort=8643` for hermes-agent config updates
- Removed local Prisma DB key-value store reads/writes

### Gateway Configuration
All cross-port requests use the Caddy gateway pattern:
- Relative paths only (e.g., `/v1/tools?XTransformPort=8643`)
- Never includes port in URL path
- `XTransformPort=8643` query parameter for all hermes-api requests

### Technical Notes
- ESLint passes with zero errors on `src/app/api/` (5 pre-existing errors in `hermes-agent/` unrelated)
- Dev server compiles and serves successfully
- Chat streaming uses `TransformStream` to transparently pipe SSE chunks while accumulating content for local DB persistence
- All routes include proper error handling with hermes-api error status forwarding
- Local Prisma session management retained only in chat route for web UI session history

---

## Task 8: Fix API Routes & Enable hermes-agent Agent Loop

**Status**: ✅ Completed
**Date**: 2025-07-10

### Summary
Fixed critical bugs preventing API routes from working and added a complete Agent Loop to the hermes-api mini-service. All 7 API endpoints now work correctly, and the chat feature implements the full hermes-agent pattern: LLM call → tool calls → execute → feed back → final response.

### Issues Fixed

#### 1. Server-side fetch URL resolution (all API routes)
**Problem**: API routes used relative paths with `XTransformPort` query param (e.g., `/v1/tools?XTransformPort=8643`), but server-side `fetch()` has no base URL to resolve against, causing `ERR_INVALID_URL`.
**Fix**: Changed all API routes to use `http://localhost:8643` directly via `HERMES_API_URL` env var with fallback default.
**Files**: `chat/route.ts`, `tools/route.ts`, `skills/route.ts`, `skills/[name]/route.ts`, `memory/route.ts`, `config/route.ts`, `hermes/route.ts`

#### 2. Model name resolution
**Problem**: Frontend sends `"model": "hermes-agent"` as a UI placeholder, but hermes-api forwarded this directly to NVIDIA NIM API, resulting in 404.
**Fix**: Added model name validation — only uses request model if it contains "/" (indicating a real LLM model like `meta/llama-3.3-70b-instruct`), otherwise falls back to config default.

#### 3. Default LLM model
**Problem**: `z-ai/glm-4.7` model name didn't exist on NVIDIA NIM (correct name is `z-ai/glm4.7`), and GLM models were unstable on the API.
**Fix**: Changed default to `meta/llama-3.3-70b-instruct` which is reliable and supports tool calling.

#### 4. Agent Loop — Tool call handling
**Problem**: When LLM returns `tool_calls` instead of text content, hermes-api returned empty content to the frontend.
**Fix**: Implemented a full Agent Loop:
- Non-streaming: `for` loop up to 5 rounds. On tool_calls, simulates execution via `_simulate_tool_execution()`, feeds results back to LLM for final text response.
- Streaming: Same loop but streams intermediate results. Shows "🔧 Calling tools: ..." to user during tool execution phase.
- `_simulate_tool_execution()` provides human-readable placeholder results for all 36 registered tools.

#### 5. aiohttp bytes encoding
**Problem**: `aiohttp.StreamResponse.write()` requires bytes, not str.
**Fix**: Added `.encode()` to all `response.write(f"...")` calls in the streaming handler.

### Test Results (all passing)
| Endpoint | Method | Result |
|----------|--------|--------|
| `/api/hermes` | GET | ✅ Status: connected, Models: 1 |
| `/api/tools` | GET | ✅ 36 tools, 10 categories |
| `/api/skills` | GET | ✅ 122 skills |
| `/api/memory` | GET | ✅ Memory data returned |
| `/api/config` | GET | ✅ LLM config returned |
| `/api/chat` (non-stream) | POST | ✅ Agent loop works, response generated |
| `/api/chat` (streaming) | POST | ✅ SSE stream with tool call events |

### Architecture
```
Browser → Next.js API Routes → hermes-api (Python, port 8643)
                                ├── Agent Loop: LLM → tools → execute → LLM → response
                                ├── Tool Registry: 36 tools across 10 categories
                                ├── Skills Scanner: 122 skills from ~/.hermes/skills/
                                ├── Memory System: ~/.hermes/memory/MEMORY.md + USER.md
                                ├── Config: ~/.hermes/config.yaml + env vars
                                └── LLM Provider: NVIDIA NIM (OpenAI-compatible API)
```

---

## Task 9: Hermes Agent Loop & Prompt Builder (TypeScript Core)

**Status**: ✅ Completed
**Date**: 2025-07-11

### Summary
Implemented the core agent loop and system prompt builder in TypeScript, faithfully porting the hermes-agent Python tool-calling loop (`run_agent.py` / `agent_loop.py`) and prompt assembly system (`prompt_builder.py`). These two files form the runtime backbone that drives the entire agent lifecycle on the Next.js backend.

### Files Created

#### 1. `src/lib/hermes/prompt-builder.ts` (~250 lines)

**Exported Constants** (all ported verbatim from Python):
- `DEFAULT_AGENT_IDENTITY` — Default agent persona when SOUL.md is absent
- `MEMORY_GUIDANCE` — Injected when `memory` tool is available
- `SESSION_SEARCH_GUIDANCE` — Injected when `session_search` tool is available
- `SKILLS_GUIDANCE` — Injected when `skill_manage` tool is available
- `TOOL_USE_ENFORCEMENT_GUIDANCE` — Forces model to call tools instead of describing actions
- `TOOL_USE_ENFORCEMENT_MODELS` — Model name substrings that trigger enforcement (gpt, codex, gemini, gemma, grok)
- `OPENAI_MODEL_EXECUTION_GUIDANCE` — GPT/Codex-specific execution discipline
- `GOOGLE_MODEL_OPERATIONAL_GUIDANCE` — Gemini/Gemma operational directives
- `PLATFORM_HINTS` — Platform-specific formatting hints (whatsapp, telegram, discord, slack, signal, email, cron, cli, sms, web, api_server)

**Exported Functions**:
- `buildSystemPrompt(options)` — Assembles the complete system prompt from all 8 layers:
  1. Agent identity (SOUL.md or DEFAULT_AGENT_IDENTITY)
  2. Tool-aware behavioral guidance (memory, session_search, skills)
  3. Tool-use enforcement (model-dependent)
  4. User/gateway system message
  5. Memory context block
  6. Skills index
  7. Timestamp + session metadata
  8. Platform-specific formatting hint

#### 2. `src/lib/hermes/agent-loop.ts` (~680 lines)

**Exported Types**:
- `AgentConfig` — Model, maxIterations, platform, apiKey, baseUrl, toolset filtering
- `ToolCall` — id, type, function.name, function.arguments (OpenAI format)
- `AgentMessage` — role, content, tool_calls?, tool_call_id?, reasoning_content?
- `SSEEvent` — type (delta|tool_start|tool_end|reasoning|done|error), data
- `TokenUsage` — inputTokens, outputTokens, totalTokens
- `AgentResult` — messages, finalResponse, turnsUsed, finishedNaturally, usage
- `ToolRegistry` — Interface for getToolDefinitions(), getValidToolNames(), dispatch()
- `ToolContext` — taskId, userTask, sessionId
- `MemoryManager` — Interface for getMemoryContext()
- `IterationBudget` — Thread-safe iteration counter with consume(), refund(), remaining

**AgentLoop Class** — The core agent loop implementation:
- `constructor(config, toolRegistry, memoryManager?)` — Initialises with config, tool registry, and optional memory manager
- `run(messages, options?)` — Main entry point. Executes the full agent loop:
  1. Reset iteration budget
  2. Build/cached system prompt
  3. Prefetch memory context once
  4. Loop: LLM call → check tool_calls → execute tools → append results → repeat
  5. Return final response when model stops calling tools
- `buildSystemPrompt()` — Delegates to prompt-builder.ts
- `executeToolCall(toolCall, context)` — Single tool dispatch
- `handleReasoningContent(content)` — Wraps GLM reasoning in `<think: ...>` tags

**Core Loop Features** (all ported from Python):
- **Iteration budget** — Max 90 iterations by default, with two-tier warnings:
  - 70% caution: "Start consolidating your work"
  - 90% warning: "Provide your final response NOW"
- **Parallel tool execution** — Read-only tools (web_search, read_file, search_files, etc.) run concurrently when batched; path-scoped tools (read_file, write_file, patch) checked for path overlap; interactive tools (clarify) always sequential
- **Sequential execution fallback** — For single tool calls, interactive tools, or when path overlap detected
- **Budget pressure injection** — Warnings injected into last tool-result JSON `_budget_warning` key or appended as text
- **Streaming support** — Accumulates deltas from OpenAI streaming API, fires SSE events for content deltas, reasoning, tool start/end, errors, and completion
- **Surrogate sanitisation** — Strips invalid UTF-8 surrogate code points that crash JSON.stringify
- **Reasoning content handling** — Extracts `reasoning_content` from GLM/OpenRouter models, passes through for multi-turn continuity
- **Error recovery** — Invalid tool JSON → injects error result → model can retry; unknown tool names → descriptive error with available tools list

**Internal Helpers**:
- `callLLM(messages, stream?, onEvent?)` — Creates OpenAI client from config, handles both streaming and non-streaming paths
- `prepareApiMessages(messages, systemPrompt, memoryBlock)` — Prepends system prompt, sanitises reasoning_content, strips internal fields
- `validateToolCallArguments(toolCalls)` — Validates JSON argument strings, normalises empty args to `{}`
- `executeToolCallsParallel()` — Concurrent execution with MAX_TOOL_WORKERS=8 cap
- `executeToolCallsSequential()` — Sequential with per-tool error handling
- `shouldParallelizeToolBatch()` — Mirrors Python's `_should_parallelize_tool_batch()`
- `getBudgetWarning()` / `injectBudgetWarning()` — Two-tier budget pressure system

### Technical Notes
- ESLint: zero new errors in `src/lib/hermes/` (all 5 errors are pre-existing in `hermes-agent/`)
- Dev server compiles successfully — no TypeScript errors
- Uses `openai` npm package for LLM API calls (both streaming and non-streaming)
- Server-side code — no 'use client' directive; intended for API route usage
- ToolRegistry and MemoryManager are interface-based — consumers provide implementations
- System prompt is cached per AgentLoop instance (rebuilt only if `buildSystemPrompt()` is called again)
