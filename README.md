# Hermes Agent Web

A full-featured web interface for [Hermes Agent](https://github.com/NousResearch/hermes-agent) — the open-source self-improving AI agent by Nous Research. The entire Hermes Agent backend is rewritten in TypeScript and embedded directly into the Next.js server, delivering the complete agent experience in the browser with no Python runtime required.

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16">
  <img src="https://img.shields.io/badge/React-19-blue?logo=react" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" alt="TypeScript 5">
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss" alt="Tailwind 4">
  <img src="https://img.shields.io/badge/shadcn/ui-New_York-18181b" alt="shadcn/ui">
  <img src="https://img.shields.io/badge/LLM-Multi_Provider-orange" alt="Multi Provider">
</p>

---

## What Is Hermes Agent?

[Hermes Agent](https://github.com/NousResearch/hermes-agent) is a self-improving AI agent that can:

- **Use tools** — terminal commands, file operations, web browsing, code execution, vision, image generation, TTS
- **Remember** — persistent file-backed memory (MEMORY.md / USER.md) across sessions
- **Learn skills** — 70+ bundled skills for software dev, MLOps, creative work, productivity, research, and more
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
│  │  API Routes (11 endpoints)                               │ │
│  │  /api/chat · /api/sessions · /api/skills                 │ │
│  │  /api/memory · /api/tools · /api/config · /api/cronjobs  │ │
│  └─────────────────────────┬────────────────────────────────┘ │
│                            │                                   │
│  ┌─────────────────────────▼────────────────────────────────┐ │
│  │  Embedded Hermes Agent (src/lib/hermes/)                  │ │
│  │  TypeScript rewrite of the Python backend                 │ │
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

### 🛠️ 12 Active Web-Compatible Tools

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
| `clarify` | ✅ | Interactive clarification |

### 📚 11 Default Skills + 70+ Catalog

11 built-in default skills with full SKILL.md instructions, plus the ability to scan all 70+ hermes-agent bundled skills:

| Category | Skills |
|----------|--------|
| **Core** | web-search, code-execution, file-operations, memory, skill-manager (self-evolution), todo |
| **AI/Media** | image-generation, text-to-speech, web-browser |
| **Utility** | clipboard |

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

### 🔄 Session History & Context Continuity

- Multi-turn conversations persist across requests
- Session history (last 50 messages) is loaded from DB and prepended to every request
- Deduplication ensures no duplicate messages
- Context flows naturally across tool-calling turns

### 🎨 Chat UX

- Real-time SSE streaming with typing cursor
- Thinking/reasoning blocks (collapsible, violet theme)
- Tool call blocks (running=amber+pulsing, done=emerald+checkmark, error=red)
- "Processing results..." indicator between tool calls
- Abort/stop generation with proper AbortController
- Auto-scroll with manual override
- Error banner with dismiss
- Copy message button
- Image upload with vision analysis
- Model selector with search, grouped by provider, tags (reasoning/fast/vision)

### 📊 Dashboard, Tools, Settings

- Dashboard with system health overview
- Tools view browsing all 45+ tool definitions
- Skills view with built-in/custom sections and SKILL.md content dialog
- Settings with provider/model configuration
- 4 theme styles + dark/light mode
- Responsive design (mobile sidebar drawer)

---

## Agent Capabilities — Feature Parity Matrix

| Capability | Hermes Agent (Python) | Hermes Agent Web | Notes |
|-----------|----------------------|-----------------|-------|
| **Agent Loop** | | | |
| Multi-turn tool calling | ✅ | ✅ | Full loop: LLM → tool → result → LLM |
| Parallel tool execution | ✅ | ✅ | Concurrent with limited workers |
| Iteration budget (90 turns) | ✅ | ✅ | Configurable maxIterations |
| Budget pressure warnings | ✅ | ✅ | 70%/90% thresholds |
| Context compression | ✅ | 🔲 | Planned (Phase 6) |
| Fallback providers | ✅ | 🔲 | Planned (Phase 6) |
| **Streaming** | | | |
| SSE delta streaming | ✅ | ✅ | Full ReadableStream pipeline |
| Reasoning/thinking tokens | ✅ | ✅ | Per-provider extraction |
| Token usage tracking | ✅ | ⚠️ | Non-streaming only; streaming shows 0 |
| **Providers** | | | |
| NVIDIA NIM | ✅ | ✅ | Full support |
| OpenAI | ✅ | ✅ | Full support including o-series |
| Anthropic | ✅ | ✅ | Via OpenAI-compatible proxy |
| Google Gemini | ✅ | ✅ | Full support |
| GLM / ZhipuAI | ✅ | ✅ | Custom reasoning_content extraction |
| OpenRouter | ✅ | ✅ | Including Claude fine-grained streaming |
| **Prompt Building** | | | |
| 8-layer system prompt | ✅ | ✅ | Identity, memory, tools, skills, timestamp, platform |
| Memory context injection | ✅ | ✅ | `<memory-context>` fenced block |
| Skills index injection | ✅ | ✅ | Dynamic via buildSkillsSystemPrompt() |
| Platform-specific hints | ✅ | ✅ | web, cli, telegram, etc. |
| **Tools** | | | |
| Web search & extract | ✅ | ✅ | z-ai-web-dev-sdk |
| Vision analysis | ✅ | ✅ | z-ai-web-dev-sdk VLM |
| Image generation | ✅ | ✅ | z-ai-web-dev-sdk |
| Text-to-speech | ✅ | ✅ | z-ai-web-dev-sdk |
| Memory CRUD | ✅ | ✅ | Full MEMORY.md / USER.md |
| Skills list/view/manage | ✅ | ✅ | Including self-evolution (create) |
| Todo management | ✅ | ✅ | In-memory |
| Session search | ✅ | ✅ | SQLite full-text |
| Clarification | ✅ | ✅ | JSON response |
| Terminal execution | ✅ | 🔲 | Planned (Phase 3) |
| Code execution | ✅ | 🔲 | Planned (Phase 3) |
| File read/write | ✅ | 🔲 | Planned (Phase 5) |
| Browser automation | ✅ | 🔲 | Planned (Phase 4) |
| **Skills System** | | | |
| Skill scanning (70+) | ✅ | ✅ | Multi-directory, YAML frontmatter |
| Skill content viewing | ✅ | ✅ | SKILL.md + linked files |
| Skill creation (self-evolution) | ✅ | ✅ | skill_manage tool |
| Skill editing/deletion | ✅ | ✅ | skill_manage tool |
| Skills Hub sync | ✅ | 🔲 | Planned (Phase 2) |
| **Memory** | | | |
| MEMORY.md / USER.md | ✅ | ✅ | Dual stores |
| Prompt injection detection | ✅ | ✅ | 10 threat patterns |
| Character limits | ✅ | ✅ | 2200/1375 chars |
| Query-based prefetch | ✅ | ✅ | Substring matching |
| **Session** | | | |
| Conversation persistence | ✅ | ✅ | SQLite via Prisma |
| History replay | ✅ | ✅ | Last 50 messages |
| Session CRUD | ✅ | ✅ | Create/list/delete |

**Overall: ~80% feature parity** — the core agent brain is fully functional. Remaining work is connecting the hands (terminal, code exec, file ops, browser).

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
| **Deployment** | Vercel |

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
│   │   └── api/                # API routes (11 endpoints)
│   │       ├── chat/           # Agent chat with SSE streaming
│   │       ├── sessions/       # Session CRUD
│   │       ├── skills/         # Skill scanning & management
│   │       ├── memory/         # Memory management
│   │       ├── tools/          # Tool definitions
│   │       ├── config/         # Agent configuration
│   │       ├── hermes/         # Health check & info
│   │       └── cronjobs/       # Scheduled tasks
│   ├── components/
│   │   ├── hermes/             # Main app components
│   │   │   ├── app-shell.tsx   # Layout shell + sidebar
│   │   │   └── views/          # 8 view components
│   │   └── ui/                 # shadcn/ui components
│   ├── lib/
│   │   └── hermes/             # ⭐ Embedded Hermes Agent (TS rewrite)
│   │       ├── index.ts        # Public API barrel
│   │       ├── agent-loop.ts   # Full agent tool-calling loop
│   │       ├── provider.ts     # Multi-provider LLM abstraction
│   │       ├── tool-registry.ts # Dynamic tool registration
│   │       ├── toolsets.ts     # 30+ toolset definitions
│   │       ├── tools-registry.ts # 45+ tool schema definitions
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
├── hermes-agent/               # Python source (reference)
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
| `tool-registry.ts` | ~550 | `tools/registry.py` | Dynamic tool registration and dispatch |
| `toolsets.ts` | ~650 | `toolsets.py` | 30+ toolset definitions with resolution |
| `tools-registry.ts` | ~700 | `tools/*.py` (45+ files) | Static tool schema definitions |
| `registered-tools.ts` | ~350 | Various tool handlers | 16 tools with real working handlers |
| `default-skills.ts` | ~560 | `skills/` | 11 default skills with SKILL.md content |
| `models.ts` | ~150 | N/A (new) | 58-model catalog (single source of truth) |
| `skills.ts` | ~1,300 | `skill_utils.py`, `skills_tool.py` | Skill scanning, parsing, management |
| `memory.ts` | ~710 | `memory_manager.py`, `memory_tool.py` | Persistent memory system |
| `prompt-builder.ts` | ~375 | `prompt_builder.py` | 8-layer system prompt assembly |
| `config.ts` | ~800 | `hermes_cli/config.py` | Configuration management |
| **Total** | **~7,700** | | |

---

## Roadmap

### ✅ Phase 1: Core Agent (Complete)

- [x] Agent loop with multi-turn tool calling
- [x] 6 LLM providers with 58 models
- [x] 12 working web-compatible tools
- [x] SSE streaming with reasoning tokens
- [x] Memory system (MEMORY.md / USER.md)
- [x] Skills system with self-evolution
- [x] 8-layer prompt builder with skills + memory injection
- [x] Session history replay for context continuity
- [x] Chat UX (streaming, thinking, tool blocks, errors)

### 🔲 Phase 2: Enhanced Skills

- [ ] Skills Hub sync — Pull community skills from upstream
- [ ] Skill activation — Load skill instructions into system prompt on demand
- [ ] Skill templates — Render skill output templates
- [ ] Custom skill editor — Web UI for creating/editing skills

### 🔲 Phase 3: Code Execution

- [ ] WebAssembly sandbox (Pyodide / JupyterLite)
- [ ] Docker-based execution backend
- [ ] Multi-language code execution with output capture

### 🔲 Phase 4: Browser Automation

- [ ] Headless browser mini-service (Playwright)
- [ ] Browser tool suite (navigate, click, type, screenshot)
- [ ] Vision integration (screenshot → VLM analysis)

### 🔲 Phase 5: File Operations

- [ ] Virtual filesystem layer
- [ ] File tools (read, write, patch, search)
- [ ] Git integration

### 🔲 Phase 6: Advanced Agent Features

- [ ] Context window compression/summarization
- [ ] Smart model routing (cheapest capable model)
- [ ] Fallback providers (automatic failover)
- [ ] Credential pool rotation
- [ ] Sub-agent delegation
- [ ] MCP (Model Context Protocol) support

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
