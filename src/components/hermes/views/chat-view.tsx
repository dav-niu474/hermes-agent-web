'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Square,
  Plus,
  Search,
  MessageSquare,
  Trash2,
  MoreHorizontal,
  ChevronDown,
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
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useAppStore, type ChatMessage } from '@/store/app-store';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

/* ═════════════════════════════════════════════════════
   SAMPLE SESSIONS
   ═════════════════════════════════════════════════════ */

const SAMPLE_SESSIONS = [
  { id: 'demo-1', title: 'Building a REST API with FastAPI', model: 'claude-opus-4', messages: 24, updatedAt: new Date('2025-01-15T11:45:00') },
  { id: 'demo-2', title: 'Docker Container Setup Guide', model: 'gpt-4o', messages: 18, updatedAt: new Date('2025-01-15T09:20:00') },
  { id: 'demo-3', title: 'React Performance Optimization', model: 'claude-3.5-sonnet', messages: 32, updatedAt: new Date('2025-01-14T16:30:00') },
  { id: 'demo-4', title: 'Database Migration Strategy', model: 'gpt-4o', messages: 15, updatedAt: new Date('2025-01-14T10:00:00') },
  { id: 'demo-5', title: 'Git Workflow Best Practices', model: 'claude-opus-4', messages: 8, updatedAt: new Date('2025-01-13T14:20:00') },
];

const SUGGESTIONS = [
  { text: 'Search the web for the latest AI news', icon: Globe, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { text: 'Help me write a Python script for data processing', icon: Code, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { text: 'Analyze this image and describe its contents', icon: Image, color: 'text-rose-500', bg: 'bg-rose-500/10' },
  { text: 'Create a scheduled daily task for me', icon: Clock, color: 'text-teal-500', bg: 'bg-teal-500/10' },
];

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
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-center my-3"
      >
        <Badge variant="secondary" className="text-xs px-3 py-1 bg-muted/60 text-muted-foreground">
          {message.content}
        </Badge>
      </motion.div>
    );
  }

  if (isTool) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-start my-2 px-4"
      >
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
      {/* Avatar */}
      <Avatar className={cn('size-8 shrink-0 mt-0.5', isUser ? 'bg-primary' : 'bg-muted')}>
        <AvatarFallback className={cn('text-xs', isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
          {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
        </AvatarFallback>
      </Avatar>

      {/* Content */}
      <div className={cn('max-w-[80%] min-w-0 flex flex-col gap-1.5', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-md'
              : 'bg-card border border-border/60 rounded-tl-md'
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

        {/* Meta row */}
        <div className={cn('flex items-center gap-2', isUser ? 'flex-row-reverse' : 'flex-row')}>
          {!isUser && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 opacity-0 group-hover:opacity-100 hover:opacity-100"
                  onClick={handleCopy}
                >
                  {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy response</TooltipContent>
            </Tooltip>
          )}
          {message.duration && (
            <span className="text-[10px] text-muted-foreground">{(message.duration / 1000).toFixed(1)}s</span>
          )}
          {message.tokens && (
            <span className="text-[10px] text-muted-foreground">{message.tokens} tokens</span>
          )}
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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-lg"
      >
        {/* Hermes orb */}
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

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-2xl font-bold tracking-tight mb-2"
        >
          Welcome to Hermes Agent
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-muted-foreground text-sm mb-8"
        >
          Your self-improving AI assistant with 47+ tools, 100+ skills, and persistent memory.
          Ask anything, delegate tasks, or automate workflows.
        </motion.p>

        {/* Suggestions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full"
        >
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
   SESSION LIST (sidebar)
   ═════════════════════════════════════════════════════ */

function SessionList({
  sessions,
  activeId,
  onSelect,
  onNew,
}: {
  sessions: typeof SAMPLE_SESSIONS;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = sessions.filter((s) =>
    s.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-3">
        <Button onClick={onNew} className="w-full gap-2" size="sm">
          <Plus className="size-4" />
          New Chat
        </Button>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search sessions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="px-2 pb-2 space-y-0.5">
          {filtered.map((session) => (
            <button
              key={session.id}
              onClick={() => onSelect(session.id)}
              className={cn(
                'group w-full text-left px-3 py-2.5 rounded-lg transition-colors',
                activeId === session.id
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium truncate">{session.title}</p>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-6 opacity-0 group-hover:opacity-100 shrink-0">
                      <MoreHorizontal className="size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuItem className="text-destructive text-xs">
                      <Trash2 className="size-3" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                  {session.model}
                </Badge>
                <span className="text-[10px] text-muted-foreground">{session.messages} msgs</span>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
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
    isStreaming,
    setIsStreaming,
    currentSessionId,
    setCurrentSessionId,
    chatSessions,
    setChatSessions,
    selectedModel,
    setSelectedModel,
    availableModels,
    clearMessages,
  } = useAppStore();

  const [input, setInput] = useState('');
  const [sessions, setSessions] = useState(SAMPLE_SESSIONS);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Initialize sessions
  useEffect(() => {
    if (chatSessions.length > 0) {
      setSessions(chatSessions.map((s, i) => ({
        ...s,
        messages: Math.floor(Math.random() * 50) + 5,
        updatedAt: new Date(Date.now() - i * 3600000),
      })));
    }
  }, [chatSessions]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    setInput('');

    // Add user message
    addChatMessage({
      id: `msg-${Date.now()}`,
      role: 'user',
      content: trimmed,
      createdAt: new Date(),
    });

    // Add placeholder assistant message
    addChatMessage({
      id: `msg-${Date.now()}-resp`,
      role: 'assistant',
      content: '',
      isStreaming: true,
      createdAt: new Date(),
    });

    setIsStreaming(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...chatMessages, { role: 'user', content: trimmed }].map(m => ({
            role: m.role,
            content: m.content,
          })),
          sessionId: currentSessionId || undefined,
          model: selectedModel !== 'default' ? selectedModel : undefined,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
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
            // Skip malformed JSON
          }
        }
      }

      // Final update to remove streaming cursor
      updateLastAssistantMessage(fullContent || 'I apologize, but I was unable to generate a response. Please check your Hermes Agent connection.');
    } catch (error) {
      console.error('Chat error:', error);
      updateLastAssistantMessage(
        `⚠️ **Connection Error**\n\nUnable to reach Hermes Agent. Please ensure the agent is running and the connection URL is configured correctly in Settings.\n\n\`\`\`\n${error instanceof Error ? error.message : 'Unknown error'}\n\`\`\``
      );
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, chatMessages, currentSessionId, selectedModel, addChatMessage, updateLastAssistantMessage, setIsStreaming]);

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

  const hasMessages = chatMessages.length > 0;

  return (
    <div className="flex h-full">
      {/* ─── Left Panel: Session List ─── */}
      <div className="hidden md:flex w-72 border-r border-border/60 bg-card/30 flex-col shrink-0">
        <SessionList
          sessions={sessions}
          activeId={currentSessionId}
          onSelect={(id) => {
            setCurrentSessionId(id);
            clearMessages();
          }}
          onNew={handleNewChat}
        />
      </div>

      {/* ─── Right Panel: Chat Area ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-sm px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile session drawer */}
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
                  onSelect={(id) => {
                    setCurrentSessionId(id);
                    clearMessages();
                  }}
                  onNew={handleNewChat}
                />
              </SheetContent>
            </Sheet>

            <div className="min-w-0">
              <h2 className="text-sm font-semibold truncate">
                {currentSessionId
                  ? sessions.find(s => s.id === currentSessionId)?.title || 'Chat'
                  : 'New Chat'}
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
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="h-8 w-auto min-w-[160px] text-xs">
                <SelectValue placeholder="Model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nvidia/llama-3.1-nemotron-70b-instruct">Nemotron 70B</SelectItem>
                <SelectItem value="nvidia/llama-3.1-nemotron-ultra-253b">Nemotron Ultra 253B</SelectItem>
                <SelectItem value="meta/llama-3.1-405b-instruct">Llama 3.1 405B</SelectItem>
                <SelectItem value="mistralai/mixtral-8x22b-instruct-v0.1">Mixtral 8x22B</SelectItem>
                <SelectItem value="nvidia/deepseek-llama3.1-8b-instruct">DeepSeek Llama 8B</SelectItem>
                <SelectItem value="nvidia/nemotron-4-340b-instruct">Nemotron 4 340B</SelectItem>
              </SelectContent>
            </Select>

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

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
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

        {/* Input Area */}
        <div className="shrink-0 border-t border-border/60 bg-background/80 backdrop-blur-sm px-4 py-3">
          <div className="max-w-3xl mx-auto">
            <div className="relative flex items-end gap-2 rounded-2xl border border-border/60 bg-card p-2 focus-within:ring-2 focus-within:ring-ring/50 focus-within:border-border transition-all">
              {/* Attachment button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8 rounded-xl text-muted-foreground hover:text-foreground shrink-0">
                    <Paperclip className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Attach files</TooltipContent>
              </Tooltip>

              {/* Textarea */}
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

              {/* Mic button (decorative) */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8 rounded-xl text-muted-foreground hover:text-foreground shrink-0">
                    <Mic className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Voice input</TooltipContent>
              </Tooltip>

              {/* Send / Stop button */}
              {isStreaming ? (
                <Button
                  size="icon"
                  className="size-8 rounded-xl shrink-0"
                  variant="destructive"
                  onClick={handleStop}
                >
                  <Square className="size-3.5" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  className="size-8 rounded-xl shrink-0"
                  onClick={handleSend}
                  disabled={!input.trim()}
                >
                  <Send className="size-3.5" />
                </Button>
              )}
            </div>

            {/* Footer hint */}
            <p className="text-center text-[10px] text-muted-foreground/60 mt-2">
              Hermes Agent may produce inaccurate information. Press Enter to send, Shift+Enter for new line.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
