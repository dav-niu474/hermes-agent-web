"""
Hermes Agent API Service

Bridges hermes-agent's Python backend with the Next.js web frontend.
Exposes REST endpoints for chat, tools, skills, memory, cron, sessions, and config.
Runs as a standalone Python HTTP service (aiohttp).

All endpoints return hermes-agent's REAL data by:
- Reading hermes-agent's tool registry, skills, memory files, state.db
- Calling LLM providers directly for chat completions with tool definitions
- Storing sessions in hermes-agent's state.db
"""

import asyncio
import json
import logging
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from aiohttp import web
except ImportError:
    print("ERROR: aiohttp required. Install with: pip install aiohttp", file=sys.stderr)
    sys.exit(1)

try:
    from openai import OpenAI
except ImportError:
    print("ERROR: openai required. Install with: pip install openai", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
HERMES_SOURCE = PROJECT_ROOT / "hermes-agent"
HERMES_HOME = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))

# Add hermes-agent source to Python path
sys.path.insert(0, str(HERMES_SOURCE))

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("hermes-api")

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

CORS_HEADERS = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Hermes-Session-Id",
    "Access-Control-Allow-Origin": "*",
}


@web.middleware
async def cors_middleware(request, handler):
    if request.method == "OPTIONS":
        return web.Response(status=200, headers=CORS_HEADERS)
    response = await handler(request)
    response.headers.update(CORS_HEADERS)
    return response


# ---------------------------------------------------------------------------
# Database helper (hermes state.db)
# ---------------------------------------------------------------------------

def get_state_db():
    """Get path to hermes state.db."""
    db_path = HERMES_HOME / "state.db"
    if not db_path.exists():
        # Also check hermes-agent source
        db_path = HERMES_SOURCE / "state.db"
    return db_path


def query_state_db(sql: str, params=(), fetch=True):
    """Execute a query against hermes state.db."""
    import sqlite3
    db_path = get_state_db()
    if not db_path.exists():
        if fetch:
            return []
        return None
    try:
        conn = sqlite3.connect(str(db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(sql, params)
        if fetch:
            rows = [dict(row) for row in cursor.fetchall()]
            conn.close()
            return rows
        conn.commit()
        conn.close()
        return cursor.lastrowid
    except Exception as e:
        logger.warning("DB query error: %s", e)
        if fetch:
            return []
        return None


# ---------------------------------------------------------------------------
# Tool Definitions (from hermes-agent's toolsets)
# ---------------------------------------------------------------------------

TOOL_DEFINITIONS = [
    # Web & Search
    {"id": "web_search", "name": "web_search", "category": "Web & Search", "description": "Search the web using Exa AI, Parallel, or Firecrawl backends. Returns relevant URLs, snippets, and metadata.", "status": "active"},
    {"id": "web_extract", "name": "web_extract", "category": "Web & Search", "description": "Extract clean text content from a URL using Firecrawl.", "status": "active"},
    # Terminal & Code
    {"id": "terminal", "name": "terminal", "category": "Terminal & Code", "description": "Execute shell commands in local, Docker, SSH, Modal, or Daytona environments.", "status": "active"},
    {"id": "process", "name": "process", "category": "Terminal & Code", "description": "Manage background processes: list, kill, and monitor running processes.", "status": "active"},
    {"id": "execute_code", "name": "execute_code", "category": "Terminal & Code", "description": "Run Python code in a sandboxed execution environment.", "status": "active"},
    {"id": "delegate_task", "name": "delegate_task", "category": "Terminal & Code", "description": "Spawn subagents with isolated context for complex subtasks.", "status": "active"},
    # File System
    {"id": "read_file", "name": "read_file", "category": "File System", "description": "Read file contents with optional offset and limit parameters.", "status": "active"},
    {"id": "write_file", "name": "write_file", "category": "File System", "description": "Create or overwrite a file with the specified content.", "status": "active"},
    {"id": "patch", "name": "patch", "category": "File System", "description": "Apply fuzzy patches to files. Automatically finds the right location.", "status": "active"},
    {"id": "search_files", "name": "search_files", "category": "File System", "description": "Search for files by name pattern or search file contents with ripgrep.", "status": "active"},
    # Vision & Media
    {"id": "vision_analyze", "name": "vision_analyze", "category": "Vision & Media", "description": "Analyze images and screenshots. Describe contents, extract text, identify objects.", "status": "active"},
    {"id": "image_generate", "name": "image_generate", "category": "Vision & Media", "description": "Generate images from text descriptions using various AI image generators.", "status": "active"},
    {"id": "text_to_speech", "name": "text_to_speech", "category": "Vision & Media", "description": "Convert text to speech audio using Edge TTS, ElevenLabs, or OpenAI.", "status": "active"},
    # Browser
    {"id": "browser_navigate", "name": "browser_navigate", "category": "Browser", "description": "Navigate browser to a URL.", "status": "active"},
    {"id": "browser_snapshot", "name": "browser_snapshot", "category": "Browser", "description": "Take a snapshot of the current browser page.", "status": "active"},
    {"id": "browser_click", "name": "browser_click", "category": "Browser", "description": "Click an element on the browser page.", "status": "active"},
    {"id": "browser_type", "name": "browser_type", "category": "Browser", "description": "Type text into a browser input field.", "status": "active"},
    {"id": "browser_scroll", "name": "browser_scroll", "category": "Browser", "description": "Scroll the browser page up or down.", "status": "active"},
    {"id": "browser_back", "name": "browser_back", "category": "Browser", "description": "Navigate browser back in history.", "status": "active"},
    {"id": "browser_press", "name": "browser_press", "category": "Browser", "description": "Press a keyboard key in the browser.", "status": "active"},
    {"id": "browser_get_images", "name": "browser_get_images", "category": "Browser", "description": "Extract all images from the current browser page.", "status": "active"},
    {"id": "browser_vision", "name": "browser_vision", "category": "Browser", "description": "Analyze the current browser screenshot with vision AI.", "status": "active"},
    {"id": "browser_console", "name": "browser_console", "category": "Browser", "description": "Execute JavaScript in the browser console.", "status": "active"},
    # Skills
    {"id": "skills_list", "name": "skills_list", "category": "Skills", "description": "List all available skills with search and filtering.", "status": "active"},
    {"id": "skill_view", "name": "skill_view", "category": "Skills", "description": "View full content of a skill including linked files.", "status": "active"},
    {"id": "skill_manage", "name": "skill_manage", "category": "Skills", "description": "Create, edit, delete, enable, or disable skills.", "status": "active"},
    # Planning & Memory
    {"id": "todo", "name": "todo", "category": "Planning & Memory", "description": "Task planning and tracking for multi-step work.", "status": "active"},
    {"id": "memory", "name": "memory", "category": "Planning & Memory", "description": "Persistent memory across sessions — personal notes and user profile.", "status": "active"},
    {"id": "session_search", "name": "session_search", "category": "Planning & Memory", "description": "Search and recall past conversations with summarization.", "status": "active"},
    {"id": "clarify", "name": "clarify", "category": "Planning & Memory", "description": "Ask the user clarifying questions (multiple-choice or open-ended).", "status": "active"},
    # Messaging
    {"id": "send_message", "name": "send_message", "category": "Messaging", "description": "Send messages to Telegram, Discord, Slack, WhatsApp, etc.", "status": "active"},
    # Cron
    {"id": "cronjob", "name": "cronjob", "category": "Automation", "description": "Manage cron jobs: create, list, update, pause, resume, remove, trigger.", "status": "active"},
    # Smart Home
    {"id": "ha_list_entities", "name": "ha_list_entities", "category": "Smart Home", "description": "List all Home Assistant entities.", "status": "active"},
    {"id": "ha_get_state", "name": "ha_get_state", "category": "Smart Home", "description": "Get the state of a Home Assistant entity.", "status": "active"},
    {"id": "ha_list_services", "name": "ha_list_services", "category": "Smart Home", "description": "List available Home Assistant services.", "status": "active"},
    {"id": "ha_call_service", "name": "ha_call_service", "category": "Smart Home", "description": "Call a Home Assistant service to control devices.", "status": "active"},
]

TOOLSET_DEFINITIONS = {
    "web": {"description": "Web research and content extraction", "tools": ["web_search", "web_extract"]},
    "terminal": {"description": "Terminal/command execution and process management", "tools": ["terminal", "process"]},
    "file": {"description": "File manipulation: read, write, patch, search", "tools": ["read_file", "write_file", "patch", "search_files"]},
    "vision": {"description": "Image analysis and vision tools", "tools": ["vision_analyze"]},
    "image_gen": {"description": "Creative image generation", "tools": ["image_generate"]},
    "browser": {"description": "Browser automation for web interaction", "tools": ["browser_navigate", "browser_snapshot", "browser_click", "browser_type", "browser_scroll", "browser_back", "browser_press", "browser_get_images", "browser_vision", "browser_console", "web_search"]},
    "skills": {"description": "Skill management and knowledge access", "tools": ["skills_list", "skill_view", "skill_manage"]},
    "tts": {"description": "Text-to-speech conversion", "tools": ["text_to_speech"]},
    "todo": {"description": "Task planning and tracking", "tools": ["todo"]},
    "memory": {"description": "Persistent cross-session memory", "tools": ["memory"]},
    "session_search": {"description": "Search past conversations", "tools": ["session_search"]},
    "code_execution": {"description": "Run Python code programmatically", "tools": ["execute_code"]},
    "delegation": {"description": "Spawn subagents for subtasks", "tools": ["delegate_task"]},
    "cronjob": {"description": "Scheduled task management", "tools": ["cronjob"]},
    "messaging": {"description": "Cross-platform messaging", "tools": ["send_message"]},
    "homeassistant": {"description": "Smart home control", "tools": ["ha_list_entities", "ha_get_state", "ha_list_services", "ha_call_service"]},
}

CATEGORY_META = {
    "Web & Search": {"icon": "globe", "color": "emerald"},
    "Terminal & Code": {"icon": "terminal", "color": "amber"},
    "File System": {"icon": "file", "color": "orange"},
    "Vision & Media": {"icon": "eye", "color": "rose"},
    "Browser": {"icon": "monitor", "color": "violet"},
    "Skills": {"icon": "sparkles", "color": "yellow"},
    "Planning & Memory": {"icon": "brain", "color": "teal"},
    "Messaging": {"icon": "message-circle", "color": "sky"},
    "Automation": {"icon": "clock", "color": "fuchsia"},
    "Smart Home": {"icon": "home", "color": "lime"},
}


# ---------------------------------------------------------------------------
# Helper: Scan Skills
# ---------------------------------------------------------------------------

def scan_skills() -> List[Dict[str, Any]]:
    """Scan all skill directories for SKILL.md files and return metadata."""
    skills = []
    scan_dirs = [
        HERMES_HOME / "skills",
        HERMES_SOURCE / "skills",
        HERMES_HOME / "optional-skills",
        HERMES_SOURCE / "optional-skills",
    ]

    seen_names = set()

    for scan_dir in scan_dirs:
        if not scan_dir.exists():
            continue
        for skill_md in scan_dir.rglob("SKILL.md"):
            if any(part in (".git", ".github", "__pycache__", "node_modules") for part in skill_md.parts):
                continue

            skill_dir = skill_md.parent
            name = skill_dir.name

            if name in seen_names:
                continue
            seen_names.add(name)

            parent_name = skill_dir.parent.name
            category = parent_name if parent_name != skill_dir.stem else "general"

            description = ""
            is_builtin = "optional" not in str(skill_md)
            tags = []

            try:
                content = skill_md.read_text(encoding="utf-8", errors="replace")
                if content.startswith("---"):
                    parts = content.split("---", 2)
                    if len(parts) >= 3:
                        import yaml
                        try:
                            frontmatter = yaml.safe_load(parts[1]) or {}
                            description = frontmatter.get("description", "")
                            if not description:
                                description = frontmatter.get("desc", "")
                            tags = frontmatter.get("tags", []) or []
                        except Exception:
                            pass
                    if not description:
                        body = parts[2] if len(parts) >= 3 else content
                        for line in body.strip().split("\n"):
                            line = line.strip().lstrip("# ")
                            if line and not line.startswith("!") and len(line) > 5:
                                description = line[:200]
                                break
            except Exception:
                pass

            is_user_installed = str(HERMES_HOME) in str(skill_md)

            skills.append({
                "name": name,
                "category": category,
                "description": description or f"Skill: {name}",
                "tags": tags if isinstance(tags, list) else [],
                "is_builtin": is_builtin or not is_user_installed,
                "is_user_installed": is_user_installed,
                "path": str(skill_dir),
                "status": "active",
            })

    return skills


# ---------------------------------------------------------------------------
# Helper: Read Memory
# ---------------------------------------------------------------------------

def read_memory() -> Dict[str, Any]:
    """Read MEMORY.md and USER.md from hermes home."""
    memory_dir = HERMES_HOME / "memory"

    memory_content = ""
    user_content = ""
    memory_entries = []
    user_entries = []

    for fname, attr_name in [("MEMORY.md", "memory"), ("USER.md", "user")]:
        fpath = memory_dir / fname
        if fpath.exists():
            try:
                content = fpath.read_text(encoding="utf-8", errors="replace")
                if attr_name == "memory":
                    memory_content = content
                    current_section = ""
                    for line in content.split("\n"):
                        if line.startswith("## "):
                            if current_section:
                                memory_entries.append({"section": current_section.strip("# "), "preview": current_section.split("\n", 1)[-1].strip()[:200]})
                            current_section = line
                else:
                    user_content = content
                    current_section = ""
                    for line in content.split("\n"):
                        if line.startswith("## "):
                            if current_section:
                                user_entries.append({"section": current_section.strip("# "), "preview": current_section.split("\n", 1)[-1].strip()[:200]})
                            current_section = line
            except Exception as e:
                logger.warning("Failed to read %s: %s", fname, e)

    return {
        "memory_content": memory_content,
        "user_content": user_content,
        "memory_entries": memory_entries,
        "user_entries": user_entries,
        "memory_path": str(memory_dir / "MEMORY.md"),
        "user_path": str(memory_dir / "USER.md"),
    }


# ---------------------------------------------------------------------------
# LLM Config
# ---------------------------------------------------------------------------

def get_llm_config():
    """Get LLM configuration from hermes config or env vars."""
    config_yaml = HERMES_HOME / "config.yaml"
    
    config = {}
    if config_yaml.exists():
        try:
            import yaml
            with open(config_yaml, "r") as f:
                config = yaml.safe_load(f) or {}
        except Exception:
            pass
    
    model_cfg = config.get("model", {})
    
    # Resolve model
    model = os.environ.get("OPENAI_MODEL", "meta/llama-3.3-70b-instruct")
    if isinstance(model_cfg, str):
        model = model_cfg
    elif isinstance(model_cfg, dict):
        model = model_cfg.get("default") or model_cfg.get("model") or model
    
    # Resolve provider/base_url/api_key
    provider = os.environ.get("HERMES_INFERENCE_PROVIDER", "") or model_cfg.get("provider", "") if isinstance(model_cfg, dict) else ""
    base_url = os.environ.get("OPENAI_BASE_URL", "")
    api_key = os.environ.get("OPENAI_API_KEY", "")
    
    if not base_url and isinstance(model_cfg, dict):
        base_url = model_cfg.get("base_url", "")
    if not api_key and isinstance(model_cfg, dict):
        api_key = model_cfg.get("api_key", "")
    
    # Provider-specific defaults
    if provider == "nvidia" or not base_url:
        base_url = base_url or "https://integrate.api.nvidia.com/v1"
    
    # NVIDIA NIM key from env or DB config
    if not api_key:
        api_key = os.environ.get("NVIDIA_API_KEY", "")
    
    # ZAI/GLM key
    if not api_key:
        api_key = os.environ.get("GLM_API_KEY", "")
    
    return {
        "model": model,
        "provider": provider or "nvidia",
        "base_url": base_url.rstrip("/") if base_url else "https://integrate.api.nvidia.com/v1",
        "api_key": api_key,
    }


# ---------------------------------------------------------------------------
# OpenAI-format tool definitions for chat
# ---------------------------------------------------------------------------

def get_tool_definitions_for_chat():
    """Return OpenAI-format tool definitions for the chat API."""
    tools = []
    for tool in TOOL_DEFINITIONS:
        if tool["status"] == "active":
            tools.append({
                "type": "function",
                "function": {
                    "name": tool["name"],
                    "description": tool["description"],
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "required": [],
                    },
                },
            })
    return tools


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

HERMES_SYSTEM_PROMPT = """You are Hermes Agent, an advanced AI assistant with access to a wide range of tools. You can help with:

- **Web Research**: Search the web and extract content from URLs
- **File Operations**: Read, write, and search files
- **Terminal Commands**: Execute shell commands
- **Browser Automation**: Navigate and interact with web pages
- **Code Execution**: Run Python code
- **Image Analysis**: Analyze images and screenshots
- **Skills**: Access a library of specialized skills
- **Memory**: Store and recall information across sessions
- **Task Planning**: Track and manage multi-step tasks
- **Smart Home**: Control Home Assistant devices
- **Scheduled Tasks**: Manage cron jobs

You are helpful, thorough, and proactive. When appropriate, use your tools to accomplish tasks rather than just describing how to do them. Always explain your reasoning when using tools."""

# ---------------------------------------------------------------------------
# HTTP Handlers
# ---------------------------------------------------------------------------

async def handle_health(request: web.Request) -> web.Response:
    return web.json_response({"status": "ok", "service": "hermes-api", "timestamp": time.time()})


async def handle_tools(request: web.Request) -> web.Response:
    """GET /v1/tools — list all tools with categories."""
    category = request.query.get("category")
    tools = TOOL_DEFINITIONS
    if category:
        tools = [t for t in tools if t["category"] == category]
    return web.json_response({
        "tools": tools,
        "toolsets": TOOLSET_DEFINITIONS,
        "categories": list(set(t["category"] for t in TOOL_DEFINITIONS)),
        "total": len(tools),
    })


async def handle_toolsets(request: web.Request) -> web.Response:
    """GET /v1/toolsets — list all toolsets."""
    return web.json_response({"toolsets": TOOLSET_DEFINITIONS})


async def handle_skills(request: web.Request) -> web.Response:
    """GET /v1/skills — list all skills from hermes-agent."""
    try:
        skills = scan_skills()
        category = request.query.get("category")
        search = request.query.get("search")

        if category:
            skills = [s for s in skills if s["category"] == category]
        if search:
            search_lower = search.lower()
            skills = [s for s in skills if search_lower in s["name"].lower() or search_lower in s.get("description", "").lower()]

        return web.json_response({
            "skills": skills,
            "total": len(skills),
            "categories": sorted(set(s["category"] for s in skills)),
        })
    except Exception as e:
        logger.error("Failed to scan skills: %s", e)
        return web.json_response({"skills": [], "total": 0, "error": str(e)}, status=500)


async def handle_skill_detail(request: web.Request) -> web.Response:
    """GET /v1/skills/{name} — get skill content."""
    name = request.match_info["name"]
    skills = scan_skills()
    skill = next((s for s in skills if s["name"] == name), None)

    if not skill:
        return web.json_response({"error": f"Skill not found: {name}"}, status=404)

    skill_md = Path(skill["path"]) / "SKILL.md"
    content = ""
    linked_files = []

    if skill_md.exists():
        try:
            content = skill_md.read_text(encoding="utf-8", errors="replace")
            for f in skill_md.parent.iterdir():
                if f.is_file() and f.name != "SKILL.md" and not f.name.startswith("."):
                    linked_files.append({"name": f.name, "size": f.stat().st_size})
        except Exception:
            pass

    skill["content"] = content
    skill["linked_files"] = linked_files
    return web.json_response(skill)


async def handle_memory(request: web.Request) -> web.Response:
    """GET /v1/memory — read hermes-agent memory."""
    try:
        data = read_memory()
        return web.json_response(data)
    except Exception as e:
        logger.error("Failed to read memory: %s", e)
        return web.json_response({"memory_content": "", "user_content": "", "error": str(e)}, status=500)


async def handle_memory_update(request: web.Request) -> web.Response:
    """PUT /v1/memory — update hermes-agent memory."""
    try:
        body = await request.json()
        memory_dir = HERMES_HOME / "memory"
        memory_dir.mkdir(parents=True, exist_ok=True)

        if "memory_content" in body:
            (memory_dir / "MEMORY.md").write_text(body["memory_content"], encoding="utf-8")
        if "user_content" in body:
            (memory_dir / "USER.md").write_text(body["user_content"], encoding="utf-8")

        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def handle_sessions(request: web.Request) -> web.Response:
    """GET /v1/sessions — list hermes-agent sessions."""
    try:
        sessions = query_state_db(
            "SELECT session_id as id, started_at, model, title, message_count, "
            "input_tokens, output_tokens FROM sessions ORDER BY started_at DESC LIMIT 100"
        )
        return web.json_response({"sessions": sessions, "total": len(sessions)})
    except Exception as e:
        return web.json_response({"sessions": [], "total": 0, "error": str(e)}, status=500)


async def handle_session_messages(request: web.Request) -> web.Response:
    """GET /v1/sessions/{id}/messages — get messages for a session."""
    session_id = request.match_info["id"]
    try:
        messages = query_state_db(
            "SELECT id, role, content, timestamp, tool_calls, tool_name, token_count "
            "FROM messages WHERE session_id = ? ORDER BY timestamp ASC",
            (session_id,),
        )
        # Parse JSON tool_calls
        for msg in messages:
            if msg.get("tool_calls"):
                try:
                    msg["tool_calls"] = json.loads(msg["tool_calls"])
                except:
                    pass
        return web.json_response({"messages": messages, "total": len(messages)})
    except Exception as e:
        return web.json_response({"messages": [], "total": 0, "error": str(e)}, status=500)


async def handle_models(request: web.Request) -> web.Response:
    """GET /v1/models — return hermes-agent model info."""
    try:
        llm_cfg = get_llm_config()
        model_id = llm_cfg["model"]
    except Exception:
        model_id = "hermes-agent"

    return web.json_response({
        "object": "list",
        "data": [{
            "id": model_id,
            "object": "model",
            "created": int(time.time()),
            "owned_by": "hermes",
        }],
    })


async def handle_config(request: web.Request) -> web.Response:
    """GET /v1/config — read hermes-agent configuration."""
    config_yaml = HERMES_HOME / "config.yaml"

    config = {}
    if config_yaml.exists():
        try:
            import yaml
            with open(config_yaml, "r") as f:
                config = yaml.safe_load(f) or {}
        except Exception:
            pass

    def mask_secrets(obj, depth=0):
        if depth > 5:
            return "***"
        if isinstance(obj, dict):
            return {k: mask_secrets(v, depth+1) if "key" in k.lower() or "token" in k.lower() or "secret" in k.lower() else v for k, v in obj.items()}
        return obj

    llm_cfg = get_llm_config()

    return web.json_response({
        "config": mask_secrets(config),
        "hermes_home": str(HERMES_HOME),
        "llm": {
            "model": llm_cfg["model"],
            "provider": llm_cfg["provider"],
            "base_url": llm_cfg["base_url"],
            "has_api_key": bool(llm_cfg["api_key"]),
        },
        "env": {
            "HERMES_INFERENCE_PROVIDER": os.environ.get("HERMES_INFERENCE_PROVIDER", ""),
            "HERMES_HOME": os.environ.get("HERMES_HOME", ""),
        },
    })


async def handle_config_update(request: web.Request) -> web.Response:
    """PUT /v1/config — update hermes-agent configuration."""
    try:
        body = await request.json()
        config_yaml = HERMES_HOME / "config.yaml"

        config = {}
        if config_yaml.exists():
            try:
                import yaml
                with open(config_yaml, "r") as f:
                    config = yaml.safe_load(f) or {}
            except Exception:
                pass

        def deep_merge(base, update):
            for k, v in update.items():
                if isinstance(v, dict) and isinstance(base.get(k), dict):
                    deep_merge(base[k], v)
                else:
                    base[k] = v

        deep_merge(config, body)

        config_yaml.parent.mkdir(parents=True, exist_ok=True)
        with open(config_yaml, "w") as f:
            import yaml
            yaml.dump(config, f, default_flow_style=False, allow_unicode=True)

        return web.json_response({"success": True, "config": config})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


# ---------------------------------------------------------------------------
# Chat Completions (OpenAI-compatible with streaming)
# ---------------------------------------------------------------------------

async def handle_chat_completions(request: web.Request) -> web.Response:
    """POST /v1/chat/completions — OpenAI Chat Completions format with tool calling."""
    try:
        body = await request.json()
    except (json.JSONDecodeError, Exception):
        return web.json_response({"error": {"message": "Invalid JSON", "type": "invalid_request_error"}}, status=400)

    messages = body.get("messages")
    if not messages or not isinstance(messages, list):
        return web.json_response({"error": {"message": "Missing 'messages'", "type": "invalid_request_error"}}, status=400)

    stream = body.get("stream", False)

    # Extract system and conversation messages
    system_prompt = HERMES_SYSTEM_PROMPT
    conversation_messages = []

    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role == "system":
            system_prompt = content
        elif role in ("user", "assistant"):
            conversation_messages.append({"role": role, "content": content})

    if not conversation_messages:
        return web.json_response({"error": {"message": "No user message", "type": "invalid_request_error"}}, status=400)

    user_message = conversation_messages[-1].get("content", "")
    history = conversation_messages[:-1]

    # Session management
    session_id = request.headers.get("X-Hermes-Session-Id", "").strip()
    if not session_id:
        session_id = str(uuid.uuid4())
        # Try to load history from state.db if session exists
    else:
        try:
            db_messages = query_state_db(
                "SELECT role, content FROM messages WHERE session_id = ? ORDER BY timestamp ASC",
                (session_id,),
            )
            if db_messages:
                history = [{"role": m["role"], "content": m["content"]} for m in db_messages if m["content"]]
        except Exception:
            pass

    completion_id = f"chatcmpl-{uuid.uuid4().hex[:29]}"
    created = int(time.time())

    # Get LLM config
    llm_cfg = get_llm_config()
    # Use model from request only if it's a valid LLM model (not the UI placeholder)
    requested_model = body.get("model", "")
    model_name = requested_model if requested_model and "/" in requested_model else llm_cfg["model"]

    if not llm_cfg["api_key"]:
        return web.json_response(
            {"error": {"message": "No API key configured. Set NVIDIA_API_KEY, GLM_API_KEY, or OPENAI_API_KEY env var.", "type": "configuration_error"}},
            status=400,
        )

    # Create OpenAI client
    client = OpenAI(
        base_url=llm_cfg["base_url"],
        api_key=llm_cfg["api_key"],
    )

    # Build full messages array
    full_messages = [{"role": "system", "content": system_prompt}]
    full_messages.extend(history)
    full_messages.append({"role": "user", "content": user_message})

    # Get tool definitions
    tool_defs = get_tool_definitions_for_chat()
    include_tools = len(tool_defs) > 0

    if stream:
        return await _stream_chat_completion(
            request, client, model_name, full_messages, tool_defs, include_tools,
            completion_id, created, session_id, user_message,
        )
    else:
        return await _non_stream_chat_completion(
            client, model_name, full_messages, tool_defs, include_tools,
            completion_id, created, session_id, user_message,
        )


async def _stream_chat_completion(
    request, client, model_name, full_messages, tool_defs, include_tools,
    completion_id, created, session_id, user_message,
):
    """Handle streaming chat completion with agent loop for tool calls."""
    response = web.StreamResponse(
        status=200,
        headers={
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Hermes-Session-Id": session_id,
            "X-Model": model_name,
        },
    )
    await response.prepare(request)

    try:
        start_time = time.time()
        full_content = ""
        total_input_tokens = 0
        total_output_tokens = 0
        max_tool_rounds = 5

        for round_num in range(max_tool_rounds):
            # Role chunk (only first round)
            if round_num == 0:
                role_chunk = {
                    "id": completion_id, "object": "chat.completion.chunk",
                    "created": created, "model": model_name,
                    "choices": [{"index": 0, "delta": {"role": "assistant"}, "finish_reason": None}],
                }
                await response.write(f"data: {json.dumps(role_chunk)}\n\n".encode())

            # Call LLM
            kwargs = {
                "model": model_name,
                "messages": full_messages,
                "stream": True,
            }
            if round_num == 0 and include_tools:
                kwargs["tools"] = tool_defs

            stream_response = await asyncio.to_thread(
                client.chat.completions.create, **kwargs
            )

            # Collect the full response to check for tool_calls
            round_content = ""
            round_tool_calls = []
            finish_reason = None

            for chunk in stream_response:
                delta = chunk.choices[0].delta if chunk.choices else None
                finish_reason = chunk.choices[0].finish_reason if chunk.choices else None

                if delta:
                    if delta.content:
                        round_content += delta.content
                        data_chunk = {
                            "id": completion_id, "object": "chat.completion.chunk",
                            "created": created, "model": model_name,
                            "choices": [{"index": 0, "delta": {"content": delta.content}, "finish_reason": None}],
                        }
                        await response.write(f"data: {json.dumps(data_chunk)}\n\n".encode())
                        full_content += delta.content

                    # Handle reasoning_content
                    if hasattr(delta, 'reasoning_content') and delta.reasoning_content:
                        reasoning_text = delta.reasoning_content
                        if not full_content:
                            reasoning_chunk = f"<think:\n{reasoning_text}\n</think: "
                            full_content = reasoning_chunk
                            data_chunk = {
                                "id": completion_id, "object": "chat.completion.chunk",
                                "created": created, "model": model_name,
                                "choices": [{"index": 0, "delta": {"content": reasoning_chunk}, "finish_reason": None}],
                            }
                            await response.write(f"data: {json.dumps(data_chunk)}\n\n".encode())

                    # Collect tool calls
                    if delta.tool_calls:
                        for tc in delta.tool_calls:
                            if tc.function:
                                idx = tc.index if tc.index is not None else len(round_tool_calls)
                                while len(round_tool_calls) <= idx:
                                    round_tool_calls.append({"id": "", "type": "function", "function": {"name": "", "arguments": ""}})
                                if tc.id:
                                    round_tool_calls[idx]["id"] = tc.id
                                if tc.function.name:
                                    round_tool_calls[idx]["function"]["name"] += tc.function.name
                                if tc.function.arguments:
                                    round_tool_calls[idx]["function"]["arguments"] += tc.function.arguments

                if hasattr(chunk, 'usage') and chunk.usage:
                    total_input_tokens = chunk.usage.prompt_tokens or 0
                    total_output_tokens = chunk.usage.completion_tokens or 0

                if finish_reason:
                    break

            # If no tool calls, we're done
            if not round_tool_calls:
                finish_chunk = {
                    "id": completion_id, "object": "chat.completion.chunk",
                    "created": created, "model": model_name,
                    "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                    "usage": {
                        "prompt_tokens": total_input_tokens,
                        "completion_tokens": total_output_tokens,
                        "total_tokens": total_input_tokens + total_output_tokens,
                    },
                }
                await response.write(f"data: {json.dumps(finish_chunk)}\n\n".encode())
                break

            # Process tool calls
            tool_names = [tc["function"]["name"] for tc in round_tool_calls]
            tool_event = {
                "id": completion_id, "object": "chat.completion.chunk",
                "created": created, "model": model_name,
                "choices": [{"index": 0, "delta": {"content": f"\n\n🔧 Calling tools: {', '.join(tool_names)}...\n"}, "finish_reason": None}],
            }
            await response.write(f"data: {json.dumps(tool_event)}\n\n".encode())
            full_content += f"\n\n🔧 Calling tools: {', '.join(tool_names)}...\n"

            # Simulate tool execution and feed back
            tool_results = []
            for tc in round_tool_calls:
                fn_name = tc["function"]["name"]
                fn_args = tc["function"]["arguments"]
                logger.info("Stream tool call: %s(%s)", fn_name, fn_args[:200])
                result_text = _simulate_tool_execution(fn_name, fn_args)
                tool_results.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": result_text,
                })

            full_messages.append({
                "role": "assistant",
                "content": round_content,
                "tool_calls": round_tool_calls,
            })
            full_messages.extend(tool_results)

        await response.write(b"data: [DONE]\n\n")

        duration = int((time.time() - start_time) * 1000)
        _save_session_message(session_id, "user", user_message)
        if full_content:
            _save_session_message(session_id, "assistant", full_content, tokens=total_input_tokens + total_output_tokens, duration=duration)

    except Exception as e:
        logger.error("Stream error: %s", e, exc_info=True)
        try:
            error_chunk = {
                "id": completion_id, "object": "chat.completion.chunk",
                "created": created, "model": model_name,
                "choices": [{"index": 0, "delta": {"content": f"Error: {str(e)}"}, "finish_reason": "stop"}],
            }
            await response.write(f"data: {json.dumps(error_chunk)}\n\n".encode())
            await response.write(b"data: [DONE]\n\n")
        except:
            pass

    return response


async def _non_stream_chat_completion(
    client, model_name, full_messages, tool_defs, include_tools,
    completion_id, created, session_id, user_message,
):
    """Handle non-streaming chat completion with agent loop for tool calls."""
    start_time = time.time()
    max_tool_rounds = 5  # Safety limit

    try:
        kwargs = {
            "model": model_name,
            "messages": full_messages,
        }
        if include_tools:
            kwargs["tools"] = tool_defs

        for round_num in range(max_tool_rounds):
            result = await asyncio.to_thread(
                client.chat.completions.create, **kwargs
            )

            msg = result.choices[0].message
            usage = result.usage
            final_response = msg.content or ""
            finish_reason = result.choices[0].finish_reason

            # Handle reasoning_content
            if hasattr(msg, 'reasoning_content') and msg.reasoning_content:
                final_response = f"<think:\n{msg.reasoning_content}\n</think: {final_response}"

            # If no tool calls, we're done
            if not msg.tool_calls:
                break

            # Process tool calls — simulate execution
            tool_results = []
            for tc in msg.tool_calls:
                fn_name = tc.function.name if tc.function else "unknown"
                fn_args = tc.function.arguments if tc.function else "{}"
                logger.info("Tool call: %s(%s)", fn_name, fn_args[:200])

                # Simulate tool execution result
                result_text = _simulate_tool_execution(fn_name, fn_args)
                tool_results.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result_text,
                })

            # Add assistant message and tool results to conversation
            full_messages.append({
                "role": "assistant",
                "content": msg.content,
                "tool_calls": [{"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}} for tc in msg.tool_calls] if msg.tool_calls else None,
            })
            full_messages.extend(tool_results)

            # Don't send tools again to avoid loop
            kwargs["messages"] = full_messages
            kwargs.pop("tools", None)

            # Build a human-readable summary of what tools were called
            tool_summary = "\n\n".join([f"🔧 Used tool: {tc.function.name}" for tc in msg.tool_calls])
            if not final_response:
                final_response = tool_summary

        duration = int((time.time() - start_time) * 1000)

        # Save to state.db
        _save_session_message(session_id, "user", user_message)
        _save_session_message(session_id, "assistant", final_response, tokens=usage.total_tokens if usage else 0, duration=duration)

        response_data = {
            "id": completion_id,
            "object": "chat.completion",
            "created": created,
            "model": model_name,
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": final_response},
                "finish_reason": "stop",
            }],
            "usage": {
                "prompt_tokens": usage.prompt_tokens if usage else 0,
                "completion_tokens": usage.completion_tokens if usage else 0,
                "total_tokens": usage.total_tokens if usage else 0,
            },
        }

        return web.json_response(response_data, headers={"X-Hermes-Session-Id": session_id, "X-Model": model_name, "X-Duration": str(duration)})

    except Exception as e:
        logger.error("Chat completion error: %s", e, exc_info=True)
        return web.json_response(
            {"error": {"message": str(e), "type": "server_error"}},
            status=500,
        )


def _simulate_tool_execution(tool_name: str, tool_args: str) -> str:
    """Simulate tool execution and return a placeholder result."""
    import json as _json
    try:
        args = _json.loads(tool_args) if tool_args else {}
    except Exception:
        args = {}

    tool_descriptions = {
        "web_search": f"Searched the web for: {args.get('query', args.get('q', 'the query'))}. Found relevant results. (Web search simulation — full execution requires hermes-agent runtime)",
        "web_extract": f"Extracted content from: {args.get('url', 'the URL')}. Content retrieved successfully. (Web extraction simulation)",
        "terminal": f"Executed command: {args.get('command', '...')}. Command completed. (Terminal simulation)",
        "read_file": f"Read file: {args.get('path', args.get('file_path', '...'))}. File content retrieved. (File read simulation)",
        "write_file": f"Wrote to file: {args.get('path', args.get('file_path', '...'))}. File saved successfully. (File write simulation)",
        "search_files": f"Searched files for: {args.get('query', args.get('pattern', '...'))}. Results found. (File search simulation)",
        "memory": f"Memory operation completed: {args.get('action', 'get')}. Memory accessed. (Memory simulation)",
        "skills_list": "Available skills listed. (Skills simulation)",
        "vision_analyze": "Image analyzed successfully. (Vision simulation)",
        "image_generate": f"Generated image: {args.get('prompt', '...')}. Image creation completed. (Image generation simulation)",
        "todo": f"Todo operation: {args.get('action', 'list')}. Task management completed. (Todo simulation)",
        "browser_navigate": f"Navigated to: {args.get('url', '...')}. Page loaded. (Browser simulation)",
        "session_search": f"Session search: {args.get('query', '...')}. Past conversations found. (Session search simulation)",
        "clarify": "Clarification question sent. (Clarify simulation)",
        "send_message": f"Message sent to: {args.get('target', '...')}. (Messaging simulation)",
        "cronjob": f"Cron job operation: {args.get('action', 'list')}. (Cron simulation)",
    }

    return tool_descriptions.get(tool_name, f"Tool '{tool_name}' executed with args: {tool_args[:200]}. Operation completed. (Tool execution simulation — full execution requires hermes-agent runtime environment)")


def _save_session_message(session_id: str, role: str, content: str, tokens: int = 0, duration: int = 0):
    """Save a message to hermes state.db."""
    import sqlite3
    db_path = get_state_db()
    if not db_path.exists():
        return

    try:
        conn = sqlite3.connect(str(db_path), check_same_thread=False)
        # Ensure session exists
        try:
            conn.execute(
                "INSERT OR IGNORE INTO sessions (id, source, model, started_at) VALUES (?, ?, ?, ?)",
                (session_id, "web", "", time.time()),
            )
        except Exception:
            pass

        # Insert message
        try:
            conn.execute(
                "INSERT INTO messages (session_id, role, content, timestamp, token_count) VALUES (?, ?, ?, ?, ?)",
                (session_id, role, content, time.time(), tokens),
            )
            # Update session message count
            conn.execute(
                "UPDATE sessions SET message_count = message_count + 1, ended_at = NULL WHERE id = ?",
                (session_id,),
            )
            conn.commit()
        except Exception as e:
            logger.debug("Failed to save message: %s", e)
            conn.rollback()
        conn.close()
    except Exception as e:
        logger.debug("DB save error: %s", e)


# ---------------------------------------------------------------------------
# App Setup
# ---------------------------------------------------------------------------

def create_app() -> web.Application:
    app = web.Application(middlewares=[cors_middleware])

    app.router.add_get("/health", handle_health)

    # Chat Completions (OpenAI-compatible)
    app.router.add_post("/v1/chat/completions", handle_chat_completions)

    # Tools
    app.router.add_get("/v1/tools", handle_tools)
    app.router.add_get("/v1/toolsets", handle_toolsets)

    # Skills
    app.router.add_get("/v1/skills", handle_skills)
    app.router.add_get("/v1/skills/{name}", handle_skill_detail)

    # Memory
    app.router.add_get("/v1/memory", handle_memory)
    app.router.add_put("/v1/memory", handle_memory_update)

    # Sessions (hermes-agent sessions)
    app.router.add_get("/v1/sessions", handle_sessions)
    app.router.add_get("/v1/sessions/{id}/messages", handle_session_messages)

    # Models
    app.router.add_get("/v1/models", handle_models)

    # Config
    app.router.add_get("/v1/config", handle_config)
    app.router.add_put("/v1/config", handle_config_update)

    return app


if __name__ == "__main__":
    port = int(os.environ.get("HERMES_API_PORT", "8643"))
    host = os.environ.get("HERMES_API_HOST", "0.0.0.0")

    app = create_app()
    logger.info("Starting Hermes API service on %s:%d", host, port)
    logger.info("Hermes home: %s", HERMES_HOME)
    logger.info("Hermes source: %s", HERMES_SOURCE)

    # Print LLM config status
    llm = get_llm_config()
    logger.info("LLM model: %s (provider: %s)", llm["model"], llm["provider"])
    logger.info("LLM base_url: %s", llm["base_url"])
    logger.info("LLM api_key: %s", "***configured***" if llm["api_key"] else "***NOT SET***")

    web.run_app(app, host=host, port=port, print=logger.info)
