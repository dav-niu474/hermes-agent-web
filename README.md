# Hermes Agent Web

A full-featured web dashboard for [Hermes Agent](https://github.com/NousResearch/hermes-agent) — the open-source self-improving AI agent by Nous Research. Built with Next.js 16, the entire Hermes Agent backend is rewritten in TypeScript and embedded directly into the Next.js server, so you get the full agent experience in the browser — no Python runtime needed.

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16">
  <img src="https://img.shields.io/badge/React-19-blue?logo=react" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" alt="TypeScript 5">
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss" alt="Tailwind 4">
  <img src="https://img.shields.io/badge/shadcn/ui-New_York-18181b" alt="shadcn/ui">
  <img src="https://img.shields.io/badge/Prisma-7-2d3748?logo=prisma" alt="Prisma">
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

This project brings all of that to the web.

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
│  │  API Routes (10 endpoints)                               │ │
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
│  └─────────────────────────┬────────────────────────────────┘ │
│                            │                                   │
│  ┌─────────────────────────▼────────────────────────────────┐ │
│  │  External Services                                        │ │
│  │  PostgreSQL · NVIDIA NIM · OpenAI · Anthropic · Google   │ │
│  │  OpenRouter · GLM (ZhipuAI)                              │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

The entire Hermes Agent system (`agent/`, `tools/`, `hermes_cli/`, `skills/`) is rewritten from Python to TypeScript and lives in `src/lib/hermes/`. No Python runtime is needed.

---

## Current Features

### 💬 Chat with Multi-Provider LLM Support

Full SSE-streaming chat with the agent loop. Supports 6 LLM providers with 20+ models:

| Provider | Models |
|----------|--------|
| **NVIDIA NIM** | Llama 3.3 70B, Llama 3.1 405B, Mixtral 8x22B, Gemma 2 27B, Nemotron Super 49B, GLM 4.7, GLM 5 |
| **OpenAI** | GPT-4o, GPT-4o Mini, GPT-4 Turbo, o1-mini |
| **Anthropic** | Claude Sonnet 4, Claude 3.5 Sonnet, Claude 3.5 Haiku |
| **Google** | Gemini 2.5 Flash, Gemini 2.0 Flash |
| **GLM (ZhipuAI)** | GLM-4 Plus, GLM-4.5 Flash |
| **OpenRouter** | Claude Sonnet 4 (OR), GPT-4o (OR) |

The provider is auto-detected from the model name — no manual configuration needed.

### 🧠 8-Layer System Prompt Builder

Faithfully ported from the Python `prompt_builder.py`:

1. **Identity** — Agent persona and behavior instructions
2. **Memory guidance** — When/how to use memory tools
3. **Tool-use enforcement** — Configurable tool calling behavior
4. **System message** — Core system prompt
5. **Memory context** — Injected from MEMORY.md / USER.md
6. **Skills index** — Available skills and how to activate them
7. **Timestamp** — Current date/time for temporal awareness
8. **Platform hints** — Web-specific behavior instructions

### 🛠️ 45+ Tool Definitions with Full Schemas

All tools from the Python agent are defined with their complete JSON Schema parameters, descriptions, categories, and web-compatibility flags. Browsable in the Tools view.

| Category | Tools |
|----------|-------|
| Web & Search | `web_search`, `web_extract` |
| Terminal & Code | `terminal`, `execute_code`, `delegate_task` |
| File System | `read_file`, `write_file`, `patch`, `search_files` |
| Browser | `browser_navigate`, `browser_click`, `browser_type`, `browser_snapshot`, +8 more |
| Vision & Media | `vision_analyze`, `image_generate`, `text_to_speech` |
| Skills | `skills_list`, `skill_view`, `skill_manage` |
| Planning & Memory | `todo`, `memory`, `session_search`, `clarify` |
| Automation | `cronjob` |
| Messaging | `send_message` |
| Smart Home | `ha_list_entities`, `ha_get_state`, `ha_call_service`, +1 more |
| RL Training | 10 reinforcement learning tools |

### 📚 70+ Skills Catalog

All bundled skills are scannable and viewable:

| Category | Skills |
|----------|--------|
| **Software Dev** | plan, systematic-debugging, TDD, subagent-driven-development |
| **GitHub** | codebase-inspection, code-review, repo-management, PR workflow, issues |
| **MLOps** | axolotl, unsloth, GRPO RL training, PyTorch FSDP, TRL fine-tuning, PEFT, vLLM, llama.cpp, GGUF |
| **ML Research** | DSPy, research-paper-writing (ICLR/ICML/NeurIPS templates), lm-eval-harness, W&B |
| **Creative** | ASCII art/video, Excalidraw, Manim video, p5.js, 60+ website templates, songwriting |
| **Productivity** | Notion, PowerPoint, Linear, PDF, Google Workspace, OCR |
| **Media** | YouTube content, GIF search, music generation |
| **Communication** | Email (himalaya) |
| **Research** | arxiv, blogwatcher, LLM wiki, Polymarket |
| **MCP** | mcporter, native MCP |
| **DevOps** | webhook subscriptions |
| **Security** | godmode (red teaming) |

### 💾 Persistent Memory System

File-backed MEMORY.md / USER.md system with:
- §-delimited sections for structured memory
- Prompt injection detection and sanitization
- Character limits and relevance scoring
- Full CRUD via the Memory view and API

### 📊 Dashboard & Settings

- Real-time system health overview
- Provider/model configuration with auto-detection
- 4 theme styles (default, emerald, rose, ocean) + dark/light mode
- Responsive design (mobile sidebar drawer)

### 🗄️ Database Schema

PostgreSQL-backed persistence with Prisma ORM:

| Model | Purpose |
|-------|---------|
| `User` | User accounts |
| `ChatSession` | Conversation containers |
| `ChatMessage` | Messages with tokens, duration, tool calls |
| `AgentConfig` | Key-value configuration store |
| `ToolUsage` | Tool execution audit trail |
| `Skill` | Skill catalog |
| `CronJob` | Scheduled tasks |
| `MemoryEntry` | Persistent memory entries |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript 5 |
| **UI Library** | React 19 + shadcn/ui (New York) |
| **Styling** | Tailwind CSS 4 |
| **State** | Zustand 5 + TanStack Query |
| **Animation** | Framer Motion |
| **Database** | Prisma 7 + PostgreSQL |
| **LLM Client** | OpenAI SDK (multi-provider) |
| **Auth** | NextAuth.js v4 |
| **Runtime** | Bun |
| **Deployment** | Vercel (hkg1 region) |

---

## Getting Started

### Prerequisites

- **Bun** (recommended) or Node.js 18+
- A **PostgreSQL** database (Supabase, Neon, or self-hosted)
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

Edit `.env` with your database URL and API keys:

```env
# Database (PostgreSQL)
DATABASE_URL="postgres://user:pass@host:5432/hermes?sslmode=require"

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

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Deploy to Vercel

```bash
vercel deploy
```

Set the same environment variables in your Vercel project settings.

---

## Project Structure

```
hermes-agent-web/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx            # Root page (app shell)
│   │   ├── layout.tsx          # Root layout
│   │   └── api/                # API routes (10 endpoints)
│   │       ├── chat/           # Agent chat with SSE streaming
│   │       ├── sessions/       # Session CRUD
│   │       ├── skills/         # Skill scanning & viewing
│   │       ├── memory/         # Memory management
│   │       ├── tools/          # Tool definitions
│   │       ├── config/         # Agent configuration
│   │       ├── hermes/         # Health check & info
│   │       └── cronjobs/       # Scheduled tasks
│   ├── components/
│   │   ├── hermes/             # Main app components
│   │   │   ├── app-shell.tsx   # Layout shell + sidebar
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
│   │       ├── toolsets.ts     # 30+ toolset definitions
│   │       ├── tools-registry.ts # 45+ tool schema definitions
│   │       ├── skills.ts       # Skill scanning & management
│   │       ├── memory.ts       # Persistent memory system
│   │       ├── prompt-builder.ts # 8-layer system prompt
│   │       └── config.ts       # Configuration management
│   └── store/
│       └── app-store.ts        # Zustand global state
├── prisma/
│   └── schema.prisma           # Database schema
├── hermes-agent/               # Python source (reference)
│   ├── agent/                  # 23 agent modules
│   ├── tools/                  # 50+ tool implementations
│   ├── skills/                 # 70+ bundled skills
│   ├── gateway/                # 15+ messaging platform adapters
│   ├── hermes_cli/             # Full TUI client (37 files)
│   └── plugins/                # Memory provider plugins
├── public/                     # Static assets
└── package.json
```

---

## Roadmap: Full Hermes Agent Integration

The current web app has the agent's **brain** (LLM routing, prompt building, memory, tool definitions, skill scanning) fully working. The remaining work is connecting the **hands** — making tools actually execute in the web context. Here's the plan:

### Phase 1: Web-Compatible Tools (Now → Q2 2025)

Tools that can work in a serverless web context using server-side APIs.

| Tool | Implementation | Status |
|------|---------------|--------|
| `web_search` | Integrate Tavily/Brave Search API | 🔲 Planned |
| `web_extract` | Server-side HTTP fetching + content extraction | 🔲 Planned |
| `vision_analyze` | VLM API integration (via z-ai-web-dev-sdk) | 🔲 Planned |
| `image_generate` | Text-to-image API (via z-ai-web-dev-sdk) | 🔲 Planned |
| `text_to_speech` | TTS API integration | 🔲 Planned |
| `todo` | In-memory todo list with persistence | 🔲 Planned |
| `clarify` | Interactive clarification flow in chat UI | 🔲 Planned |
| `session_search` | Full-text search across chat history | 🔲 Planned |
| `cronjob` | Integrate with Vercel Cron or external scheduler | 🔲 Planned |

### Phase 2: Skill Execution (Q2 2025)

Move from "scan and read" to "activate and execute" skills.

- **Skill activation** — Allow the agent to load skill instructions into the system prompt on demand
- **Skill templates** — Render skill output templates (e.g., research paper, code review, website)
- **Skill CRUD** — Create, edit, delete custom skills from the web UI
- **Skills Hub sync** — Pull community skills from the upstream repository

### Phase 3: Sandboxed Code Execution (Q3 2025)

Run code safely in the browser/server context.

- **WebAssembly sandbox** — Run Python/JS snippets in WASM containers (via Pyodide or JupyterLite)
- **Docker-based execution** — Optional Docker backend for full terminal access
- **SSH/Remote execution** — Connect to remote dev environments
- **Code evaluation** — Support for multi-language code execution with output capture

### Phase 4: Browser Automation (Q3 2025)

Bring browser tools to the web via a headless browser backend.

- **Headless browser service** — Mini-service running Playwright/Puppeteer
- **Browser tool suite** — Navigate, click, type, screenshot, scroll, extract
- **Vision integration** — Browser screenshots → VLM analysis
- **Web scraping** — Automated data extraction workflows

### Phase 5: File Operations (Q3 2025)

Virtual filesystem for the web context.

- **Virtual FS layer** — In-browser or server-side file system
- **File tools** — read, write, patch, search across project files
- **Git integration** — Clone, commit, push via Git API
- **Cloud storage** — Connect to GitHub, S3, or other storage backends

### Phase 6: Advanced Agent Features (Q4 2025)

The most sophisticated capabilities from the Python agent.

| Feature | Description |
|---------|-------------|
| **Context compression** | Aggressive summarization when approaching context limits |
| **Smart model routing** | Automatically pick the cheapest capable model for each task |
| **Credential pool** | Rotate across multiple API keys for rate limit management |
| **Delegation** | Spawn sub-agents for parallel task execution |
| **Batch trajectories** | Generate training data from agent runs |
| **MCP connections** | Model Context Protocol server/client support |
| **Checkpoints** | Save/restore agent state for complex workflows |
| **Plugin system** | Pluggable memory providers, custom tools, extensions |

### Phase 7: Messaging Gateway (Q4 2025 → 2026)

Bring the multi-platform messaging system to the web.

- **WebSocket gateway** — Real-time bidirectional communication
- **Platform adapters** — Telegram, Discord, Slack, WhatsApp, Email
- **Push notifications** — Browser notifications for agent updates
- **Background tasks** — Long-running agent tasks with progress reporting

### Phase 8: RL Training & Self-Improvement (2026)

The most ambitious goal — enable the agent to improve itself.

- **RL training tools** — GRPO, PPO, DPO fine-tuning pipelines
- **Trajectory collection** — Gather agent interaction data
- **Evaluation harness** — Automated benchmarking
- **Model fine-tuning** — LoRA/QLoRA fine-tuning of hosted models
- **Self-play** — Agent critiques and improves its own outputs

---

## Embedded Hermes Agent Modules

The following Python modules have been fully rewritten in TypeScript and are production-ready in `src/lib/hermes/`:

| Module | Lines | Python Source | Purpose |
|--------|-------|---------------|---------|
| `agent-loop.ts` | ~1,100 | `run_agent.py`, `agent_loop.py` | Tool-calling agent loop with iteration budget |
| `provider.ts` | ~740 | `auxiliary_client.py`, `runtime_provider.py` | Multi-provider LLM abstraction |
| `tool-registry.ts` | ~550 | `tools/registry.py` | Dynamic tool registration and dispatch |
| `toolsets.ts` | ~650 | `toolsets.py` | 30+ toolset definitions with resolution |
| `tools-registry.ts` | ~700 | `tools/*.py` (45+ files) | Static tool schema definitions |
| `skills.ts` | ~1,300 | `skill_utils.py`, `skills_tool.py` | Skill scanning, parsing, management |
| `memory.ts` | ~710 | `memory_manager.py`, `memory_tool.py` | Persistent memory system |
| `prompt-builder.ts` | ~375 | `prompt_builder.py` | 8-layer system prompt assembly |
| `config.ts` | ~800 | `hermes_cli/config.py` | Configuration management |
| **Total** | **~6,900** | | |

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
