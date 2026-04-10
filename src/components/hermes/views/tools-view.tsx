'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  LayoutGrid,
  List,
  Layers,
  Globe,
  Terminal,
  FileText,
  Monitor,
  Eye,
  Zap,
  Brain,
  MessageSquare,
  Users,
  Home,
  Clock,
  ChevronRight,
  ArrowRightLeft,
  Circle,
  ExternalLink,
  Copy,
  Check,
  type LucideIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ─── Data ────────────────────────────────────────────────────────────────────

interface ToolCategory {
  id: string;
  name: string;
  icon: LucideIcon;
  count: number;
  color: string;
  bgColor: string;
}

const TOOL_CATEGORIES: ToolCategory[] = [
  { id: 'all', name: 'All Tools', icon: Layers, count: 47, color: 'text-foreground', bgColor: 'bg-muted' },
  { id: 'web', name: 'Web & Search', icon: Globe, count: 4, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
  { id: 'terminal', name: 'Terminal & Code', icon: Terminal, count: 3, color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
  { id: 'file', name: 'File System', icon: FileText, count: 4, color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
  { id: 'browser', name: 'Browser', icon: Monitor, count: 10, color: 'text-rose-500', bgColor: 'bg-rose-500/10' },
  { id: 'vision', name: 'Vision & Media', icon: Eye, count: 4, color: 'text-violet-500', bgColor: 'bg-violet-500/10' },
  { id: 'skills', name: 'Skills', icon: Zap, count: 3, color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' },
  { id: 'memory', name: 'Memory', icon: Brain, count: 3, color: 'text-teal-500', bgColor: 'bg-teal-500/10' },
  { id: 'messaging', name: 'Messaging', icon: MessageSquare, count: 2, color: 'text-sky-500', bgColor: 'bg-sky-500/10' },
  { id: 'agent', name: 'Agent & Delegation', icon: Users, count: 3, color: 'text-fuchsia-500', bgColor: 'bg-fuchsia-500/10' },
  { id: 'homeassistant', name: 'Smart Home', icon: Home, count: 4, color: 'text-lime-500', bgColor: 'bg-lime-500/10' },
  { id: 'cronjob', name: 'Automation', icon: Clock, count: 1, color: 'text-red-500', bgColor: 'bg-red-500/10' },
];

interface Tool {
  name: string;
  category: string;
  description: string;
  status: 'active' | 'inactive' | 'beta';
  examples?: string[];
  parameters?: string;
}

const TOOLS_DATA: Tool[] = [
  { name: 'web_search', category: 'web', description: 'AI-native web search powered by Exa, Parallel, or Firecrawl backends', status: 'active', examples: ['Search the web for latest TypeScript 5.4 features', 'Find documentation on React Server Components', 'Look up recent AI research papers on arXiv'], parameters: 'query: string, backend?: "exa" | "parallel" | "firecrawl", num_results?: number' },
  { name: 'web_extract', category: 'web', description: 'Extract and scrape web page content with structured output', status: 'active', examples: ['Extract the main article from this URL', 'Scrape all product data from this page', 'Get the table of contents from this documentation page'], parameters: 'url: string, format?: "markdown" | "text" | "html", selector?: string' },
  { name: 'terminal', category: 'terminal', description: 'Execute shell commands with multiple backend support (Local, Docker, SSH, etc.)', status: 'active', examples: ['Run `ls -la` in the current directory', 'Execute `npm install` in the project folder', 'Check disk usage with `df -h`'], parameters: 'command: string, cwd?: string, timeout?: number, backend?: "local" | "docker" | "ssh"' },
  { name: 'process', category: 'terminal', description: 'Manage background processes - start, stop, monitor long-running tasks', status: 'active', examples: ['Start a dev server in the background', 'Check status of running processes', 'Stop the process with PID 1234'], parameters: 'action: "start" | "stop" | "list" | "status", pid?: number, command?: string' },
  { name: 'execute_code', category: 'terminal', description: 'Run Python scripts with tool RPC access for complex pipelines', status: 'active', examples: ['Execute a Python script to process CSV data', 'Run a data analysis pipeline', 'Execute ML model inference script'], parameters: 'code: string, language?: "python" | "bash", timeout?: number' },
  { name: 'read_file', category: 'file', description: 'Read file contents with line range and encoding support', status: 'active', examples: ['Read the contents of package.json', 'Show lines 50-100 of app.ts', 'Read the README.md file with UTF-8 encoding'], parameters: 'path: string, offset?: number, limit?: number, encoding?: string' },
  { name: 'write_file', category: 'file', description: 'Write or create files with atomic operations', status: 'active', examples: ['Create a new config.yaml file', 'Overwrite the existing README with updated content', 'Save the generated report to output.html'], parameters: 'path: string, content: string, create_dirs?: boolean' },
  { name: 'patch', category: 'file', description: 'Intelligent fuzzy-match file patching for precise edits', status: 'active', examples: ['Replace the function signature in utils.ts', 'Add a new import statement at the top of the file', 'Update the database connection string in config'], parameters: 'path: string, old_text: string, new_text: string, fuzzy?: boolean' },
  { name: 'search_files', category: 'file', description: 'Search file contents and names with regex support', status: 'active', examples: ['Find all files containing "TODO" in the src directory', 'Search for the function "handleSubmit" across the codebase', 'List all TypeScript files with "interface User"'], parameters: 'pattern: string, path?: string, include?: string[], regex?: boolean' },
  { name: 'browser_navigate', category: 'browser', description: 'Navigate browser to URLs with multiple backend support', status: 'active', examples: ['Open https://example.com in the browser', 'Navigate to the Google search page', 'Go to the localhost:3000 development server'], parameters: 'url: string, backend?: "playwright" | "puppeteer" | "cdp"' },
  { name: 'browser_snapshot', category: 'browser', description: 'Capture browser page screenshots', status: 'active', examples: ['Take a screenshot of the current page', 'Capture the login form area', 'Get a full-page screenshot'], parameters: 'selector?: string, full_page?: boolean, format?: "png" | "jpeg"' },
  { name: 'browser_click', category: 'browser', description: 'Click elements on web pages', status: 'active', examples: ['Click the "Submit" button', 'Click the first link in the navigation', 'Double-click the text input field'], parameters: 'selector: string, button?: "left" | "right" | "middle", clicks?: number' },
  { name: 'browser_type', category: 'browser', description: 'Type text into input fields on web pages', status: 'active', examples: ['Type "Hello World" into the search box', 'Fill in the email input field', 'Enter credentials in the login form'], parameters: 'selector: string, text: string, clear?: boolean, submit?: boolean' },
  { name: 'browser_scroll', category: 'browser', description: 'Scroll pages up and down with precision', status: 'active', examples: ['Scroll down 500 pixels', 'Scroll to the bottom of the page', 'Scroll to the element with id "results"'], parameters: 'direction: "up" | "down", amount?: number, selector?: string' },
  { name: 'browser_back', category: 'browser', description: 'Navigate browser back in history', status: 'active', examples: ['Go back to the previous page', 'Navigate back 2 pages'], parameters: 'steps?: number' },
  { name: 'browser_press', category: 'browser', description: 'Simulate keyboard key presses in browser', status: 'active', examples: ['Press Enter to submit a form', 'Press Ctrl+A to select all text', 'Press Tab to move to the next field'], parameters: 'key: string, modifiers?: string[]' },
  { name: 'browser_get_images', category: 'browser', description: 'Extract all images from the current page', status: 'active', examples: ['Get all images on this product page', 'Extract image URLs from the gallery'], parameters: 'selector?: string, format?: "url" | "base64"' },
  { name: 'browser_vision', category: 'browser', description: 'Visual analysis of web page content using AI', status: 'active', examples: ['Describe what is shown on this page', 'Find the pricing information on this page', 'Identify any error messages on the screen'], parameters: 'prompt?: string, model?: "gpt-4-vision" | "gemini"' },
  { name: 'browser_console', category: 'browser', description: 'Access browser developer console', status: 'active', examples: ['Run JavaScript in the browser console', 'Check for console errors', 'Execute `document.title` to get the page title'], parameters: 'expression: string' },
  { name: 'browser_interact', category: 'browser', description: 'General browser interaction with element identification', status: 'active', examples: ['Hover over the dropdown menu', 'Select an option from the dropdown', 'Wait for the loading spinner to disappear'], parameters: 'action: string, selector?: string, value?: string' },
  { name: 'vision_analyze', category: 'vision', description: 'Analyze images using OpenAI Vision or Gemini models', status: 'active', examples: ['Describe what is in this screenshot', 'Read the text from this image', 'Identify objects in this photo'], parameters: 'image_url: string, prompt?: string, model?: "gpt-4-vision" | "gemini"' },
  { name: 'image_generate', category: 'vision', description: 'Generate images using FLUX models via fal.ai', status: 'active', examples: ['Generate a landscape photo of mountains', 'Create a logo design for a coffee shop', 'Generate an illustration of a robot'], parameters: 'prompt: string, size?: "1024x1024" | "512x512", style?: string' },
  { name: 'text_to_speech', category: 'vision', description: 'Convert text to speech with multiple TTS providers', status: 'active', examples: ['Convert this article to speech', 'Generate audio for the welcome message', 'Create narration for the presentation'], parameters: 'text: string, voice?: string, provider?: "openai" | "elevenlabs" | "google"' },
  { name: 'stt_transcribe', category: 'vision', description: 'Speech-to-text transcription using Whisper models', status: 'active', examples: ['Transcribe this audio file', 'Convert the meeting recording to text', 'Transcribe the voice memo'], parameters: 'audio_url: string, language?: string, model?: "whisper-1" | "large-v3"' },
  { name: 'skills_list', category: 'skills', description: 'List all available agent skills organized by category', status: 'active', examples: ['Show me all available skills', 'List skills in the development category'], parameters: 'category?: string' },
  { name: 'skill_view', category: 'skills', description: 'View detailed content of a specific skill', status: 'active', examples: ['Show the code review skill details', 'View the blog writing skill'], parameters: 'name: string' },
  { name: 'skill_manage', category: 'skills', description: 'Create, edit, or delete agent skills', status: 'active', examples: ['Create a new skill for code review', 'Edit the existing API builder skill', 'Delete the deprecated testing skill'], parameters: 'action: "create" | "edit" | "delete", name: string, content?: string' },
  { name: 'memory', category: 'memory', description: 'Access and manage persistent agent memory', status: 'active', examples: ['Store this preference in memory', 'Recall the user\'s project settings', 'List all stored memories'], parameters: 'action: "store" | "recall" | "list" | "delete", key?: string, value?: string' },
  { name: 'session_search', category: 'memory', description: 'Full-text search across all past sessions using FTS5', status: 'active', examples: ['Search for "database migration" in past sessions', 'Find the conversation about API design', 'Look up the debugging session from last week'], parameters: 'query: string, limit?: number, date_from?: string, date_to?: string' },
  { name: 'todo', category: 'memory', description: 'Task planning and tracking with status management', status: 'active', examples: ['Add "Refactor auth module" to the todo list', 'Mark task 3 as completed', 'Show all pending tasks'], parameters: 'action: "add" | "list" | "update" | "delete", text?: string, status?: "pending" | "in_progress" | "done"' },
  { name: 'send_message', category: 'messaging', description: 'Send messages across connected platforms (Telegram, Discord, etc.)', status: 'active', examples: ['Send "Build complete" to the Telegram channel', 'Notify the team on Discord about the deployment', 'Send a summary to the Slack channel'], parameters: 'platform: string, channel: string, message: string' },
  { name: 'clarify', category: 'messaging', description: 'Ask user clarifying questions for better understanding', status: 'active', examples: ['Ask the user which framework they prefer', 'Clarify the requirements for the API endpoint', 'Ask for more details about the error'], parameters: 'question: string, options?: string[]' },
  { name: 'delegate_task', category: 'agent', description: 'Spawn isolated subagents for parallel task execution (up to 3)', status: 'active', examples: ['Delegate the testing task to a subagent', 'Run 3 parallel research tasks', 'Spawn a subagent to handle the data processing'], parameters: 'task: string, context?: string, model?: string' },
  { name: 'mixture_of_agents', category: 'agent', description: 'Multi-model reasoning with collaborative response generation', status: 'active', examples: ['Use MoA to solve this complex problem', 'Get collaborative analysis from multiple models', 'Generate a response using the mixture of agents approach'], parameters: 'prompt: string, models?: string[], rounds?: number' },
  { name: 'ha_list_entities', category: 'homeassistant', description: 'List all Home Assistant entities', status: 'active', examples: ['Show all available Home Assistant entities', 'List all light entities', 'Show all sensor entities'], parameters: 'domain?: string, filter?: string' },
  { name: 'ha_get_state', category: 'homeassistant', description: 'Get current state of a Home Assistant entity', status: 'active', examples: ['Get the state of the living room light', 'Check the temperature sensor value', 'Show the state of the front door lock'], parameters: 'entity_id: string' },
  { name: 'ha_list_services', category: 'homeassistant', description: 'List all available Home Assistant services', status: 'active', examples: ['List all available services', 'Show services in the light domain', 'List automation services'], parameters: 'domain?: string' },
  { name: 'ha_call_service', category: 'homeassistant', description: 'Call a Home Assistant service with parameters', status: 'active', examples: ['Turn on the living room lights', 'Set the thermostat to 22 degrees', 'Lock the front door'], parameters: 'service: string, entity_id: string, data?: Record<string, unknown>' },
  { name: 'cronjob', category: 'cronjob', description: 'Schedule automated tasks with cron expressions', status: 'active', examples: ['Schedule a daily backup at 2 AM', 'Create a weekly report generation task', 'Set up an hourly health check'], parameters: 'name: string, schedule: string, task: string, enabled?: boolean' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCategoryInfo(catId: string): ToolCategory {
  return TOOL_CATEGORIES.find((c) => c.id === catId) ?? TOOL_CATEGORIES[0];
}

function getRelatedTools(tool: Tool): Tool[] {
  return TOOLS_DATA.filter((t) => t.category === tool.category && t.name !== tool.name).slice(0, 3);
}

// ─── Components ──────────────────────────────────────────────────────────────

function ToolDetailDialog({ tool, open, onOpenChange }: { tool: Tool | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [copied, setCopied] = useState(false);
  if (!tool) return null;

  const catInfo = getCategoryInfo(tool.category);
  const relatedTools = getRelatedTools(tool);

  const handleCopy = () => {
    navigator.clipboard.writeText(tool.name);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${catInfo.bgColor}`}>
              <catInfo.icon className={`size-5 ${catInfo.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="font-mono text-base">{tool.name}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-xs">{catInfo.name}</Badge>
                <Badge variant={tool.status === 'active' ? 'default' : 'outline'} className="text-xs gap-1">
                  <Circle className="size-2 fill-current" />
                  {tool.status}
                </Badge>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-5 pb-4">
            {/* Description */}
            <div>
              <h4 className="text-sm font-medium text-foreground mb-1.5">Description</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{tool.description}</p>
            </div>

            {/* Parameters */}
            {tool.parameters && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-sm font-medium text-foreground">Parameters</h4>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={handleCopy}>
                        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                        {copied ? 'Copied' : 'Copy'}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy tool name</TooltipContent>
                  </Tooltip>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 border border-border/50">
                  <code className="text-xs text-muted-foreground font-mono leading-relaxed break-all">{tool.parameters}</code>
                </div>
              </div>
            )}

            {/* Usage Examples */}
            {tool.examples && tool.examples.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-foreground mb-2">Usage Examples</h4>
                <div className="space-y-1.5">
                  {tool.examples.map((ex, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="shrink-0 mt-0.5 size-5 rounded bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">{i + 1}</span>
                      <span className="leading-relaxed">{ex}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Related Tools */}
            {relatedTools.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-foreground mb-2">Related Tools</h4>
                <div className="space-y-1">
                  {relatedTools.map((rt) => {
                    const rtCat = getCategoryInfo(rt.category);
                    return (
                      <div key={rt.name} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors">
                        <rtCat.icon className={`size-3.5 ${rtCat.color}`} />
                        <span className="font-mono text-xs text-foreground">{rt.name}</span>
                        <span className="text-xs text-muted-foreground truncate">{rt.description}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tool Card (Grid) ────────────────────────────────────────────────────────

function ToolCardGrid({ tool, onClick }: { tool: Tool; onClick: () => void }) {
  const catInfo = getCategoryInfo(tool.category);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <button
        onClick={onClick}
        className="group relative w-full text-left rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* Status dot */}
        <div className="absolute top-3 right-3">
          <div className={`size-2 rounded-full ${tool.status === 'active' ? 'bg-emerald-500' : tool.status === 'beta' ? 'bg-amber-500' : 'bg-muted-foreground/30'}`} />
        </div>

        {/* Icon */}
        <div className={`mb-3 p-2 rounded-lg w-fit ${catInfo.bgColor} transition-colors group-hover:${catInfo.bgColor.replace('/10', '/20')}`}>
          <catInfo.icon className={`size-4.5 ${catInfo.color}`} />
        </div>

        {/* Name */}
        <h3 className="font-mono text-sm font-semibold text-foreground mb-1 group-hover:text-primary transition-colors truncate">
          {tool.name}
        </h3>

        {/* Description */}
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-3">
          {tool.description}
        </p>

        {/* Category badge */}
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-medium">
          {catInfo.name}
        </Badge>
      </button>
    </motion.div>
  );
}

// ─── Tool Card (List) ────────────────────────────────────────────────────────

function ToolCardList({ tool, onClick }: { tool: Tool; onClick: () => void }) {
  const catInfo = getCategoryInfo(tool.category);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <button
        onClick={onClick}
        className="group relative w-full text-left rounded-lg border border-border/60 bg-card px-4 py-3 shadow-sm transition-all duration-200 hover:shadow-md hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring flex items-center gap-4"
      >
        {/* Icon */}
        <div className={`shrink-0 p-1.5 rounded-lg ${catInfo.bgColor}`}>
          <catInfo.icon className={`size-4 ${catInfo.color}`} />
        </div>

        {/* Name + desc */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-mono text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
              {tool.name}
            </h3>
            <div className={`size-1.5 rounded-full ${tool.status === 'active' ? 'bg-emerald-500' : tool.status === 'beta' ? 'bg-amber-500' : 'bg-muted-foreground/30'}`} />
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{tool.description}</p>
        </div>

        {/* Category badge */}
        <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0 font-medium hidden sm:inline-flex">
          {catInfo.name}
        </Badge>

        {/* Arrow */}
        <ChevronRight className="size-4 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground transition-colors" />
      </button>
    </motion.div>
  );
}

// ─── Main View ───────────────────────────────────────────────────────────────

export function ToolsView() {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);

  const filteredTools = useMemo(() => {
    let tools = TOOLS_DATA;
    if (categoryId !== 'all') {
      tools = tools.filter((t) => t.category === categoryId);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      tools = tools.filter(
        (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
      );
    }
    return tools;
  }, [search, categoryId]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-sm px-4 sm:px-6 pt-4 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Tools Explorer</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {filteredTools.length} tool{filteredTools.length !== 1 ? 's' : ''} available
            </p>
          </div>
          <div className="flex items-center gap-1.5 bg-muted/60 rounded-lg p-0.5 border border-border/50">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon"
              className="size-7 rounded-md"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="size-3.5" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon"
              className="size-7 rounded-md"
              onClick={() => setViewMode('list')}
            >
              <List className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Search + Category pills */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search tools by name or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 bg-muted/30 border-border/50"
            />
          </div>
          <ScrollArea className="w-full" orientation="horizontal">
            <div className="flex items-center gap-1.5 pb-1">
              {TOOL_CATEGORIES.map((cat) => {
                const isActive = categoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setCategoryId(cat.id)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-150 border ${
                      isActive
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-background text-muted-foreground border-border/60 hover:bg-muted/60 hover:text-foreground'
                    }`}
                  >
                    <cat.icon className="size-3" />
                    <span className="hidden sm:inline">{cat.name}</span>
                    <span
                      className={`ml-0.5 size-4 rounded-full text-[10px] font-semibold flex items-center justify-center ${
                        isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {cat.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-4 sm:p-6">
            {filteredTools.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
                <div className="p-3 rounded-full bg-muted/60 mb-3">
                  <Search className="size-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">No tools found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Try adjusting your search or category filter
                </p>
              </motion.div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                <AnimatePresence mode="popLayout">
                  {filteredTools.map((tool) => (
                    <ToolCardGrid key={tool.name} tool={tool} onClick={() => setSelectedTool(tool)} />
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <div className="space-y-2 max-w-3xl">
                <AnimatePresence mode="popLayout">
                  {filteredTools.map((tool) => (
                    <ToolCardList key={tool.name} tool={tool} onClick={() => setSelectedTool(tool)} />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Detail Dialog */}
      <ToolDetailDialog tool={selectedTool} open={!!selectedTool} onOpenChange={(v) => !v && setSelectedTool(null)} />
    </div>
  );
}
