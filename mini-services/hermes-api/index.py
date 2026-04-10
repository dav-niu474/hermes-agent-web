"""
Hermes Agent API Service

Bridges hermes-agent's Python backend with the Next.js web frontend.
Exposes REST endpoints for tools, skills, memory, cron, and chat proxy.

Runs as a standalone Python HTTP service (aiohttp).
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

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
HERMES_SOURCE = PROJECT_ROOT / "hermes-agent"

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
# Tool Definitions (from hermes-agent's toolsets.py)
# ---------------------------------------------------------------------------

TOOL_DEFINITIONS = [
    # Web & Search
    {"id": "web_search", "name": "web_search", "category": "Web & Search", "description": "Search the web using Exa AI. Returns relevant URLs, snippets, and metadata.", "status": "active"},
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
# Helper: Get Hermes Home
# ---------------------------------------------------------------------------

def get_hermes_home() -> Path:
    """Return the hermes home directory."""
    home = os.environ.get("HERMES_HOME", "")
    if home:
        return Path(home)
    return Path.home() / ".hermes"


# ---------------------------------------------------------------------------
# Helper: Scan Skills
# ---------------------------------------------------------------------------

def scan_skills() -> List[Dict[str, Any]]:
    """Scan all skill directories for SKILL.md files and return metadata."""
    skills = []
    hermes_home = get_hermes_home()

    # Scan multiple skill directories
    scan_dirs = [
        hermes_home / "skills",
        HERMES_SOURCE / "skills",
        hermes_home / "optional-skills",
        HERMES_SOURCE / "optional-skills",
    ]

    seen_names = set()

    for scan_dir in scan_dirs:
        if not scan_dir.exists():
            continue
        for skill_md in scan_dir.rglob("SKILL.md"):
            if any(part in (".git", ".github", "__pycache__") for part in skill_md.parts):
                continue

            skill_dir = skill_md.parent
            name = skill_dir.name

            # Skip duplicates (prefer hermes_home over source)
            if name in seen_names:
                continue
            seen_names.add(name)

            # Determine category from parent dir
            parent_name = skill_dir.parent.name
            category = parent_name if parent_name != skill_dir.stem else "general"

            # Parse YAML frontmatter from SKILL.md
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
                    # Fallback: first non-empty line after frontmatter
                    if not description:
                        body = parts[2] if len(parts) >= 3 else content
                        for line in body.strip().split("\n"):
                            line = line.strip().lstrip("# ")
                            if line and not line.startswith("!") and len(line) > 5:
                                description = line[:200]
                                break
            except Exception:
                pass

            # Check if skill is in user's installed skills
            is_user_installed = str(hermes_home) in str(skill_md)

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
    hermes_home = get_hermes_home()
    memory_dir = hermes_home / "memory"

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
                    # Parse entries (## headings)
                    current_section = ""
                    for line in content.split("\n"):
                        if line.startswith("## "):
                            if current_section:
                                memory_entries.append({"section": current_section.strip("# "), "preview": current_section.split("\n", 1)[-1].strip()[:200]})
                            current_section = line
                else:
                    user_content = content
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
# Helper: Read Cron Jobs
# ---------------------------------------------------------------------------

def read_cron_jobs() -> List[Dict[str, Any]]:
    """Read cron jobs from hermes state."""
    jobs = []
    hermes_home = get_hermes_home()
    cron_file = hermes_home / "cron_jobs.json"

    if cron_file.exists():
        try:
            data = json.loads(cron_file.read_text(encoding="utf-8"))
            if isinstance(data, list):
                jobs = data
        except Exception as e:
            logger.warning("Failed to read cron jobs: %s", e)

    # Also try reading from state.db if available
    if not jobs:
        try:
            import sqlite3
            state_db = hermes_home / "state.db"
            if state_db.exists():
                conn = sqlite3.connect(str(state_db))
                conn.row_factory = sqlite3.Row
                try:
                    rows = conn.execute("SELECT * FROM cron_jobs ORDER BY created_at DESC").fetchall()
                    for row in rows:
                        jobs.append(dict(row))
                except Exception:
                    pass
                finally:
                    conn.close()
        except Exception:
            pass

    return jobs


# ---------------------------------------------------------------------------
# Helper: Read Sessions from hermes state
# ---------------------------------------------------------------------------

def read_sessions() -> List[Dict[str, Any]]:
    """Read sessions from hermes state.db."""
    sessions = []
    hermes_home = get_hermes_home()
    state_db = hermes_home / "state.db"

    try:
        import sqlite3
        if state_db.exists():
            conn = sqlite3.connect(str(state_db))
            conn.row_factory = sqlite3.Row
            try:
                rows = conn.execute(
                    "SELECT session_id, created_at, updated_at, input_tokens, output_tokens, total_tokens, summary FROM sessions ORDER BY updated_at DESC LIMIT 100"
                ).fetchall()
                for row in rows:
                    d = dict(row)
                    sessions.append(d)
            except Exception:
                # Try listing tables
                try:
                    tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
                    logger.info("state.db tables: %s", [t[0] for t in tables])
                except Exception:
                    pass
            finally:
                conn.close()
    except Exception as e:
        logger.warning("Failed to read sessions: %s", e)

    return sessions


# ---------------------------------------------------------------------------
# Helper: Read Messages for a session
# ---------------------------------------------------------------------------

def read_session_messages(session_id: str) -> List[Dict[str, Any]]:
    """Read messages for a session from hermes state.db."""
    messages = []
    hermes_home = get_hermes_home()
    state_db = hermes_home / "state.db"

    try:
        import sqlite3
        if state_db.exists():
            conn = sqlite3.connect(str(state_db))
            conn.row_factory = sqlite3.Row
            try:
                rows = conn.execute(
                    "SELECT id, role, content, timestamp, tool_calls, tokens FROM messages WHERE session_id = ? ORDER BY timestamp ASC",
                    (session_id,),
                ).fetchall()
                for row in rows:
                    messages.append(dict(row))
            except Exception as e:
                logger.debug("Failed to read messages for %s: %s", session_id, e)
            finally:
                conn.close()
    except Exception:
        pass

    return messages


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

    # Read full SKILL.md content
    skill_md = Path(skill["path"]) / "SKILL.md"
    content = ""
    linked_files = []

    if skill_md.exists():
        try:
            content = skill_md.read_text(encoding="utf-8", errors="replace")
            # List linked files
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
        hermes_home = get_hermes_home()
        memory_dir = hermes_home / "memory"
        memory_dir.mkdir(parents=True, exist_ok=True)

        if "memory_content" in body:
            (memory_dir / "MEMORY.md").write_text(body["memory_content"], encoding="utf-8")
        if "user_content" in body:
            (memory_dir / "USER.md").write_text(body["user_content"], encoding="utf-8")

        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def handle_cron(request: web.Request) -> web.Response:
    """GET /v1/cron — list cron jobs."""
    try:
        jobs = read_cron_jobs()
        return web.json_response({"jobs": jobs, "total": len(jobs)})
    except Exception as e:
        return web.json_response({"jobs": [], "total": 0, "error": str(e)}, status=500)


async def handle_sessions(request: web.Request) -> web.Response:
    """GET /v1/sessions — list hermes-agent sessions."""
    try:
        sessions = read_sessions()
        return web.json_response({"sessions": sessions, "total": len(sessions)})
    except Exception as e:
        return web.json_response({"sessions": [], "total": 0, "error": str(e)}, status=500)


async def handle_session_messages(request: web.Request) -> web.Response:
    """GET /v1/sessions/{id}/messages — get messages for a session."""
    session_id = request.match_info["id"]
    try:
        messages = read_session_messages(session_id)
        return web.json_response({"messages": messages, "total": len(messages)})
    except Exception as e:
        return web.json_response({"messages": [], "total": 0, "error": str(e)}, status=500)


async def handle_models(request: web.Request) -> web.Response:
    """GET /v1/models — return hermes-agent model info."""
    # Try to read model from config
    model_id = "hermes-agent"
    hermes_home = get_hermes_home()
    config_yaml = hermes_home / "config.yaml"

    if config_yaml.exists():
        try:
            import yaml
            with open(config_yaml, "r") as f:
                cfg = yaml.safe_load(f) or {}
            model_cfg = cfg.get("model", {})
            if isinstance(model_cfg, str):
                model_id = model_cfg
            elif isinstance(model_cfg, dict):
                model_id = model_cfg.get("default") or model_cfg.get("model") or "hermes-agent"
        except Exception:
            pass

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
    hermes_home = get_hermes_home()
    config_yaml = hermes_home / "config.yaml"

    config = {}
    if config_yaml.exists():
        try:
            import yaml
            with open(config_yaml, "r") as f:
                config = yaml.safe_load(f) or {}
        except Exception:
            pass

    # Mask secrets
    def mask_secrets(obj, depth=0):
        if depth > 5:
            return "***"
        if isinstance(obj, dict):
            return {k: mask_secrets(v, depth+1) if "key" in k.lower() or "token" in k.lower() or "secret" in k.lower() else v for k, v in obj.items()}
        return obj

    return web.json_response({
        "config": mask_secrets(config),
        "hermes_home": str(hermes_home),
        "env": {
            "HERMES_INFERENCE_PROVIDER": os.environ.get("HERMES_INFERENCE_PROVIDER", ""),
            "TERMINAL_ENV": os.environ.get("TERMINAL_ENV", ""),
            "HERMES_MAX_ITERATIONS": os.environ.get("HERMES_MAX_ITERATIONS", ""),
        },
    })


async def handle_config_update(request: web.Request) -> web.Response:
    """PUT /v1/config — update hermes-agent configuration."""
    try:
        body = await request.json()
        hermes_home = get_hermes_home()
        config_yaml = hermes_home / "config.yaml"

        config = {}
        if config_yaml.exists():
            try:
                import yaml
                with open(config_yaml, "r") as f:
                    config = yaml.safe_load(f) or {}
            except Exception:
                pass

        # Deep merge updates
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
# App Setup
# ---------------------------------------------------------------------------

def create_app() -> web.Application:
    app = web.Application(middlewares=[cors_middleware])

    app.router.add_get("/health", handle_health)

    # Tools
    app.router.add_get("/v1/tools", handle_tools)
    app.router.add_get("/v1/toolsets", handle_toolsets)

    # Skills
    app.router.add_get("/v1/skills", handle_skills)
    app.router.add_get("/v1/skills/{name}", handle_skill_detail)

    # Memory
    app.router.add_get("/v1/memory", handle_memory)
    app.router.add_put("/v1/memory", handle_memory_update)

    # Cron
    app.router.add_get("/v1/cron", handle_cron)

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
    web.run_app(app, host=host, port=port, print=logger.info)
