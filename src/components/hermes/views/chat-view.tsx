'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Send,
  Square,
  Plus,
  Search,
  MessageSquare,
  Trash2,
  MoreHorizontal,
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
  ChevronRight,
  Cpu,
  ArrowDown,
  Brain,
  AlertCircle,
  CheckCircle2,
  Terminal,
  X,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
import { useAppStore, type ChatMessage, type ToolCallEntry } from '@/store/app-store';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

const SUGGESTIONS = [
  { text: 'Search the web for the latest AI news', icon: Globe, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
  { text: 'Help me write a Python script for data processing', icon: Code, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-500/10' },
  { text: 'Analyze this image and describe its contents', icon: Image, color: 'text-rose-600', bg: 'bg-rose-50 dark:bg-rose-500/10' },
  { text: 'Create a scheduled daily task for me', icon: Clock, color: 'text-teal-600', bg: 'bg-teal-50 dark:bg-teal-500/10' },
];

/* ═════════════════════════════════════════════════════
   MODEL DEFINITIONS
   ═════════════════════════════════════════════════════ */

import { MODEL_GROUPS, ALL_MODELS, DEFAULT_MODEL, getModelName, getModelDef } from '@/lib/hermes/models';

function getModelProvider(modelId: string): string {
  const found = getModelDef(modelId);
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
   THINKING BLOCK (collapsible reasoning display)
   ═════════════════════════════════════════════════════ */

function ThinkingBlock({ reasoning, isStreaming }: { reasoning: string; isStreaming?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!reasoning) return null;
  const isDone = !isStreaming;
  const lines = reasoning.split('\n').filter((l) => l.trim());
  const preview = lines.slice(0, 2).join(' ').slice(0, 120);
  const fullLines = lines.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-2"
    >
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'group/w flex items-center gap-2 w-full text-left px-3 py-2 rounded-xl text-xs transition-colors',
          'bg-violet-50/80 dark:bg-violet-500/5 border border-violet-200/50 dark:border-violet-500/15',
          'hover:bg-violet-100/80 dark:hover:bg-violet-500/10',
        )}
      >
        <Brain className="size-3.5 shrink-0 text-violet-500 dark:text-violet-400" />
        <span className="font-medium text-violet-700 dark:text-violet-300">
          {isDone ? 'Thought for a moment' : 'Thinking...'}
        </span>
        {!isDone && <Loader2 className="size-3 animate-spin text-violet-400" />}
        {isDone && fullLines > 2 && (
          <span className="text-violet-500/60 dark:text-violet-400/50">({fullLines} lines)</span>
        )}
        <ChevronDown className={cn(
          'size-3 ml-auto text-violet-400 transition-transform',
          open && 'rotate-180'
        )} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 py-2.5 mt-1 rounded-xl bg-violet-50/60 dark:bg-violet-500/5 border border-violet-200/30 dark:border-violet-500/10">
              <pre className="text-[11px] leading-relaxed text-violet-800/80 dark:text-violet-200/70 whitespace-pre-wrap font-mono break-words max-h-64 overflow-y-auto">
                {reasoning}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inline preview when collapsed and streaming */}
      {!open && isStreaming && preview && (
        <p className="text-[11px] text-violet-500/60 dark:text-violet-400/50 px-3 mt-1 truncate font-mono">
          {preview}
        </p>
      )}
    </motion.div>
  );
}

/* ═════════════════════════════════════════════════════
   TOOL CALL BLOCK
   ═════════════════════════════════════════════════════ */

function ToolCallBlock({ entry }: { entry: ToolCallEntry }) {
  const [open, setOpen] = useState(false);
  const isRunning = entry.status === 'running';
  const isDone = entry.status === 'done';
  const isError = entry.status === 'error';
  const duration = entry.startedAt && entry.completedAt
    ? ((entry.completedAt - entry.startedAt) / 1000).toFixed(1)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-1.5"
    >
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'group/t flex items-center gap-2 w-full text-left px-3 py-2 rounded-xl text-xs transition-colors',
          isRunning && 'bg-amber-50/80 dark:bg-amber-500/5 border border-amber-200/50 dark:border-amber-500/15',
          isDone && 'bg-emerald-50/80 dark:bg-emerald-500/5 border border-emerald-200/50 dark:border-emerald-500/15',
          isError && 'bg-red-50/80 dark:bg-red-500/5 border border-red-200/50 dark:border-red-500/15',
        )}
      >
        <Wrench className={cn(
          'size-3.5 shrink-0',
          isRunning && 'text-amber-500 dark:text-amber-400',
          isDone && 'text-emerald-500 dark:text-emerald-400',
          isError && 'text-red-500 dark:text-red-400',
        )} />
        <span className={cn(
          'font-mono font-medium truncate',
          isRunning && 'text-amber-700 dark:text-amber-300',
          isDone && 'text-emerald-700 dark:text-emerald-300',
          isError && 'text-red-700 dark:text-red-300',
        )}>
          {entry.name}
        </span>
        {isRunning && <Loader2 className="size-3 animate-spin text-amber-400" />}
        {isDone && <CheckCircle2 className="size-3 text-emerald-500" />}
        {isError && <AlertCircle className="size-3 text-red-500" />}
        {duration && (
          <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">{duration}s</span>
        )}
        <ChevronDown className={cn(
          'size-3 text-muted-foreground/50 transition-transform shrink-0',
          open && 'rotate-180'
        )} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 py-2.5 mt-1 rounded-xl bg-muted/50 border border-border/40 space-y-2">
              {entry.args && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Arguments</p>
                  <pre className="text-[11px] font-mono text-foreground/80 bg-background/50 rounded-lg p-2 overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap break-words">
                    {(() => { try { return JSON.stringify(JSON.parse(entry.args), null, 2); } catch { return entry.args; } })()}
                  </pre>
                </div>
              )}
              {entry.result && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Result</p>
                  <pre className="text-[11px] font-mono text-foreground/80 bg-background/50 rounded-lg p-2 overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap break-words">
                    {(() => { try { return JSON.stringify(JSON.parse(entry.result), null, 2); } catch { return entry.result; } })()}
                  </pre>
                </div>
              )}
              {isRunning && !entry.result && (
                <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <Terminal className="size-3" />
                  <span className="text-[11px]">Executing...</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
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
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center my-4">
        <Badge variant="secondary" className="text-xs px-3 py-1 bg-muted/60 text-muted-foreground">
          {message.content}
        </Badge>
      </motion.div>
    );
  }

  if (isTool) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start my-2 px-4">
        <div className="max-w-[85%] rounded-xl border border-border/60 bg-muted/30 p-3">
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

  const timeStr = message.createdAt
    ? format(new Date(message.createdAt), 'HH:mm')
    : null;

  const hasReasoning = !!message.reasoning;
  const hasToolCalls = (message.toolCallEntries?.length ?? 0) > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn('group flex gap-2.5 my-3 px-4', isUser ? 'flex-row-reverse' : 'flex-row')}
    >
      <Avatar className={cn('size-7 shrink-0 mt-1', isUser ? 'bg-primary' : 'bg-muted')}>
        <AvatarFallback className={cn('text-[11px]', isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
          {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
        </AvatarFallback>
      </Avatar>
      <div className={cn('max-w-[85%] min-w-0 flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
        {/* Thinking / Reasoning Block */}
        {!isUser && hasReasoning && (
          <ThinkingBlock reasoning={message.reasoning!} isStreaming={message.isStreaming} />
        )}

        {/* Tool Call Blocks */}
        {!isUser && hasToolCalls && (
          <div className="space-y-1">
            {message.toolCallEntries!.map((tc) => (
              <ToolCallBlock key={tc.id} entry={tc} />
            ))}
          </div>
        )}

        {/* Main content bubble */}
        {(isUser || message.content) && (
          <div
            className={cn(
              'rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed',
              isUser
                ? 'bg-primary text-primary-foreground rounded-tr-sm'
                : cn(
                    'bg-card border border-border/50 rounded-tl-sm shadow-sm',
                    (hasReasoning || hasToolCalls) && 'rounded-tl-lg'
                  )
            )}
          >
            {isUser ? (
              <>
                {message.imageUrl && (
                  <img
                    src={message.imageUrl}
                    alt="Uploaded"
                    className="max-w-[240px] max-h-[200px] rounded-lg mb-2 object-contain"
                  />
                )}
                <p className="whitespace-pre-wrap">{message.content}</p>
              </>
            ) : (
              <div className="markdown-content prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown>{message.content || ' '}</ReactMarkdown>
              </div>
            )}
            {message.isStreaming && message.content && <span className="streaming-cursor" />}
          </div>
        )}

        {/* Streaming indicator when no content yet but thinking/tools are happening */}
        {!isUser && !message.content && message.isStreaming && (hasReasoning || hasToolCalls) && (
          <div className="flex items-center gap-1.5 px-1 py-0.5">
            <Loader2 className="size-3 animate-spin text-primary/50" />
            <span className="text-[10px] text-muted-foreground/50">Generating response...</span>
          </div>
        )}

        <div className={cn('flex items-center gap-1.5 px-1 h-4', isUser ? 'flex-row-reverse' : 'flex-row')}>
          {timeStr && <span className="text-[10px] text-muted-foreground/60">{timeStr}</span>}
          {!isUser && !message.isStreaming && message.content && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-5 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                  onClick={handleCopy}
                >
                  {copied ? <Check className="size-2.5 text-emerald-500" /> : <Copy className="size-2.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Copy response</TooltipContent>
            </Tooltip>
          )}
          {message.duration && <span className="text-[10px] text-muted-foreground/60">{(message.duration / 1000).toFixed(1)}s</span>}
          {message.tokens && <span className="text-[10px] text-muted-foreground/60">{message.tokens} tokens</span>}
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
    <div className="flex items-center justify-center h-full px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-md w-full"
      >
        <motion.div
          className="relative mx-auto w-16 h-16 mb-5"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/25 to-transparent blur-xl" />
          <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
            <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 text-primary-foreground" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3C8 3 5 6 4.5 10L4 13H20L19.5 10C19 6 16 3 12 3Z" />
              <path d="M3 13C3 13 4 15 12 15C20 15 21 13 21 13" />
              <path d="M4.5 10L2 8.5C1.5 8 1 8.5 1.5 9L4.5 12" />
              <path d="M19.5 10L22 8.5C22.5 8 23 8.5 22.5 9L19.5 12" />
            </svg>
          </div>
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="text-xl font-bold tracking-tight mb-1.5"
        >
          Hermes Agent
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="text-muted-foreground text-sm mb-8"
        >
          Multi-model AI assistant with tools, memory, and reasoning
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full"
        >
          {SUGGESTIONS.map((s) => (
            <motion.button
              key={s.text}
              onClick={() => onSuggestionClick(s.text)}
              className="group flex items-start gap-2.5 p-3 rounded-xl border border-border/50 bg-card/60 hover:bg-card hover:border-border hover:shadow-sm transition-colors text-left"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className={cn('p-1.5 rounded-lg shrink-0', s.bg)}>
                <s.icon className={cn('size-3.5', s.color)} />
              </div>
              <p className="text-xs font-medium text-foreground leading-snug">{s.text}</p>
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
      <div className="p-3 space-y-2.5">
        <Button onClick={onNew} className="w-full gap-2" size="sm">
          <Plus className="size-3.5" />
          New Chat
        </Button>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-2 pb-2 space-y-0.5">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">No sessions yet</p>
          )}
          {filtered.map((session) => (
            <button
              key={session.id}
              onClick={() => onSelect(session.id)}
              className={cn(
                'group w-full text-left px-2.5 py-2 rounded-lg transition-colors',
                activeId === session.id
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <p className="text-xs font-medium truncate">{session.title}</p>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-5 opacity-0 group-hover:opacity-100 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-32">
                    <DropdownMenuItem
                      className="text-destructive text-xs gap-1.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget({ id: session.id, title: session.title });
                      }}
                    >
                      <Trash2 className="size-3" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge variant="secondary" className="text-[9px] px-1 py-0 font-normal leading-tight">
                  {session.model ? getModelName(session.model) : 'Llama 3.3'}
                </Badge>
                <span className="text-[9px] text-muted-foreground/70">{session.messageCount} msg</span>
                <span className="text-[9px] text-muted-foreground/50 ml-auto truncate max-w-[60px]">
                  {formatDistanceToNow(new Date(session.updatedAt), { addSuffix: false })}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

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
              {deleting ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Trash2 className="size-3.5 mr-1" />}
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

  const filteredGroups = MODEL_GROUPS.map((group) => ({
    ...group,
    models: group.models.filter(
      (m) =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.id.toLowerCase().includes(search.toLowerCase()) ||
        m.group.toLowerCase().includes(search.toLowerCase()) ||
        m.desc.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter((group) => group.models.length > 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-xs font-normal px-2 h-7 w-40 sm:w-48 text-muted-foreground hover:text-foreground overflow-hidden"
          disabled={disabled}
        >
          <Cpu className="size-3.5 shrink-0" />
          <span className="flex-1 min-w-0 truncate text-left">{selectedName}</span>
          <ChevronDown className="size-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 overflow-hidden" align="start">
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
        <ScrollArea className="max-h-96">
          <div className="p-1">
            {filteredGroups.map((group) => (
              <div key={group.provider}>
                <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.provider}
                </div>
                {group.models.map((model) => {
                  const isSelected = model.id === selectedModel;
                  return (
                    <div
                      key={model.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        onSelectModel(model.id);
                        setOpen(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectModel(model.id);
                          setOpen(false);
                        }
                      }}
                      className={cn(
                        'w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors flex items-center gap-2 min-w-0 overflow-hidden',
                        isSelected
                          ? 'bg-accent text-accent-foreground'
                          : 'text-foreground hover:bg-muted/60 cursor-pointer'
                      )}
                    >
                      <span className="font-medium truncate min-w-0">{model.name}</span>
                      {model.tags && model.tags.length > 0 && (
                        <span className="flex gap-1 shrink-0">
                          {model.tags.map((tag) => (
                            <span key={tag} className="px-1 py-0.5 rounded text-[9px] font-medium bg-primary/10 text-primary leading-none">{tag}</span>
                          ))}
                        </span>
                      )}
                      {model.desc && (
                        <span className="text-[10px] text-muted-foreground/60 truncate hidden lg:inline">{model.desc}</span>
                      )}
                      {isSelected && <Check className="size-3 shrink-0 text-primary ml-auto" />}
                    </div>
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
   SCROLL-TO-BOTTOM FAB
   ═════════════════════════════════════════════════════ */

function ScrollToBottom({ onClick }: { onClick: () => void }) {
  const [visible, setVisible] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Find the scrollable messages container (sibling of this component)
    const container = scrollRef.current?.parentElement;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setVisible(scrollHeight - scrollTop - clientHeight > 100);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div ref={scrollRef}>
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10"
          >
            <Button
              variant="secondary"
              size="icon"
              className="size-8 rounded-full shadow-md border border-border/60"
              onClick={onClick}
            >
              <ArrowDown className="size-3.5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
    appendReasoning,
    upsertToolCall,
    completeToolCall,
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
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isAutoScrollRef = useRef(true);

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

  // ── Auto-scroll to bottom ──
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  useEffect(() => {
    if (isAutoScrollRef.current) {
      scrollToBottom();
    }
  }, [chatMessages, scrollToBottom]);

  // ── Detect user manual scroll to pause auto-scroll ──
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      // If user scrolled up more than 60px from bottom, pause auto-scroll
      isAutoScrollRef.current = scrollHeight - scrollTop - clientHeight < 60;
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

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

      if (data.model && data.model !== 'hermes-agent') {
        setSelectedModel(data.model);
      }

      // Scroll to bottom after loading messages
      setTimeout(() => {
        isAutoScrollRef.current = true;
        scrollToBottom('instant');
      }, 50);
    } catch (err) {
      console.error('Failed to load session:', err);
    } finally {
      setLoadingSession(false);
    }
  }, [currentSessionId, loadingSession, clearMessages, setCurrentSessionId, addChatMessage, setSelectedModel, scrollToBottom]);

  // ── Delete session ──
  const handleDeleteSession = useCallback(async (id: string, title: string) => {
    try {
      await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (id === currentSessionId) {
        clearMessages();
        setCurrentSessionId(null);
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
      throw err;
    }
  }, [currentSessionId, clearMessages, setCurrentSessionId]);

  // ── Handle image file selection ──
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be less than 10MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    // Reset the input so the same file can be re-selected
    e.target.value = '';
  }, []);

  const clearImagePreview = useCallback(() => {
    setImagePreview(null);
  }, []);

  // ── Send message ──
  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if ((!trimmed && !imagePreview) || isStreaming) return;

    const attachedImage = imagePreview;
    setInput('');
    setImagePreview(null);
    setStreamError(null);
    isAutoScrollRef.current = true;
    addChatMessage({
      id: `msg-${Date.now()}`,
      role: 'user',
      content: trimmed || '(Image)',
      imageUrl: attachedImage || undefined,
      createdAt: new Date(),
    });
    addChatMessage({ id: `msg-${Date.now()}-resp`, role: 'assistant', content: '', isStreaming: true, createdAt: new Date() });
    setIsStreaming(true);

    const effectiveModel = selectedModel && selectedModel !== 'hermes-agent' ? selectedModel : DEFAULT_MODEL;
    const effectiveProvider = getModelProvider(effectiveModel);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...chatMessages, { role: 'user', content: trimmed || '(Image)', image_url: attachedImage || undefined }].map((m) => ({
            role: m.role,
            content: m.content,
            ...(m.image_url ? { image_url: m.image_url } : {}),
          })),
          sessionId: currentSessionId || undefined,
          stream: true,
          model: effectiveModel,
          provider: effectiveProvider,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || `Server error: ${response.status}`);
      }

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
            const eventType = parsed['x-event-type'] || 'content';
            const delta = parsed.choices?.[0]?.delta;

            switch (eventType) {
              case 'reasoning': {
                // Append to reasoning block
                if (delta?.content) {
                  appendReasoning(delta.content);
                }
                break;
              }
              case 'tool_start': {
                // Register a running tool call
                const toolId = parsed['x-tool-id'] || `tool-${Date.now()}`;
                const toolName = parsed['x-tool-name'] || 'unknown';
                const toolArgs = parsed['x-tool-args'] || '';
                upsertToolCall({
                  id: toolId,
                  name: toolName,
                  args: toolArgs,
                  status: 'running',
                  startedAt: Date.now(),
                });
                break;
              }
              case 'tool_end': {
                // Complete the tool call
                const endToolId = parsed['x-tool-id'] || '';
                const toolResult = parsed['x-tool-result'] || '';
                if (endToolId) {
                  completeToolCall(endToolId, toolResult);
                }
                break;
              }
              case 'error': {
                const errMsg = parsed['x-error'] || 'An unknown error occurred';
                console.error('[SSE] Stream error:', errMsg);
                setStreamError(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
                break;
              }
              case 'content':
              default: {
                // Regular content delta
                if (delta?.content) {
                  fullContent += delta.content;
                  updateLastAssistantMessage(fullContent);
                }
                break;
              }
            }
          } catch {
            // Skip malformed chunks
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
      // Clear stream error after a short delay so user can see it
      setTimeout(() => setStreamError(null), 8000);
    }
  }, [input, isStreaming, chatMessages, currentSessionId, selectedModel, imagePreview, addChatMessage, updateLastAssistantMessage, appendReasoning, upsertToolCall, completeToolCall, setIsStreaming, setCurrentSessionId, fetchSessions]);

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
    <div className="absolute inset-0 flex">
      {/* ─── Left Panel: Session List ─── */}
      <div className="hidden md:flex w-64 lg:w-72 border-r border-border/50 bg-card/20 flex-col shrink-0">
        <SessionList
          sessions={sessions}
          activeId={currentSessionId}
          onSelect={handleSelectSession}
          onNew={handleNewChat}
          onDelete={handleDeleteSession}
        />
      </div>

      {/* ─── Right Panel: Chat Area ─── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Header — fixed at top */}
        <header className="shrink-0 border-b border-border/50 bg-background/90 backdrop-blur-sm px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2 z-10">
          <div className="flex items-center gap-2.5 min-w-0">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden size-8">
                  <MessageSquare className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
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
              <h2 className="text-sm font-semibold truncate leading-tight">
                {loadingSession ? 'Loading...' : currentSessionId ? 'Chat' : 'New Chat'}
              </h2>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                {isStreaming ? (
                  <span className="flex items-center gap-1 text-primary">
                    <Loader2 className="size-2.5 animate-spin" /> Generating...
                  </span>
                ) : (
                  'Hermes Agent Ready'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <ModelSelector
              selectedModel={selectedModel || DEFAULT_MODEL}
              onSelectModel={handleModelSelect}
              disabled={isStreaming}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7" onClick={handleNewChat}>
                  <Plus className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New Chat</TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* Messages Area — THIS is the scrollable part */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto overflow-x-hidden min-h-0"
          style={{ scrollBehavior: 'smooth' }}
        >
          {!hasMessages ? (
            <WelcomeScreen onSuggestionClick={handleSuggestionClick} />
          ) : (
            <div className="py-4 max-w-3xl mx-auto">
              {chatMessages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              <div ref={messagesEndRef} className="h-1" />
            </div>
          )}
          <ScrollToBottom onClick={scrollToBottom} />
        </div>

        {/* Input Area — fixed at bottom */}
        <div className="shrink-0 border-t border-border/50 bg-background/90 backdrop-blur-sm px-3 sm:px-4 py-3">
          <div className="max-w-3xl mx-auto">
            <div className="relative flex items-end gap-1.5 rounded-2xl border border-border/60 bg-card/80 p-1.5 focus-within:ring-2 focus-within:ring-ring/40 focus-within:border-border transition-all">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-xl text-muted-foreground hover:text-foreground shrink-0"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isStreaming}
                  >
                    <Paperclip className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Upload image</TooltipContent>
              </Tooltip>

              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Hermes Agent..."
                className="flex-1 min-h-[36px] max-h-[200px] resize-none border-0 bg-transparent p-0 px-2 text-sm shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
                rows={1}
                disabled={isStreaming}
              />

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8 rounded-xl text-muted-foreground hover:text-foreground shrink-0">
                    <Mic className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Voice input</TooltipContent>
              </Tooltip>

              {isStreaming ? (
                <Button size="icon" className="size-8 rounded-xl shrink-0" variant="destructive" onClick={handleStop}>
                  <Square className="size-3" />
                </Button>
              ) : (
                <Button size="icon" className="size-8 rounded-xl shrink-0" onClick={handleSend} disabled={!input.trim() && !imagePreview}>
                  <Send className="size-3.5" />
                </Button>
              )}
            </div>
            <AnimatePresence>
              {imagePreview && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-2 mb-2 p-1.5 rounded-xl bg-muted/50 border border-border/40">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="size-12 rounded-lg object-cover shrink-0"
                    />
                    <span className="text-xs text-muted-foreground truncate flex-1">Image attached</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0"
                      onClick={clearImagePreview}
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {streamError && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="mb-2"
                >
                  <div className="flex items-start gap-2 p-2.5 rounded-xl bg-red-50/80 dark:bg-red-500/10 border border-red-200/60 dark:border-red-500/20">
                    <AlertCircle className="size-3.5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">{streamError}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <p className="text-center text-[10px] text-muted-foreground/40 mt-1.5 select-none">
              Hermes Agent &middot; Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
