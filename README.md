# Hermes Agent Web

A full-featured web interface for [Hermes Agent](https://github.com/NousResearch/hermes-agent) — the open-source self-improving AI agent by Nous Research. The entire Hermes Agent backend is rewritten in TypeScript and embedded directly into the Next.js server, delivering the complete agent experience in the browser with no Python runtime required.

**Live Demo** → [hermes-agent-web.vercel.app](https://hermes-agent-web.vercel.app)

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16">
  <img src="https://img.shields.io/badge/React-19-blue?logo=react" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" alt="TypeScript 5">
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss" alt="Tailwind 4">
  <img src="https://img.shields.io/badge/shadcn/ui-New_York-18181b" alt="shadcn/ui">
  <img src="https://img.shields.io/badge/LLM-Multi_Provider-orange" alt="Multi Provider">
  <img src="https://img.shields.io/badge/Feature_Parity-80%25-yellow" alt="80% Feature Parity">
</p>

---

## What Is Hermes Agent?

[Hermes Agent](https://github.com/NousResearch/hermes-agent) is a self-improving AI agent that can:

- **Use tools** — terminal commands, file operations, web browsing, code execution, vision, image generation, TTS
- **Remember** — persistent file-backed memory (MEMORY.md / USER.md) across sessions
- **Learn skills** — 77+ bundled skills for software dev, MLOps, creative work, productivity, research, and more
- **Plan & reason** — todo lists, context compression, smart model routing, credential management
- **Communicate** — multi-platform messaging gateway (Telegram, Discord, Slack, WhatsApp, Email, and 10+ more)
- **Self-improve** — RL training trajectories, batch evaluation, checkpoint management

This project brings the core agent experience to the web.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                  Next.js 16 App (TypeScript)                   │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Frontend — 8 Views via Sidebar Navigation               │ │
│  │  Chat · Dashboard · Tools · Skills · Sessions            │ │
│  │  Memory · Settings · Cron Jobs                            │ │
│  └─────────────────────────┬────────────────────────────────┘ │
│                            │                                   │
│  ┌─────────────────────────▼────────────────────────────────┐ │
│  │  API Routes (12 endpoints)                               │ │
│  │  /api/chat · /api/sessions · /api/skills                 │ │
│  │  /api/memory · /api/tools · /api/config · /api/cronjobs  │ │
│  │  /api/hermes · /api/stats                                │ │
│  └─────────────────────────┬────────────────────────────────┘ │
│                            │                                   │
│  ┌─────────────────────────▼────────────────────────────────┐ │
│  │  Embedded Hermes Agent (src/lib/hermes/)                  │ │
│  │  TypeScript rewrite of the Python backend (7,700+ lines)  │ │
│  │                                                          │ │
│  │  agent-loop    · provider       · tool-registry          │ │
│  │  toolsets      · skills         · memory                  │ │
│  │  prompt-builder · config        · tools-registry         │ │
│  │  models        · registered-tools · default-skills        │ │
│  └─────────────────────────┬────────────────────────────────┘ │
│                            │                                   │
│  ┌─────────────────────────▼────────────────────────────────┐ │
│  │  External Services                                        │ │
│  │  SQLite (Prisma) · NVIDIA NIM · OpenAI · Anthropic       │ │
│  │  Google Gemini · OpenRouter · GLM (ZhipuAI)              │ │
│  │  z-ai-web-dev-sdk (Vision, TTS, Image Gen, Web)         │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

The entire Hermes Agent system (`agent/`, `tools/`, `hermes_cli/`, `skills/`) is rewritten from Python to TypeScript and lives in `src/lib/hermes/`. No Python runtime is needed.

---

## Current Features

### 💬 Chat with Multi-Provider LLM Support

Full SSE-streaming chat with the complete agent loop (multi-turn tool calling, parallel execution, reasoning tokens). Supports 6 LLM providers with **58 models**:

| Provider | Models |
|----------|--------|
| **NVIDIA NIM** (18) | Llama 3.3 70B, Llama 3.1 405B, Llama 3.1 8B, Mixtral 8x22B, Mistral Large, Gemma 2 27B, Gemma 2 9B, Nemotron 340B, Nemotron 70B, Nemotron Ultra 253B, Llama3 70B/8B, DeepSeek R1, DeepSeek R1 Distill 70B, Qwen 2.5 72B, QwQ 32B, GLM 4.7, GLM 5 |
| **OpenAI** (10) | GPT-4o, GPT-4o Mini, GPT-4 Turbo, GPT-4, GPT-3.5 Turbo, o1-mini, o1, o3-mini, o3, o4-mini |
| **Anthropic** (6) | Claude Sonnet 4, Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3 Opus, Claude 3 Sonnet, Claude 3 Haiku |
| **Google** (5) | Gemini 2.5 Flash, Gemini 2.0 Flash, Gemini 1.5 Pro, Gemini 1.5 Flash, Gemini Pro |
| **GLM / ZhipuAI** (14) | GLM-4 Plus, GLM-4, GLM-4 Air/AirX/Flash/Long, GLM-4.5 Flash, GLM-4V/4V Plus, GLM-Z1 Air/AirX/Flash/32B |
| **OpenRouter** (5) | Claude Sonnet 4, GPT-4o, Gemini 2.0 Flash, Llama 3.1 70B, Mistral Large |

The provider is auto-detected from the model name — no manual configuration needed.

### 🧠 8-Layer System Prompt Builder

Faithfully ported from the Python `prompt_builder.py`:

1. **Identity** — Agent persona and behavior instructions
2. **Memory guidance** — When/how to use memory tools
3. **Tool-use enforcement** — Configurable tool calling behavior
4. **System message** — Core system prompt
5. **Memory context** — Injected from MEMORY.md / USER.md (fenced `<memory-context>` block)
6. **Skills index** — Available skills and how to activate them (dynamically built)
7. **Timestamp** — Current date/time for temporal awareness
8. **Platform hints** — Web-specific behavior instructions

### 🛠️ 11 Active Web-Compatible Tools

Only tools with real working handlers are exposed to the LLM — no ghost tools that waste turns:

| Tool | Handler | Implementation |
|------|---------|---------------|
| `web_search` | ✅ | z-ai-web-dev-sdk |
| `web_extract` | ✅ | z-ai-web-dev-sdk |
| `vision_analyze` | ✅ | z-ai-web-dev-sdk VLM |
| `image_generate` | ✅ | z-ai-web-dev-sdk |
| `text_to_speech` | ✅ | z-ai-web-dev-sdk TTS |
| `memory` | ✅ | MemoryManager (add/replace/remove/read) |
| `skills_list` | ✅ | Skills scanner |
| `skill_view` | ✅ | Skill content loader |
| `skill_manage` | ✅ | Skill CRUD (create/edit/delete) — **self-evolution!** |
| `todo` | ✅ | In-memory task management |
| `session_search` | ✅ | Full-text search via SQLite |

### 📚 11 Default Skills + 77+ Catalog

11 built-in default skills with full SKILL.md instructions, plus the ability to scan all 77+ hermes-agent bundled skills across 25 categories:

| Category | Count | Examples |
|----------|-------|---------|
| **Software Development** | 6 | plan, tdd, debugging, code-review, writing-plans |
| **Autonomous AI Agents** | 4 | claude-code, codex, opencode, hermes-agent |
| **Creative** | 7 | ascii-art, excalidraw, p5js, manim-video, songwriting |
| **MLOps Training** | 6 | axolotl, peft, unsloth, grpo-rl, pytorch-fsdp |
| **MLOps Inference** | 6 | llama-cpp, vllm, outlines, guidance, gguf |
| **MLOps Models** | 5 | stable-diffusion, whisper, clip, audiocraft, sam |
| **MLOps Evaluation** | 2 | lm-eval-harness, weights-and-biases |
| **GitHub Workflow** | 6 | code-review, issues, pr-workflow, repo-management |
| **Productivity** | 6 | google-workspace, notion, linear, powerpoint, obsidian |
| **Research** | 5 | arxiv, blogwatcher, llm-wiki, polymarket, research-paper-writing |
| **Media** | 4 | gif-search, youtube-content, songsee, heartmula |
| **Other** | 10+ | minecraft, pokemon, email, smart-home, social-media... |

The agent can **create new skills** via `skill_manage` — this is the self-evolution capability. When the agent discovers a reusable approach, it can write a SKILL.md and save it for future sessions.

### 💾 Persistent Memory System

File-backed MEMORY.md / USER.md system faithfully ported from Python:

- §-delimited sections for structured memory
- Prompt injection detection (10 threat patterns) and sanitization
- Invisible Unicode character detection
- Character limits (2200 memory / 1375 user)
- Atomic writes (temp + rename)
- Deduplication on add
- `<memory-context>` fenced block injection into system prompt
- Frozen snapshot pattern for prefix cache stability
- Query-based prefetch (substring matching)
- Full CRUD via Memory view and API

### 🎨 Chat UX

- Real-time SSE streaming with typing cursor
- Thinking/reasoning blocks (collapsible, violet theme)
- Tool call blocks (running=amber+pulsing, done=emerald+checkmark, error=red)
- "Processing results..." indicator between tool calls
- Abort/stop generation with proper AbortController
- Auto-scroll with manual override + scroll-to-bottom FAB
- Error banner with dismiss
- Copy message button
- Image upload with vision analysis
- Model selector with search, grouped by provider, tags (reasoning/fast/vision)

### 📊 Dashboard, Tools, Settings

- Dashboard with agent status, usage stats, recent sessions, quick actions
- Tools view browsing all 45+ tool definitions with detail dialog
- Skills view with built-in/custom sections and SKILL.md content dialog
- Sessions view with search, sort, filter, and delete
- Memory view with full CRUD editor for MEMORY.md / USER.md
- Settings with 5 tabs: General, Model, Terminal, Memory, Advanced
- Cron Jobs view for scheduled task management
- 4 theme styles + dark/light mode
- Responsive design (mobile sidebar drawer)

---

## Feature Parity Matrix

Comprehensive comparison between hermes-agent (Python) and hermes-agent-web (TypeScript):

### Core Agent — ✅ 95% Complete

| Capability | Python | Web | Notes |
|-----------|--------|-----|-------|
| Multi-turn tool calling | ✅ | ✅ | Full loop: LLM → tool → result → LLM |
| Parallel tool execution | ✅ | ✅ | Concurrent with MAX_TOOL_WORKERS=8 |
| Iteration budget (90 turns) | ✅ | ✅ | Configurable maxIterations |
| Budget pressure warnings | ✅ | ✅ | 70%/90% thresholds |
| Surrogate sanitization | ✅ | ✅ | UTF-8 invalid codepoint stripping |
| Error recovery | ✅ | ✅ | Retry on invalid tool JSON |
| Reasoning content (GLM) | ✅ | ✅ | `<think: ...>` tag wrapping |
| 8-layer system prompt | ✅ | ✅ | Identity, memory, tools, skills, timestamp, platform |
| Memory context injection | ✅ | ✅ | `<memory-context>` fenced block |
| Skills index injection | ✅ | ✅ | Dynamic via buildSkillsSystemPrompt() |
| Platform-specific hints | ✅ | ✅ | web, cli, telegram, discord, etc. |

### Streaming & Providers — ✅ 90% Complete

| Capability | Python | Web | Notes |
|-----------|--------|-----|-------|
| SSE delta streaming | ✅ | ✅ | Full ReadableStream pipeline |
| Reasoning/thinking tokens | ✅ | ✅ | Per-provider extraction |
| Tool start/end events | ✅ | ✅ | Real-time tool call visualization |
| NVIDIA NIM | ✅ | ✅ | Full support (18 models) |
| OpenAI | ✅ | ✅ | Full support including o-series (10 models) |
| Anthropic | ✅ | ✅ | Full support (6 models) |
| Google Gemini | ✅ | ✅ | Full support (5 models) |
| GLM / ZhipuAI | ✅ | ✅ | Custom reasoning_content extraction (14 models) |
| OpenRouter | ✅ | ✅ | Including Claude fine-grained streaming (5 models) |
| Token usage tracking | ✅ | ⚠️ | Non-streaming only; streaming shows 0 |
| Context compression | ✅ | ❌ | Not yet ported |
| Fallback providers | ✅ | ❌ | Not yet ported |
| Smart model routing | ✅ | ❌ | Not yet ported |

### Tools — ⚠️ 23% Executable (11/47)

| Tool | Python | Web | Status |
|------|--------|-----|--------|
| `web_search` | ✅ | ✅ | z-ai-web-dev-sdk |
| `web_extract` | ✅ | ✅ | z-ai-web-dev-sdk |
| `vision_analyze` | ✅ | ✅ | z-ai-web-dev-sdk VLM |
| `image_generate` | ✅ | ✅ | z-ai-web-dev-sdk |
| `text_to_speech` | ✅ | ✅ | z-ai-web-dev-sdk TTS |
| `memory` | ✅ | ✅ | MemoryManager (full CRUD) |
| `skills_list` | ✅ | ✅ | Skills scanner |
| `skill_view` | ✅ | ✅ | Skill content loader |
| `skill_manage` | ✅ | ✅ | Skill CRUD (self-evolution) |
| `todo` | ✅ | ✅ | In-memory task management |
| `session_search` | ✅ | ✅ | SQLite full-text search |
| `read_file` | ✅ | ❌ | Placeholder — needs VFS |
| `write_file` | ✅ | ❌ | Placeholder — needs VFS |
| `patch` | ✅ | ❌ | Placeholder — needs VFS |
| `search_files` | ✅ | ❌ | Placeholder — needs VFS |
| `terminal` | ✅ | ❌ | Placeholder — needs sandbox |
| `process` | ✅ | ❌ | Placeholder — needs terminal |
| `execute_code` | ✅ | ❌ | Placeholder — needs sandbox |
| `browser_navigate` | ✅ | ❌ | Placeholder — needs headless browser |
| `browser_snapshot` | ✅ | ❌ | Placeholder |
| `browser_click` | ✅ | ❌ | Placeholder |
| `browser_type` | ✅ | ❌ | Placeholder |
| `browser_scroll` | ✅ | ❌ | Placeholder |
| `browser_back` | ✅ | ❌ | Placeholder |
| `browser_press` | ✅ | ❌ | Placeholder |
| `browser_get_images` | ✅ | ❌ | Placeholder |
| `browser_vision` | ✅ | ❌ | Placeholder |
| `browser_console` | ✅ | ❌ | Placeholder |
| `clarify` | ✅ | ⚠️ | JSON placeholder response |
| `delegate_task` | ✅ | ❌ | Not yet ported — core agent feature |
| `cronjob` | ✅ | ⚠️ | DB storage only, no real scheduler |
| `send_message` | ✅ | ❌ | Requires gateway |
| `mixture_of_agents` | ✅ | ❌ | Not yet ported |
| `ha_*` (4 tools) | ✅ | ❌ | Requires Home Assistant |
| `rl_*` (10 tools) | ✅ | ❌ | Professional MLOps only |
| MCP dynamic tools | ✅ | ❌ | Not yet ported |

### Skills System — ✅ 90% Complete

| Capability | Python | Web | Notes |
|-----------|--------|-----|-------|
| Skill scanning (77+) | ✅ | ✅ | Multi-directory, YAML frontmatter |
| Skill content viewing | ✅ | ✅ | SKILL.md + linked files |
| Skill creation (self-evolution) | ✅ | ✅ | skill_manage tool |
| Skill editing/deletion | ✅ | ✅ | skill_manage tool |
| Category filtering | ✅ | ✅ | 25 categories |
| Built-in default skills | ✅ | ✅ | 11 defaults |
| Skills Hub sync | ✅ | ❌ | Not yet ported |
| Progressive disclosure (tier 0-3) | ✅ | ❌ | Not yet ported |
| Slash command activation | ✅ | ❌ | N/A for web |

### Memory — ✅ 95% Complete

| Capability | Python | Web | Notes |
|-----------|--------|-----|-------|
| MEMORY.md / USER.md | ✅ | ✅ | Dual stores |
| §-delimited sections | ✅ | ✅ | Structured memory |
| Prompt injection detection | ✅ | ✅ | 10 threat patterns |
| Unicode injection detection | ✅ | ✅ | Invisible characters |
| Character limits | ✅ | ✅ | 2200/1375 chars |
| Query-based prefetch | ✅ | ✅ | Substring matching |
| Atomic writes | ✅ | ✅ | Temp + rename |
| Frozen snapshot | ✅ | ✅ | Prefix cache stability |
| Deduplication on add | ✅ | ✅ | Content-based dedup |
| Frontend CRUD editor | — | ✅ | Add/Edit/Delete entries |

### Session & State — ✅ 90% Complete

| Capability | Python | Web | Notes |
|-----------|--------|-----|-------|
| Conversation persistence | ✅ | ✅ | SQLite via Prisma |
| History replay | ✅ | ✅ | Last 50 messages |
| Session CRUD | ✅ | ✅ | Create/list/delete |
| Title auto-generation | ✅ | ❌ | Not yet ported |
| Session export | ✅ | ❌ | UI shows "Coming soon" |

### Python-only Modules (Not Applicable to Web)

These modules exist in hermes-agent but are inherently CLI/desktop features:

| Module | Purpose | Web Equivalent |
|--------|---------|---------------|
| `gateway/` (15+ platforms) | Telegram, Discord, Slack, WhatsApp... | Web IS the platform |
| `display.py` | CLI display formatting | React UI components |
| `voice_mode.py` | Voice I/O via terminal | Not yet ported |
| `approval.py` | CLI approval prompts | Not yet ported |
| `environments/` | Docker/Modal/SSH/Daytona exec | Not yet ported |
| `credential_pool.py` | Multi-key rotation | Not yet ported |
| `context_compressor.py` | Long context summarization | Not yet ported |
| `trajectory.py` | Task trajectory recording | Not yet ported |
| `insights.py` | Conversation analytics | Not yet ported |

### Summary by Dimension

| Dimension | Coverage | Description |
|-----------|----------|-------------|
| **Core Architecture** | **95%** | Agent Loop, Provider, Config, Registry all ported |
| **Tool Execution** | **23%** | 11/47 tools have real handlers |
| **Skill System** | **90%** | Scanning, CRUD, display complete |
| **Memory System** | **95%** | Full port + frontend editor |
| **Session Management** | **90%** | Persistence, history, CRUD |
| **Frontend Views** | **85%** | 8 views implemented, some placeholders |
| **API Backend** | **80%** | Core APIs complete, some stubs |
| **Advanced Features** | **20%** | Compression, routing, title, approval missing |
| **Overall** | **~80%** | Core agent brain fully functional |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript 5 |
| **UI Library** | React 19 + shadcn/ui (New York) |
| **Styling** | Tailwind CSS 4 |
| **State** | Zustand 5 |
| **Animation** | Framer Motion |
| **Database** | Prisma + SQLite |
| **LLM Client** | OpenAI SDK (multi-provider) |
| **AI SDK** | z-ai-web-dev-sdk (vision, TTS, image gen, web) |
| **Runtime** | Bun |
| **Deployment** | [Vercel](https://hermes-agent-web.vercel.app) |

---

## Getting Started

### Prerequisites

- **Bun** (recommended) or Node.js 18+
- At least one **LLM API key**

### 1. Clone & Install

```bash
git clone https://github.com/dav-niu474/hermes-agent-web.git
cd hermes-agent-web
bun install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your API keys:

```env
# LLM Providers (at least one required)
NVIDIA_API_KEY="nvapi-..."
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."
GOOGLE_API_KEY="AI..."
GLM_API_KEY="..."
OPENROUTER_API_KEY="sk-or-..."
```

### 3. Setup Database

```bash
bunx prisma generate
bunx prisma db push
```

### 4. Run Development Server

```bash
bun dev
```

### 5. Deploy to Vercel

The project is deployed at **[hermes-agent-web.vercel.app](https://hermes-agent-web.vercel.app)**.

```bash
vercel deploy
```

---

## Project Structure

```
hermes-agent-web/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx            # Root page (app shell)
│   │   ├── layout.tsx          # Root layout
│   │   └── api/                # API routes (12 endpoints)
│   │       ├── chat/           # Agent chat with SSE streaming
│   │       ├── sessions/       # Session CRUD
│   │       ├── skills/         # Skill scanning & management
│   │       ├── memory/         # Memory management
│   │       ├── tools/          # Tool definitions
│   │       ├── config/         # Agent configuration
│   │       ├── hermes/         # Health check & info
│   │       ├── cronjobs/       # Scheduled tasks
│   │       └── stats/          # Dashboard statistics
│   ├── components/
│   │   ├── hermes/             # Main app components
│   │   │   ├── app-shell.tsx   # Layout shell + sidebar
│   │   │   ├── sidebar.tsx     # Navigation sidebar
│   │   │   ├── view-router.tsx # View switcher
│   │   │   └── views/          # 8 view components
│   │   │       ├── chat-view.tsx
│   │   │       ├── dashboard-view.tsx
│   │   │       ├── tools-view.tsx
│   │   │       ├── skills-view.tsx
│   │   │       ├── sessions-view.tsx
│   │   │       ├── memory-view.tsx
│   │   │       ├── settings-view.tsx
│   │   │       └── cronjobs-view.tsx
│   │   └── ui/                 # shadcn/ui components
│   ├── lib/
│   │   └── hermes/             # ⭐ Embedded Hermes Agent (TS rewrite)
│   │       ├── index.ts        # Public API barrel
│   │       ├── agent-loop.ts   # Full agent tool-calling loop
│   │       ├── provider.ts     # Multi-provider LLM abstraction
│   │       ├── tool-registry.ts # Dynamic tool registration
│   │       ├── toolsets.ts     # 35+ toolset definitions
│   │       ├── tools-registry.ts # 47 tool schema definitions
│   │       ├── registered-tools.ts # 16 tools with handlers
│   │       ├── default-skills.ts  # 11 default skill definitions
│   │       ├── models.ts       # 58 model catalog (single source of truth)
│   │       ├── skills.ts       # Skill scanning & management
│   │       ├── memory.ts       # Persistent memory system
│   │       ├── prompt-builder.ts # 8-layer system prompt
│   │       └── config.ts       # Configuration management
│   └── store/
│       └── app-store.ts        # Zustand global state
├── prisma/
│   └── schema.prisma           # Database schema (SQLite)
├── hermes-agent/               # Python source (reference submodule)
├── public/                     # Static assets
└── package.json
```

---

## Embedded Hermes Agent Modules

All Python modules rewritten in TypeScript and production-ready in `src/lib/hermes/`:

| Module | Lines | Python Source | Purpose |
|--------|-------|---------------|---------|
| `agent-loop.ts` | ~1,100 | `run_agent.py`, `agent_loop.py` | Tool-calling agent loop with iteration budget |
| `provider.ts` | ~740 | `auxiliary_client.py`, `runtime_provider.py` | Multi-provider LLM abstraction (6 providers) |
| `config.ts` | ~800 | `hermes_cli/config.py` | Configuration management |
| `skills.ts` | ~1,350 | `skill_utils.py`, `skills_tool.py` | Skill scanning, parsing, management |
| `tools-registry.ts` | ~1,240 | `tools/*.py` (47 tools) | Static tool schema definitions |
| `memory.ts` | ~710 | `memory_manager.py`, `memory_tool.py` | Persistent memory system |
| `toolsets.ts` | ~650 | `toolsets.py` | 35+ toolset definitions with resolution |
| `tool-registry.ts` | ~550 | `tools/registry.py` | Dynamic tool registration and dispatch |
| `prompt-builder.ts` | ~375 | `prompt_builder.py` | 8-layer system prompt assembly |
| `registered-tools.ts` | ~350 | Various tool handlers | 16 tools with real working handlers |
| `default-skills.ts` | ~560 | `skills/` | 11 default skills with SKILL.md content |
| `models.ts` | ~150 | N/A (new) | 58-model catalog (single source of truth) |
| **Total** | **~7,700** | | |

---

## Roadmap

### ✅ Phase 1: Core Agent (Complete)

- [x] Agent loop with multi-turn tool calling
- [x] 6 LLM providers with 58 models
- [x] 11 working web-compatible tools
- [x] SSE streaming with reasoning tokens
- [x] Memory system (MEMORY.md / USER.md)
- [x] Skills system with self-evolution
- [x] 8-layer prompt builder with skills + memory injection
- [x] Session history replay for context continuity
- [x] Chat UX (streaming, thinking, tool blocks, errors)
- [x] 8 frontend views (Chat, Dashboard, Tools, Skills, Sessions, Memory, Settings, Cronjobs)
- [x] Settings with 5 tabs (General, Model, Terminal, Memory, Advanced)

### 🔲 Phase 2: Enhanced Skills & Memory

- [ ] Skills Hub sync — Pull community skills from upstream
- [ ] Skill activation — Load skill instructions into system prompt on demand
- [ ] Session title auto-generation
- [ ] Session export (JSON)

### 🔲 Phase 3: Code & Terminal Execution

- [ ] Terminal execution tool (sandboxed shell)
- [ ] File operations (read, write, patch, search)
- [ ] Code execution sandbox
- [ ] Sub-agent delegation (delegate_task)

### 🔲 Phase 4: Browser Automation

- [ ] Headless browser mini-service (Playwright)
- [ ] Browser tool suite (navigate, click, type, screenshot, vision)

### 🔲 Phase 5: Advanced Agent Features

- [ ] Context window compression/summarization
- [ ] Smart model routing (cheapest capable model)
- [ ] Fallback providers (automatic failover)
- [ ] MCP (Model Context Protocol) support
- [ ] Mixture of Agents (multi-LLM reasoning)

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit your changes: `git commit -m 'feat: add my feature'`
4. Push to the branch: `git push origin feat/my-feature`
5. Open a Pull Request

---

## Acknowledgments

- [Hermes Agent](https://github.com/NousResearch/hermes-agent) by Nous Research — the original Python agent system
- [Next.js](https://nextjs.org/) — React framework
- [shadcn/ui](https://ui.shadcn.com/) — UI component library
- [Tailwind CSS](https://tailwindcss.com/) — Utility-first CSS
- [Vercel](https://vercel.com/) — Deployment platform

---

## License

MIT
