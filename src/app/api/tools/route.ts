import { NextResponse } from "next/server";

/**
 * GET /api/tools
 * Return the hardcoded list of tools. Supports ?category= query param.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");

  const tools = [
    // Web & Search
    { id: "web_search", name: "web_search", category: "Web & Search", description: "Search the web using Exa AI. Returns relevant URLs, snippets, and metadata.", status: "active", parameters: '{"query": "string", "num_results?": "number"}' },
    { id: "web_extract", name: "web_extract", category: "Web & Search", description: "Extract clean text content from a URL using Firecrawl.", status: "active", parameters: '{"url": "string"}' },
    // Terminal & Code
    { id: "terminal", name: "terminal", category: "Terminal & Code", description: "Execute shell commands in local, Docker, SSH, Modal, or Daytona environments.", status: "active", parameters: '{"command": "string", "timeout?": "number", "cwd?": "string"}' },
    { id: "execute_code", name: "execute_code", category: "Terminal & Code", description: "Run Python code in a sandboxed execution environment.", status: "active", parameters: '{"code": "string", "language?": "string"}' },
    // File System
    { id: "read_file", name: "read_file", category: "File System", description: "Read file contents with optional offset and limit parameters.", status: "active", parameters: '{"path": "string", "offset?": "number", "limit?": "number"}' },
    { id: "write_file", name: "write_file", category: "File System", description: "Create or overwrite a file with the specified content.", status: "active", parameters: '{"path": "string", "content": "string"}' },
    { id: "patch", name: "patch", category: "File System", description: "Apply a diff patch to a file with search/replace operations.", status: "active", parameters: '{"path": "string", "old_string": "string", "new_string": "string"}' },
    { id: "search_files", name: "search_files", category: "File System", description: "Search for patterns in files using ripgrep with regex support.", status: "active", parameters: '{"path": "string", "pattern": "string", "type?": "string"}' },
    // Browser
    { id: "browser_navigate", name: "browser_navigate", category: "Browser", description: "Navigate to a URL and capture a snapshot of the page.", status: "active", parameters: '{"url": "string"}' },
    { id: "browser_click", name: "browser_click", category: "Browser", description: "Click on an element on the current browser page.", status: "active", parameters: '{"selector": "string"}' },
    { id: "browser_type", name: "browser_type", category: "Browser", description: "Type text into an input field on the browser page.", status: "active", parameters: '{"selector": "string", "text": "string"}' },
    // Vision & Media
    { id: "vision_analyze", name: "vision_analyze", category: "Vision & Media", description: "Analyze images using a vision model for description and understanding.", status: "active", parameters: '{"image_url": "string", "prompt?": "string"}' },
    { id: "image_generate", name: "image_generate", category: "Vision & Media", description: "Generate images from text descriptions using FLUX models.", status: "active", parameters: '{"prompt": "string", "width?": "number", "height?": "number"}' },
    // Skills
    { id: "skills_list", name: "skills_list", category: "Skills", description: "List all available skills with their categories and descriptions.", status: "active", parameters: '{}' },
    { id: "skill_view", name: "skill_view", category: "Skills", description: "View the full content and instructions of a specific skill.", status: "active", parameters: '{"skill_name": "string"}' },
    { id: "skill_manage", name: "skill_manage", category: "Skills", description: "Install, remove, edit, or manage agent skills.", status: "active", parameters: '{"action": "install|remove|edit|list", "skill_name": "string"}' },
    // Memory
    { id: "memory", name: "memory", category: "Memory", description: "Read and update agent memory files (MEMORY.md and USER.md).", status: "active", parameters: '{"action": "read|write|append", "file?": "string", "content?": "string"}' },
    { id: "session_search", name: "session_search", category: "Memory", description: "Search across past conversation sessions using full-text search.", status: "active", parameters: '{"query": "string", "limit?": "number"}' },
    // Agent & Delegation
    { id: "delegate_task", name: "delegate_task", category: "Agent & Delegation", description: "Spawn a sub-agent to handle complex multi-step tasks independently.", status: "active", parameters: '{"task": "string", "toolsets?": "string[]"}' },
    { id: "todo", name: "todo", category: "Agent & Delegation", description: "Manage in-memory task lists for planning and tracking progress.", status: "active", parameters: '{"action": "add|list|update|remove", "content?": "string", "id?": "string"}' },
    // Messaging
    { id: "send_message", name: "send_message", category: "Messaging", description: "Send messages across platforms: Telegram, Discord, Slack, email, etc.", status: "active", parameters: '{"platform": "string", "recipient": "string", "content": "string"}' },
    // TTS
    { id: "text_to_speech", name: "text_to_speech", category: "Messaging", description: "Convert text to speech using Edge TTS or ElevenLabs.", status: "active", parameters: '{"text": "string", "voice?": "string"}' },
    // Automation
    { id: "cronjob", name: "cronjob", category: "Automation", description: "Manage scheduled cron jobs for recurring automated tasks.", status: "active", parameters: '{"action": "list|create|delete|enable|disable", "name?": "string", "schedule?": "string", "task?": "string"}' },
    // MCP
    { id: "mcp_tool", name: "mcp_tool", category: "Automation", description: "Call MCP (Model Context Protocol) tools from connected MCP servers.", status: "active", parameters: '{"server": "string", "tool": "string", "arguments": "object"}' },
  ];

  const filtered = category ? tools.filter((t) => t.category === category) : tools;

  return NextResponse.json(filtered);
}
