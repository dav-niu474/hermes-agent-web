'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import {
  Send,
  Square,
  Plus,
  Search,
  MessageSquare,
  Trash2,
  MoreHorizontal,
  Sparkles,
  Globe,
  Code,
  Image,
  Clock,
  Paperclip,
  Mic,
  Copy,
  Check,
  Bot,
  User,
  Wrench,
  Loader2,
  ChevronDown,
  Cpu,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useAppStore, type ChatMessage } from '@/store/app-store';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

const SUGGESTIONS = [
  { text: 'Search the web for the latest AI news', icon: Globe, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { text: 'Help me write a Python script for data processing', icon: Code, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { text: 'Analyze this image and describe its contents', icon: Image, color: 'text-rose-500', bg: 'bg-rose-500/10' },
  { text: 'Create a scheduled daily task for me', icon: Clock, color: 'text-teal-500', bg: 'bg-teal-500/10' },
];

/* ═════════════════════════════════════════════════════
   MODEL DEFINITIONS
   ═════════════════════════════════════════════════════ */

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  description?: string;
}

const MODEL_GROUPS: { provider: string; models: ModelOption[] }[] = [
  {
    provider: 'NVIDIA NIM',
    models: [
      { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', provider: 'nvidia', description: 'Meta Llama 3.3 70B Instruct' },
      { id: 'meta/llama-3.1-405b-instruct', name: 'Llama 3.1 405B', provider: 'nvidia', description: 'Meta Llama 3.1 405B Instruct' },
      { id: 'mistralai/mixtral-8x22b-instruct-v0.1', name: 'Mixtral 8x22B', provider: 'nvidia', description: 'Mistral Mixtral 8x22B Instruct' },
      { id: 'google/gemma-2-27b-it', name: 'Gemma 2 27B', provider: 'nvidia', description: 'Google Gemma 2 27B IT' },
      { id: 'nvidia/nemotron-4-340b-instruct', name: 'Nemotron 4 340B', provider: 'nvidia', description: 'NVIDIA Nemotron 4 340B Instruct' },
    ],
  },
  {
    provider: 'OpenAI',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', description: 'OpenAI GPT-4o multimodal' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', description: 'OpenAI GPT-4o Mini (fast)' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', description: 'OpenAI GPT-4 Turbo' },
      { id: 'o1-mini', name: 'o1-mini', provider: 'openai', description: 'OpenAI o1 reasoning model' },
    ],
  },
  {
    provider: 'Anthropic',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', description: 'Anthropic Claude Sonnet 4' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', description: 'Anthropic Claude 3.5 Sonnet' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic', description: 'Anthropic Claude 3.5 Haiku (fast)' },
    ],
  },
  {
    provider: 'Google',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google', description: 'Google Gemini 2.5 Flash' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google', description: 'Google Gemini 2.0 Flash' },
    ],
  },
  {
    provider: 'GLM (ZhipuAI)',
    models: [
      { id: 'glm-4-plus', name: 'GLM-4 Plus', provider: 'glm', description: 'ZhipuAI GLM-4 Plus' },
      { id: 'glm-4.5-flash', name: 'GLM-4.5 Flash', provider: 'glm', description: 'ZhipuAI GLM-4.5 Flash (fast)' },
    ],
  },
  {
    provider: 'OpenRouter',
    models: [
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4 (OR)', provider: 'openrouter', description: 'Via OpenRouter' },
      { id: 'openai/gpt-4o', name: 'GPT-4o (OR)', provider: 'openrouter', description: 'Via OpenRouter' },
    ],
  },
];

const ALL_MODELS = MODEL_GROUPS.flatMap((g) => g.models);
const DEFAULT_MODEL = 'meta/llama-3.3-70b-instruct';

function getModelName(modelId: string): string {
  const found = ALL_MODELS.find((m) => m.id === modelId);
  if (found) return found.name;
  // Fallback: extract short name
  const parts = modelId.split('/');
  return parts[parts.length - 1] || modelId;
}

function getModelProvider(modelId: string): string {
  const found = ALL_MODELS.find((m) => m.id === modelId);
  return found?.provider || 'unknown';
}

/* ═════════════════════════════════════════════════════
   TYPES
   ═════════════════════════════════════════════════════ */

interface SessionItem {
  id: string;
  title: string;
  model: string;
  messageCount: number;
  updatedAt: string;
}

/* ═════════════════════════════════════════════════════
   MESSAGE BUBBLE
   ═════════════════════════════════════════════════════ */

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isTool = message.role === 'tool';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isSystem) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center my-3">
        <Badge variant="secondary" className="text-xs px-3 py-1 bg-muted/60 text-muted-foreground">
          {message.content}
        </Badge>
      </motion.div>
    );
  }

  if (isTool) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start my-2 px-4">
        <div className="max-w-[80%] rounded-xl border border-border/60 bg-muted/30 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Wrench className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-mono font-medium text-muted-foreground">Tool Call</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">success</Badge>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-3">{message.content}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn('flex gap-3 my-3 px-4', isUser ? 'flex-row-reverse' : 'flex-row')}
    >
      <Avatar className={cn('size-8 shrink-0 mt-0.5', isUser ? 'bg-primary' : 'bg-muted')}>
        <AvatarFallback className={cn('text-xs', isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
          {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
        </AvatarFallback>
      </Avatar>
      <div className={cn('max-w-[80%] min-w-0 flex flex-col gap-1.5', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser ? 'bg-primary text-primary-foreground rounded-tr-md' : 'bg-card border border-border/60 rounded-tl-md'
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="markdown-content prose prose-sm max-w-none">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}
          {message.isStreaming && <span className="streaming-cursor" />}
        </div>
        <div className={cn('flex items-center gap-2', isUser ? 'flex-row-reverse' : 'flex-row')}>
          {!isUser && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="size-6 opacity-0 group-hover:opacity-100 hover:opacity-100" onClick={handleCopy}>
                  {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy response</TooltipContent>
            </Tooltip>
          )}
          {message.duration && <span className="text-[10px] text-muted-foreground">{(message.duration / 1000).toFixed(1)}s</span>}
          {message.tokens && <span className="text-[10px] text-muted-foreground">{message.tokens} tokens</span>}
        </div>
      </div>
    </motion.div>
  );
}

/* ═════════════════════════════════════════════════════
   WELCOME SCREEN
   ═════════════════════════════════════════════════════ */

function WelcomeScreen({ onSuggestionClick }: { onSuggestionClick: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-center max-w-lg">
        <motion.div
          className="relative mx-auto w-20 h-20 mb-6"
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/5 to-transparent blur-md" />
          <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/90 to-primary flex items-center justify-center shadow-xl shadow-primary/20">
            <svg viewBox="0 0 24 24" fill="none" className="w-10 h-10 text-primary-foreground" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3C8 3 5 6 4.5 10L4 13H20L19.5 10C19 6 16 3 12 3Z" />
              <path d="M3 13C3 13 4 15 12 15C20 15 21 13 21 13" />
              <path d="M4.5 10L2 8.5C1.5 8 1 8.5 1.5 9L4.5 12" />
              <path d="M19.5 10L22 8.5C22.5 8 23 8.5 22.5 9L19.5 12" />
            </svg>
          </div>
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-2xl font-bold tracking-tight mb-2">
          Welcome to Hermes Agent
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="text-muted-foreground text-sm mb-8">
          Your self-improving AI assistant with multi-model support, persistent memory, and powerful tools.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
          {SUGGESTIONS.map((s) => (
            <motion.button
              key={s.text}
              onClick={() => onSuggestionClick(s.text)}
              className="group flex items-start gap-3 p-3.5 rounded-xl border border-border/60 bg-card/50 hover:bg-card hover:border-border hover:shadow-sm transition-all duration-200 text-left"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className={cn('p-2 rounded-lg shrink-0', s.bg)}>
                <s.icon className={cn('size-4', s.color)} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground leading-snug">{s.text}</p>
              </div>
            </motion.button>
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════
   SESSION LIST
   ═════════════════════════════════════════════════════ */

function SessionList({
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  sessions: SessionItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string, title: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = sessions.filter((s) => s.title.toLowerCase().includes(search.toLowerCase()));

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      onDelete(deleteTarget.id, deleteTarget.title);
      toast.success('Session deleted', {
        description: `"${deleteTarget.title}" has been removed.`,
      });
    } catch {
      toast.error('Failed to delete session');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-3">
        <Button onClick={onNew} className="w-full gap-2" size="sm">
          <Plus className="size-4" />
          New Chat
        </Button>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input placeholder="Search sessions..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="px-2 pb-2 space-y-0.5">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">No sessions yet</p>
          )}
          {filtered.map((session) => (
            <button
              key={session.id}
              onClick={() => onSelect(session.id)}
              className={cn(
                'group w-full text-left px-3 py-2.5 rounded-lg transition-colors',
                activeId === session.id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium truncate">{session.title}</p>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-6 opacity-0 group-hover:opacity-100 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <MoreHorizontal className="size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuItem className="text-destructive text-xs gap-2" onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: session.id, title: session.title }); }}>
                      <Trash2 className="size-3" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                  {session.model ? getModelName(session.model) : 'Llama 3.3 70B'}
                </Badge>
                <span className="text-[10px] text-muted-foreground">{session.messageCount} msgs</span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true })}
                </span>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete session?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{deleteTarget?.title}&quot; and all its messages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="size-4 animate-spin mr-1" /> : <Trash2 className="size-4 mr-1" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ═════════════════════════════════════════════════════
   MODEL SELECTOR
   ═════════════════════════════════════════════════════ */

function ModelSelector({ selectedModel, onSelectModel, disabled }: { selectedModel: string; onSelectModel: (model: string) => void; disabled?: boolean }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const selectedName = getModelName(selectedModel);
  const selectedProvider = getModelProvider(selectedModel);

  const filteredGroups = MODEL_GROUPS.map((group) => ({
    ...group,
    models: group.models.filter(
      (m) =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.id.toLowerCase().includes(search.toLowerCase()) ||
        m.provider.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter((group) => group.models.length > 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs font-normal px-2.5 py-1 h-7 max-w-[200px]"
          disabled={disabled}
        >
          <Cpu className="size-3 shrink-0 text-muted-foreground" />
          <span className="truncate">{selectedName}</span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground ml-0.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="p-2 border-b border-border/60">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
        </div>
        <ScrollArea className="max-h-72">
          <div className="p-1">
            {filteredGroups.map((group) => (
              <div key={group.provider}>
                <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.provider}
                </div>
                {group.models.map((model) => {
                  const isSelected = model.id === selectedModel;
                  return (
                    <button
                      key={model.id}
                      onClick={() => {
                        onSelectModel(model.id);
                        setOpen(false);
                      }}
                      className={cn(
                        'w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors flex items-center gap-2',
                        isSelected
                          ? 'bg-accent text-accent-foreground'
                          : 'text-foreground hover:bg-muted/60'
                      )}
                    >
                      <span className="font-medium truncate">{model.name}</span>
                      {model.description && (
                        <span className="text-muted-foreground truncate text-[10px] ml-auto">
                          {model.description}
                        </span>
                      )}
                      {isSelected && <Check className="size-3 shrink-0 text-primary ml-auto" />}
                    </button>
                  );
                })}
              </div>
            ))}
            {filteredGroups.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No models found</p>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

/* ═════════════════════════════════════════════════════
   MAIN CHAT VIEW
   ═════════════════════════════════════════════════════ */

export function ChatView() {
  const {
    chatMessages,
    addChatMessage,
    updateLastAssistantMessage,
    isStreaming,
    setIsStreaming,
    currentSessionId,
    setCurrentSessionId,
    clearMessages,
    selectedModel,
    setSelectedModel,
  } = useAppStore();

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [input, setInput] = useState('');
  const [loadingSession, setLoadingSession] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Initialize selected model if default ──
  useEffect(() => {
    if (!selectedModel || selectedModel === 'hermes-agent') {
      setSelectedModel(DEFAULT_MODEL);
    }
  }, [selectedModel, setSelectedModel]);

  // ── Fetch sessions on mount ──
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      setSessions(
        (Array.isArray(data) ? data : []).map((s: Record<string, unknown>) => ({
          id: s.id as string,
          title: (s.title as string) || 'New Chat',
          model: (s.model as string) || DEFAULT_MODEL,
          messageCount: (s.messageCount as number) || 0,
          updatedAt: (s.updatedAt as string) || new Date().toISOString(),
        }))
      );
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ── Auto-resize textarea ──
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  // ── Load session messages ──
  const handleSelectSession = useCallback(async (id: string) => {
    if (loadingSession || id === currentSessionId) return;
    setLoadingSession(true);
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error('Session not found');
      const data = await res.json();

      clearMessages();
      setCurrentSessionId(id);

      // Load messages into store
      const msgs = Array.isArray(data.messages) ? data.messages : [];
      for (const m of msgs) {
        addChatMessage({
          id: m.id,
          role: m.role,
          content: m.content || '',
          toolCalls: m.toolCalls,
          tokens: m.tokens,
          duration: m.duration,
          createdAt: m.createdAt ? new Date(m.createdAt) : undefined,
        });
      }

      // Set model from session
      if (data.model && data.model !== 'hermes-agent') {
        setSelectedModel(data.model);
      }
    } catch (err) {
      console.error('Failed to load session:', err);
    } finally {
      setLoadingSession(false);
    }
  }, [currentSessionId, loadingSession, clearMessages, setCurrentSessionId, addChatMessage, setSelectedModel]);

  // ── Delete session ──
  const handleDeleteSession = useCallback(async (id: string, title: string) => {
    try {
      await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (id === currentSessionId) {
        clearMessages();
        setCurrentSessionId(null);
      }
      // Toast is handled in SessionList component
    } catch (err) {
      console.error('Failed to delete session:', err);
      throw err;
    }
  }, [currentSessionId, clearMessages, setCurrentSessionId]);

  // ── Send message ──
  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    setInput('');
    addChatMessage({ id: `msg-${Date.now()}`, role: 'user', content: trimmed, createdAt: new Date() });
    addChatMessage({ id: `msg-${Date.now()}-resp`, role: 'assistant', content: '', isStreaming: true, createdAt: new Date() });
    setIsStreaming(true);

    const effectiveModel = selectedModel && selectedModel !== 'hermes-agent' ? selectedModel : DEFAULT_MODEL;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...chatMessages, { role: 'user', content: trimmed }].map((m) => ({ role: m.role, content: m.content })),
          sessionId: currentSessionId || undefined,
          stream: true,
          model: effectiveModel,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || `Server error: ${response.status}`);
      }

      // Read session ID from header
      const newSessionId = response.headers.get('X-Session-Id');
      if (newSessionId && newSessionId !== currentSessionId) {
        setCurrentSessionId(newSessionId);
        fetchSessions();
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith('data:')) continue;

          const data = trimmedLine.slice(5).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) {
              fullContent += delta.content;
              updateLastAssistantMessage(fullContent);
            }
          } catch {
            // Skip
          }
        }
      }

      updateLastAssistantMessage(fullContent || 'No response received.');
    } catch (error) {
      console.error('Chat error:', error);
      updateLastAssistantMessage(
        `**Error**\n\n${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, chatMessages, currentSessionId, selectedModel, addChatMessage, updateLastAssistantMessage, setIsStreaming, setCurrentSessionId, fetchSessions]);

  const handleStop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

  const handleNewChat = () => {
    clearMessages();
    setCurrentSessionId(null);
  };

  const handleSuggestionClick = (text: string) => {
    setInput(text);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleModelSelect = useCallback((model: string) => {
    setSelectedModel(model);
    toast.success('Model changed', {
      description: `Switched to ${getModelName(model)}`,
      duration: 2000,
    });
  }, [setSelectedModel]);

  const hasMessages = chatMessages.length > 0;

  return (
    <div className="flex h-full">
      {/* ─── Left Panel: Session List ─── */}
      <div className="hidden md:flex w-72 border-r border-border/60 bg-card/30 flex-col shrink-0">
        <SessionList
          sessions={sessions}
          activeId={currentSessionId}
          onSelect={handleSelectSession}
          onNew={handleNewChat}
          onDelete={handleDeleteSession}
        />
      </div>

      {/* ─── Right Panel: Chat Area ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-sm px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden size-8">
                  <MessageSquare className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetTitle className="sr-only">Sessions</SheetTitle>
                <SessionList
                  sessions={sessions}
                  activeId={currentSessionId}
                  onSelect={handleSelectSession}
                  onNew={handleNewChat}
                  onDelete={handleDeleteSession}
                />
              </SheetContent>
            </Sheet>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold truncate">
                {loadingSession ? 'Loading...' : hasMessages ? 'Chat' : 'New Chat'}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {isStreaming ? (
                  <span className="flex items-center gap-1 text-primary">
                    <Loader2 className="size-3 animate-spin" /> Generating...
                  </span>
                ) : (
                  'Hermes Agent Ready'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Model selector */}
            <ModelSelector
              selectedModel={selectedModel || DEFAULT_MODEL}
              onSelectModel={handleModelSelect}
              disabled={isStreaming}
            />

            <Separator orientation="vertical" className="h-5 mx-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8" onClick={handleNewChat}>
                  <Plus className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New Chat</TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* Messages Area — fixed height, scrolls internally */}
        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
          {!hasMessages ? (
            <WelcomeScreen onSuggestionClick={handleSuggestionClick} />
          ) : (
            <div className="py-4 max-w-3xl mx-auto">
              <AnimatePresence mode="popLayout">
                {chatMessages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area — always fixed at bottom */}
        <div className="shrink-0 border-t border-border/60 bg-background/80 backdrop-blur-sm px-4 py-3">
          <div className="max-w-3xl mx-auto">
            <div className="relative flex items-end gap-2 rounded-2xl border border-border/60 bg-card p-2 focus-within:ring-2 focus-within:ring-ring/50 focus-within:border-border transition-all">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8 rounded-xl text-muted-foreground hover:text-foreground shrink-0">
                    <Paperclip className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Attach files</TooltipContent>
              </Tooltip>

              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Hermes Agent..."
                className="flex-1 min-h-[36px] max-h-[200px] resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/60"
                rows={1}
                disabled={isStreaming}
              />

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8 rounded-xl text-muted-foreground hover:text-foreground shrink-0">
                    <Mic className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Voice input</TooltipContent>
              </Tooltip>

              {isStreaming ? (
                <Button size="icon" className="size-8 rounded-xl shrink-0" variant="destructive" onClick={handleStop}>
                  <Square className="size-3.5" />
                </Button>
              ) : (
                <Button size="icon" className="size-8 rounded-xl shrink-0" onClick={handleSend} disabled={!input.trim()}>
                  <Send className="size-3.5" />
                </Button>
              )}
            </div>
            <p className="text-center text-[10px] text-muted-foreground/60 mt-2">
              Hermes Agent — Web interface for your AI agent. Press Enter to send, Shift+Enter for new line.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
