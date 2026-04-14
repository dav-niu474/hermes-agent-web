'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from 'next-themes';
import {
  MessageSquare,
  LayoutDashboard,
  Wrench,
  Zap,
  Brain,
  Settings,
  Clock,
  Sun,
  Moon,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  MessageSquarePlus,
  MoreHorizontal,
  Trash2,
  Loader2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAppStore, type SidebarView, type ThemeStyle } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Navigation items definition                                        */
/* ------------------------------------------------------------------ */
interface NavItem {
  id: SidebarView;
  label: string;
  icon: React.ElementType;
  emoji: string;
}

const navItems: NavItem[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare, emoji: '💬' },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, emoji: '📊' },
  { id: 'tools', label: 'Tools', icon: Wrench, emoji: '🔧' },
  { id: 'skills', label: 'Skills', icon: Zap, emoji: '⚡' },
  { id: 'memory', label: 'Memory', icon: Brain, emoji: '🧠' },
  { id: 'settings', label: 'Settings', icon: Settings, emoji: '⚙️' },
  { id: 'cronjobs', label: 'Cron Jobs', icon: Clock, emoji: '⏰' },
];

/* ------------------------------------------------------------------ */
/*  Theme style options                                                */
/* ------------------------------------------------------------------ */
const themeStyles: { id: ThemeStyle; color: string; ring: string }[] = [
  { id: 'default', color: 'bg-zinc-400', ring: 'ring-zinc-400/50' },
  { id: 'emerald', color: 'bg-emerald-500', ring: 'ring-emerald-500/50' },
  { id: 'rose', color: 'bg-rose-500', ring: 'ring-rose-500/50' },
  { id: 'ocean', color: 'bg-sky-500', ring: 'ring-sky-500/50' },
];

/* ------------------------------------------------------------------ */
/*  Hermes Logo Orb                                                    */
/* ------------------------------------------------------------------ */
function HermesLogo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex items-center justify-center shrink-0">
        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
          {/* Winged helmet SVG */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="w-5 h-5 text-primary-foreground"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3C8 3 5 6 4.5 10L4 13H20L19.5 10C19 6 16 3 12 3Z" />
            <path d="M3 13C3 13 4 15 12 15C20 15 21 13 21 13" />
            <path d="M4.5 10L2 8.5C1.5 8 1 8.5 1.5 9L4.5 12" />
            <path d="M19.5 10L22 8.5C22.5 8 23 8.5 22.5 9L19.5 12" />
          </svg>
        </div>
      </div>
      {!collapsed && (
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-tight text-foreground leading-none">
            Hermes
          </span>
          <span className="text-[10px] font-medium text-muted-foreground/70 leading-none mt-0.5">
            AI Agent Platform
          </span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Status Indicator                                                   */
/* ------------------------------------------------------------------ */
function StatusIndicator({ collapsed }: { collapsed?: boolean }) {
  const agentStatus = useAppStore((s) => s.agentStatus);

  const statusConfig = {
    connected: {
      color: 'bg-emerald-500',
      textColor: 'text-emerald-500',
      glow: 'shadow-emerald-500/50',
      label: 'Connected',
    },
    disconnected: {
      color: 'bg-zinc-400',
      textColor: 'text-zinc-400',
      glow: '',
      label: 'Disconnected',
    },
    error: {
      color: 'bg-red-500',
      textColor: 'text-red-500',
      glow: 'shadow-red-500/50',
      label: 'Error',
    },
  };

  const config = statusConfig[agentStatus];

  return (
    <div className="flex items-center gap-2.5 px-2">
      <div className="relative flex items-center justify-center shrink-0">
        <div
          className={cn(
            'w-2 h-2 rounded-full',
            config.color,
            agentStatus === 'connected' && `pulse-glow ${config.glow}`,
            agentStatus === 'error' && `pulse-glow ${config.glow}`,
          )}
        />
      </div>
      {!collapsed && (
        <span className={cn('text-xs font-medium', config.textColor)}>
          {config.label}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Theme Switcher                                                     */
/* ------------------------------------------------------------------ */
function ThemeStyleSwitcher({ collapsed }: { collapsed?: boolean }) {
  const themeStyle = useAppStore((s) => s.themeStyle);
  const setThemeStyle = useAppStore((s) => s.setThemeStyle);

  if (collapsed) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 px-2">
      {themeStyles.map((t) => (
        <button
          key={t.id}
          onClick={() => setThemeStyle(t.id)}
          className={cn(
            'w-4 h-4 rounded-full transition-all duration-200',
            t.color,
            themeStyle === t.id
              ? `ring-2 ${t.ring} scale-110`
              : 'opacity-50 hover:opacity-80 hover:scale-105',
          )}
          aria-label={`Switch to ${t.id} theme`}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dark/Light Toggle                                                  */
/* ------------------------------------------------------------------ */
function DarkModeToggle({ collapsed }: { collapsed?: boolean }) {
  const { theme, setTheme } = useTheme();

  const isDark = theme === 'dark';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size={collapsed ? 'icon' : 'sm'}
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className={cn(
            'h-8 w-full gap-2 px-2 text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-lg transition-colors',
            collapsed && 'w-8 justify-center',
          )}
        >
          {isDark ? (
            <Sun className="size-4 shrink-0" />
          ) : (
            <Moon className="size-4 shrink-0" />
          )}
          {!collapsed && (
            <span className="text-xs font-medium truncate">
              {isDark ? 'Light Mode' : 'Dark Mode'}
            </span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      </TooltipContent>
    </Tooltip>
  );
}

/* ------------------------------------------------------------------ */
/*  Navigation Item                                                    */
/* ------------------------------------------------------------------ */
function SidebarNavItem({
  item,
  isActive,
  collapsed,
  onSelect,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
  onSelect: (id: SidebarView) => void;
}) {
  const Icon = item.icon;

  const button = (
    <button
      onClick={() => onSelect(item.id)}
      className={cn(
        'group relative flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
        collapsed ? 'justify-center px-0' : '',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
      )}
    >
      <Icon
        className={cn(
          'size-[18px] shrink-0',
          isActive
            ? 'text-primary'
            : 'text-muted-foreground group-hover:text-foreground',
        )}
      />
      {!collapsed && (
        <span className="truncate">{item.label}</span>
      )}
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
}

/* ------------------------------------------------------------------ */
/*  Chat History Section (New Chat button + Recent Sessions list)       */
/* ------------------------------------------------------------------ */
function ChatHistorySection({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: (id: SidebarView) => void;
}) {
  const [sessions, setSessions] = useState<Array<{
    id: string;
    title: string;
    updatedAt: string;
    model?: string;
  }>>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);

  const currentView = useAppStore((s) => s.currentView);
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const setCurrentSessionId = useAppStore((s) => s.setCurrentSessionId);
  const clearMessages = useAppStore((s) => s.clearMessages);
  const addChatMessage = useAppStore((s) => s.addChatMessage);
  const setSelectedModel = useAppStore((s) => s.setSelectedModel);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      const list = (Array.isArray(data) ? data : []).slice(0, 8);
      setSessions(list.map((s: any) => ({
        id: s.id,
        title: s.title || 'New Chat',
        updatedAt: s.updatedAt,
        model: s.model,
      })));
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // Refresh sessions when switching to chat view
  useEffect(() => {
    if (currentView === 'chat') fetchSessions();
  }, [currentView, fetchSessions]);

  // Listen for custom event to refresh sessions
  useEffect(() => {
    const handler = () => fetchSessions();
    window.addEventListener('hermes:refresh-sessions', handler);
    return () => window.removeEventListener('hermes:refresh-sessions', handler);
  }, [fetchSessions]);

  const handleNewChat = () => {
    clearMessages();
    setCurrentSessionId(null);
    if (currentView !== 'chat') {
      setCurrentView('chat');
    }
    onNavigate?.('chat');
  };

  const handleSelectSession = async (id: string) => {
    if (loadingSession || id === currentSessionId) {
      if (currentView !== 'chat') {
        setCurrentView('chat');
        onNavigate?.('chat');
      }
      return;
    }
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

      if (currentView !== 'chat') {
        setCurrentView('chat');
      }
      onNavigate?.('chat');
    } catch (err) {
      console.error('Failed to load session:', err);
    } finally {
      setLoadingSession(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/sessions/${deleteTarget.id}`, { method: 'DELETE' });
      toast.success('Session deleted');
      fetchSessions();
      if (currentSessionId === deleteTarget.id) {
        clearMessages();
        setCurrentSessionId(null);
      }
    } catch {
      toast.error('Failed to delete');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  if (collapsed) {
    return (
      <div className="py-2 px-2 flex flex-col items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 rounded-lg" onClick={handleNewChat}>
              <MessageSquarePlus className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>New Chat</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="flex flex-col max-h-[40vh] min-h-0">
      {/* Section Label */}
      <div className="px-3 pt-3 pb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">Recent Chats</span>
      </div>
      {/* New Chat Button */}
      <div className="px-2 pb-1">
        <Button
          onClick={handleNewChat}
          variant="outline"
          className={cn(
            'w-full gap-2 h-8 text-xs justify-start font-medium rounded-lg',
            'border-dashed border-primary/30 hover:border-primary/50 hover:bg-primary/5',
            'transition-all duration-200 group/newchat',
          )}
        >
          <Plus className="size-3.5 text-primary/70 group-hover/newchat:text-primary transition-colors" />
          <span className="text-muted-foreground group-hover/newchat:text-foreground transition-colors">New Chat</span>
        </Button>
      </div>

      {/* Recent Sessions */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-1.5 pb-1 space-y-0.5 min-h-0">
        {sessions.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/50 text-center py-3 px-2">
            No sessions yet
          </p>
        ) : (
          <AnimatePresence>
            {sessions.map((session) => {
              const isActive = currentSessionId === session.id;
              const timeAgo = formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true });
              return (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => handleSelectSession(session.id)}
                  className={cn(
                    'group flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                    loadingSession && 'pointer-events-none opacity-60'
                  )}
                >
                  {loadingSession && isActive && (
                    <Loader2 className="size-3 animate-spin shrink-0 text-muted-foreground" />
                  )}
                  <span className="flex-1 min-w-0 text-[11px] font-medium truncate leading-tight">
                    {session.title}
                  </span>
                  <span className="text-[9px] text-muted-foreground/40 shrink-0 hidden group-hover:block">
                    {timeAgo}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-4 opacity-0 group-hover:opacity-100 shrink-0 text-muted-foreground hover:text-destructive rounded"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="size-2.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-28">
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
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Delete session?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              &quot;{deleteTarget?.title}&quot; will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs h-7" onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="text-xs h-7 bg-destructive hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sidebar Content (shared between desktop & mobile)                  */
/* ------------------------------------------------------------------ */
function SidebarContent({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: (id: SidebarView) => void;
}) {
  const currentView = useAppStore((s) => s.currentView);
  const setCurrentView = useAppStore((s) => s.setCurrentView);

  const handleSelect = (id: SidebarView) => {
    setCurrentView(id);
    onNavigate?.(id);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Brand header */}
      <div className={cn('flex items-center h-14 px-3 shrink-0', collapsed && 'justify-center')}>
        <HermesLogo collapsed={collapsed} />
      </div>

      <Separator className="opacity-50" />

      {/* Navigation + Chat History (scrollable as one unit) */}
      <nav className="flex-1 overflow-y-auto custom-scrollbar py-2 px-2 space-y-0.5 flex flex-col">
        {/* Navigation section */}
        <div className="space-y-0.5">
          {navItems.map((item) => (
            <SidebarNavItem
              key={item.id}
              item={item}
              isActive={currentView === item.id}
              collapsed={collapsed}
              onSelect={handleSelect}
            />
          ))}
        </div>

        {/* Chat History — New Chat + Recent Sessions, directly below Cron Jobs */}
        <div className="pt-2">
          <Separator className="opacity-30 mb-2" />
          <ChatHistorySection collapsed={collapsed} onNavigate={onNavigate} />
        </div>
      </nav>

      <Separator className="opacity-30" />

      {/* Bottom section with subtle background */}
      <div className="shrink-0 py-3 px-2 space-y-2.5 bg-gradient-to-t from-muted/30 to-transparent">
        {/* Agent Status */}
        <StatusIndicator collapsed={collapsed} />

        {/* Theme Style Switcher */}
        <ThemeStyleSwitcher collapsed={collapsed} />

        {/* Dark Mode Toggle */}
        <DarkModeToggle collapsed={collapsed} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Sidebar Component                                             */
/* ------------------------------------------------------------------ */
export function Sidebar() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);

  /* Sync data-theme attribute on mount */
  useEffect(() => {
    const style = useAppStore.getState().themeStyle;
    document.documentElement.setAttribute('data-theme', style);
  }, []);

  const collapsed = !sidebarOpen;

  return (
    <>
      {/* Mobile sidebar via Sheet */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center h-14 px-4 bg-background/80 backdrop-blur-md border-b border-border">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 bg-sidebar border-r border-border">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarContent
              onNavigate={() => setSidebarOpen(false)}
            />
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2 ml-3">
          <HermesLogo collapsed={false} />
        </div>
      </div>

      {/* Desktop sidebar */}
      <motion.aside
        className="hidden md:flex flex-col h-screen sticky top-0 border-r border-border/50 bg-sidebar overflow-hidden shrink-0"
        animate={{ width: collapsed ? 56 : 240 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <SidebarContent collapsed={collapsed} />

        {/* Collapse toggle button */}
        <div className="absolute top-3.5 right-2 z-10">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className={cn(
                  'h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors',
                  collapsed && 'absolute -right-1 top-0',
                )}
              >
                {collapsed ? (
                  <PanelLeftOpen className="size-3.5" />
                ) : (
                  <PanelLeftClose className="size-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            </TooltipContent>
          </Tooltip>
        </div>
      </motion.aside>
    </>
  );
}
