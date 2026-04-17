'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Users,
  Play,
  SkipForward,
  Square,
  RotateCcw,
  ChevronDown,
  Plus,
  X,
  Loader2,
  Bot,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { useAppStore } from '@/store/app-store';
import { getLLMConfig } from '@/lib/hermes/models';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Participant {
  id: string;
  name: string;
  avatar: string;
  color: string;
  systemPrompt: string;
}

interface DiscussionMessage {
  id: string;
  role: 'user' | 'agent';
  agentId?: string;
  name: string;
  avatar: string;
  color: string;
  content: string;
  isStreaming?: boolean;
}

interface AgentInfo {
  agentId: string;
  name: string;
  avatar: string;
  color: string;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const DEFAULT_PARTICIPANTS: Participant[] = [
  {
    id: 'tech',
    name: '技术专家',
    avatar: '🔬',
    color: 'blue',
    systemPrompt: '资深技术架构师，擅长技术可行性、系统设计、性能优化分析',
  },
  {
    id: 'product',
    name: '产品经理',
    avatar: '💡',
    color: 'amber',
    systemPrompt: '经验丰富的产品经理，擅长用户需求、产品价值、商业模型分析',
  },
  {
    id: 'design',
    name: '设计师',
    avatar: '🎨',
    color: 'pink',
    systemPrompt: '优秀的产品设计师，擅长用户体验、视觉设计、交互设计分析',
  },
  {
    id: 'analyst',
    name: '数据分析师',
    avatar: '📊',
    color: 'emerald',
    systemPrompt: '专业的数据分析师，擅长数据驱动、趋势分析、竞品对比评估',
  },
];

const COLOR_OPTIONS = [
  { value: 'blue', label: '蓝色', class: 'bg-blue-500' },
  { value: 'amber', label: '琥珀', class: 'bg-amber-500' },
  { value: 'pink', label: '粉色', class: 'bg-pink-500' },
  { value: 'emerald', label: '绿色', class: 'bg-emerald-500' },
  { value: 'violet', label: '紫色', class: 'bg-violet-500' },
  { value: 'red', label: '红色', class: 'bg-red-500' },
  { value: 'orange', label: '橙色', class: 'bg-orange-500' },
  { value: 'cyan', label: '青色', class: 'bg-cyan-500' },
];

const AVATAR_OPTIONS = ['🧑‍💻', '👩‍🔬', '👨‍💼', '👩‍🎨', '🧑‍📊', '🤖', '🦊', '🐱', '🦁', '🐼', '🦄', '🎯'];

function getColorClasses(color: string): { bg: string; border: string; text: string; dot: string; light: string; ring: string } {
  const map: Record<string, { bg: string; border: string; text: string; dot: string; light: string; ring: string }> = {
    blue:    { bg: 'bg-blue-500', border: 'border-blue-300', text: 'text-blue-700', dot: 'bg-blue-400', light: 'bg-blue-50', ring: 'ring-blue-200' },
    amber:   { bg: 'bg-amber-500', border: 'border-amber-300', text: 'text-amber-700', dot: 'bg-amber-400', light: 'bg-amber-50', ring: 'ring-amber-200' },
    pink:    { bg: 'bg-pink-500', border: 'border-pink-300', text: 'text-pink-700', dot: 'bg-pink-400', light: 'bg-pink-50', ring: 'ring-pink-200' },
    emerald: { bg: 'bg-emerald-500', border: 'border-emerald-300', text: 'text-emerald-700', dot: 'bg-emerald-400', light: 'bg-emerald-50', ring: 'ring-emerald-200' },
    violet:  { bg: 'bg-violet-500', border: 'border-violet-300', text: 'text-violet-700', dot: 'bg-violet-400', light: 'bg-violet-50', ring: 'ring-violet-200' },
    red:     { bg: 'bg-red-500', border: 'border-red-300', text: 'text-red-700', dot: 'bg-red-400', light: 'bg-red-50', ring: 'ring-red-200' },
    orange:  { bg: 'bg-orange-500', border: 'border-orange-300', text: 'text-orange-700', dot: 'bg-orange-400', light: 'bg-orange-50', ring: 'ring-orange-200' },
    cyan:    { bg: 'bg-cyan-500', border: 'border-cyan-300', text: 'text-cyan-700', dot: 'bg-cyan-400', light: 'bg-cyan-50', ring: 'ring-cyan-200' },
  };
  return map[color] || map.blue;
}

// ---------------------------------------------------------------------------
// Message Bubble Component
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: DiscussionMessage }) {
  const isUser = message.role === 'user';
  const colors = getColorClasses(message.color);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      {/* Avatar */}
      <div
        className={`shrink-0 size-9 rounded-full flex items-center justify-center text-base ${
          isUser ? 'bg-foreground/10' : colors.light
        }`}
      >
        {isUser ? '👤' : message.avatar}
      </div>

      {/* Content */}
      <div className={`max-w-[80%] min-w-0 ${isUser ? 'text-right' : ''}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-medium ${isUser ? 'text-foreground' : colors.text}`}>
            {message.name}
          </span>
          {!isUser && (
            <span className={`size-1.5 rounded-full ${colors.dot}`} />
          )}
          {message.isStreaming && (
            <Loader2 className="size-3 animate-spin text-muted-foreground" />
          )}
        </div>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? 'bg-foreground text-background rounded-tr-sm'
              : `${colors.light} text-foreground rounded-tl-sm`
          }`}
        >
          <div className="whitespace-pre-wrap break-words">
            {message.content}
            {message.isStreaming && (
              <span className="inline-block w-2 h-4 bg-current opacity-60 animate-pulse ml-0.5 align-middle" />
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Participant Chip Component
// ---------------------------------------------------------------------------

function ParticipantChip({
  participant,
  isActive,
  onRemove,
}: {
  participant: Participant;
  isActive: boolean;
  onRemove?: () => void;
}) {
  const colors = getColorClasses(participant.color);

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
        isActive
          ? `${colors.border} ${colors.light} ${colors.text} ring-2 ${colors.ring}`
          : 'border-border bg-muted/50 text-muted-foreground'
      }`}
    >
      <span className="text-sm">{participant.avatar}</span>
      <span>{participant.name}</span>
      {isActive && (
        <span className={`size-2 rounded-full ${colors.dot} animate-pulse`} />
      )}
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-0.5 hover:text-destructive transition-colors"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Participant Dialog
// ---------------------------------------------------------------------------

function AddParticipantDialog({ onAdd }: { onAdd: (p: Participant) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('🤖');
  const [color, setColor] = useState('violet');
  const [prompt, setPrompt] = useState('');

  const handleAdd = () => {
    if (!name.trim() || !prompt.trim()) return;
    onAdd({
      id: `custom-${Date.now()}`,
      name: name.trim(),
      avatar,
      color,
      systemPrompt: prompt.trim(),
    });
    setName('');
    setAvatar('🤖');
    setColor('violet');
    setPrompt('');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-7">
          <Plus className="size-3.5" />
          <span className="text-xs">添加成员</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">添加讨论成员</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs text-muted-foreground">名称</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：市场总监"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">头像</label>
              <Select value={avatar} onValueChange={setAvatar}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVATAR_OPTIONS.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">颜色</label>
              <Select value={color} onValueChange={setColor}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLOR_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <span className="flex items-center gap-2">
                        <span className={`size-3 rounded-full ${c.class}`} />
                        {c.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">角色设定 / System Prompt</label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述这个角色的专业背景和分析视角..."
              className="min-h-[80px] text-sm resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">取消</Button>
          </DialogClose>
          <Button size="sm" onClick={handleAdd} disabled={!name.trim() || !prompt.trim()}>
            添加
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main RoundtableView
// ---------------------------------------------------------------------------

export function RoundtableView() {
  const { selectedModel } = useAppStore();

  // State
  const [topic, setTopic] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [participants, setParticipants] = useState<Participant[]>(DEFAULT_PARTICIPANTS);
  const [messages, setMessages] = useState<DiscussionMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState<AgentInfo | null>(null);
  const [streamingContent, setStreamingContent] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  // Clean up abort on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ── API call ──
  const runAgentTurn = useCallback(
    async (action: 'start' | 'continue' | 'respond', userMessage?: string) => {
      if (!topic.trim()) return;

      // If user sent a message, add it first
      if (userMessage) {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}`,
            role: 'user',
            name: '用户',
            avatar: '👤',
            color: 'blue',
            content: userMessage,
          },
        ]);
      }

      setIsStreaming(true);
      setStreamingContent('');

      // Build messages for API (only finalized ones)
      const apiMessages = [
        ...messages.map((m) => ({
          role: m.role,
          agentId: m.agentId,
          name: m.name,
          content: m.content,
        })),
      ];
      if (userMessage) {
        apiMessages.push({
          role: 'user',
          name: '用户',
          content: userMessage,
        });
      }

      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        const response = await fetch('/api/roundtable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: topic.trim(),
            participants,
            messages: apiMessages,
            action,
            model: selectedModel,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let agentInfo: AgentInfo | null = null;
        let content = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          // Parse SSE data lines
          const lines = text.split('\n');
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const dataStr = line.slice(6).trim();
            if (!dataStr) continue;

            try {
              const event = JSON.parse(dataStr);

              switch (event.type) {
                case 'agent_info':
                  agentInfo = {
                    agentId: event.agentId,
                    name: event.name,
                    avatar: event.avatar,
                    color: event.color,
                  };
                  setCurrentSpeaker(agentInfo);
                  // Add a placeholder message for streaming
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: `stream-${Date.now()}`,
                      role: 'agent',
                      agentId: event.agentId,
                      name: event.name,
                      avatar: event.avatar,
                      color: event.color,
                      content: '',
                      isStreaming: true,
                    },
                  ]);
                  break;

                case 'delta':
                  content += event.content;
                  setStreamingContent(content);
                  // Update the last streaming message
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastMsg = updated[updated.length - 1];
                    if (lastMsg?.isStreaming) {
                      updated[updated.length - 1] = {
                        ...lastMsg,
                        content,
                      };
                    }
                    return updated;
                  });
                  break;

                case 'done':
                  // Finalize the streaming message
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastMsg = updated[updated.length - 1];
                    if (lastMsg?.isStreaming) {
                      updated[updated.length - 1] = {
                        ...lastMsg,
                        content,
                        isStreaming: false,
                        id: `msg-${Date.now()}`,
                      };
                    }
                    return updated;
                  });
                  setStreamingContent('');
                  break;

                case 'error':
                  console.error('[Roundtable] SSE error:', event.error);
                  // Remove the placeholder and show error
                  setMessages((prev) => {
                    const updated = prev.filter((m) => !m.isStreaming);
                    return [
                      ...updated,
                      {
                        id: `error-${Date.now()}`,
                        role: 'agent',
                        agentId: agentInfo?.agentId,
                        name: agentInfo?.name || 'Agent',
                        avatar: agentInfo?.avatar || '⚠️',
                        color: agentInfo?.color || 'red',
                        content: `Error: ${event.error}`,
                      },
                    ];
                  });
                  break;
              }
            } catch {
              // Ignore JSON parse errors for partial lines
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // User cancelled — just stop
        } else {
          console.error('[Roundtable] Fetch error:', err);
        }
      } finally {
        setIsStreaming(false);
        setCurrentSpeaker(null);
        abortRef.current = null;
      }
    },
    [topic, participants, messages, selectedModel],
  );

  // ── Actions ──
  const handleStart = () => {
    if (!topic.trim() || isStreaming) return;
    runAgentTurn('start');
  };

  const handleContinue = () => {
    if (isStreaming) return;
    runAgentTurn('continue');
  };

  const handleUserSend = () => {
    if (!inputValue.trim() || isStreaming) return;
    const userMsg = inputValue.trim();
    setInputValue('');
    runAgentTurn('respond', userMsg);
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleReset = () => {
    abortRef.current?.abort();
    setMessages([]);
    setStreamingContent('');
    setCurrentSpeaker(null);
    setIsStreaming(false);
  };

  const handleRemoveParticipant = (id: string) => {
    if (isStreaming) return;
    setParticipants((prev) => prev.filter((p) => p.id !== id));
  };

  const handleAddParticipant = (p: Participant) => {
    setParticipants((prev) => [...prev, p]);
  };

  const hasMessages = messages.length > 0;

  // ── Render ──
  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <header className="shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="size-8 rounded-lg bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center">
              <Users className="size-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold truncate">圆桌讨论</h1>
              <p className="text-xs text-muted-foreground truncate">
                多Agent独立视角 · 轮流讨论
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasMessages && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs text-muted-foreground"
                    onClick={handleReset}
                    disabled={isStreaming}
                  >
                    <RotateCcw className="size-3.5" />
                    <span className="hidden sm:inline">重置</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>重新开始讨论</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0">
        {!hasMessages ? (
          /* Welcome Screen */
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="w-full max-w-lg space-y-6">
              {/* Title */}
              <div className="text-center space-y-2">
                <div className="text-4xl mb-3">🎯</div>
                <h2 className="text-xl font-bold">圆桌讨论</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  多位 AI 专家从不同专业视角轮流分析问题，
                  <br />每位 Agent 都是独立系统，充分讨论后给出全面结论
                </p>
              </div>

              {/* Topic Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium">讨论主题</label>
                <Textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="输入你想讨论的话题或问题，例如：如何设计一个高并发的即时通讯系统？"
                  className="min-h-[100px] resize-none text-sm"
                />
              </div>

              {/* Participants */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">
                    参与成员
                    <span className="text-muted-foreground font-normal ml-1">
                      ({participants.length})
                    </span>
                  </label>
                  <AddParticipantDialog onAdd={handleAddParticipant} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {participants.map((p) => (
                    <ParticipantChip
                      key={p.id}
                      participant={p}
                      isActive={false}
                      onRemove={
                        participants.length > 1
                          ? () => handleRemoveParticipant(p.id)
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>

              {/* Start Button */}
              <Button
                onClick={handleStart}
                disabled={!topic.trim() || participants.length === 0}
                className="w-full gap-2"
                size="lg"
              >
                <Play className="size-4" />
                开始讨论
              </Button>
            </div>
          </div>
        ) : (
          /* Discussion View */
          <>
            {/* Discussion topic bar */}
            <div className="shrink-0 border-b px-4 py-2.5 bg-muted/30">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="shrink-0 text-xs gap-1">
                  🎯 主题
                </Badge>
                <p className="text-sm text-foreground truncate">{topic}</p>
                <div className="shrink-0 flex items-center gap-1 ml-auto">
                  {participants.map((p) => {
                    const colors = getColorClasses(p.color);
                    const isActive = currentSpeaker?.agentId === p.id;
                    return (
                      <Tooltip key={p.id}>
                        <TooltipTrigger asChild>
                          <span
                            className={`inline-block text-base transition-transform ${
                              isActive ? 'scale-125' : 'opacity-50 hover:opacity-80'
                            }`}
                          >
                            {p.avatar}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          {p.name}
                          {isActive && ' (发言中...)'}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-4"
            >
              <div className="max-w-3xl mx-auto space-y-4">
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
                <div className="h-1" />
              </div>
            </div>

            {/* Bottom Controls */}
            <div className="shrink-0 border-t bg-background px-4 py-3">
              {/* Action buttons */}
              <div className="flex items-center gap-2 mb-2">
                {!isStreaming && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-8 text-xs"
                      onClick={handleContinue}
                    >
                      <SkipForward className="size-3.5" />
                      下一位发言
                    </Button>
                    <div className="flex-1" />
                  </>
                )}
                {isStreaming && (
                  <>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-1.5 h-8 text-xs"
                      onClick={handleStop}
                    >
                      <Square className="size-3" />
                      停止
                    </Button>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" />
                      {currentSpeaker?.name} 正在发言...
                    </div>
                    <div className="flex-1" />
                  </>
                )}
              </div>

              {/* User input */}
              <div className="flex gap-2">
                <Textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleUserSend();
                    }
                  }}
                  placeholder="输入你的观点，参与讨论... (Enter 发送)"
                  className="min-h-[40px] max-h-[120px] resize-none text-sm flex-1"
                  disabled={isStreaming}
                />
                <Button
                  onClick={handleUserSend}
                  disabled={!inputValue.trim() || isStreaming}
                  size="icon"
                  className="shrink-0 size-10"
                >
                  <Send className="size-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
