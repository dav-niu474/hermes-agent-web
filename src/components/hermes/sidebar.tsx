'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from 'next-themes';
import {
  MessageSquare,
  LayoutDashboard,
  Wrench,
  Zap,
  History,
  Brain,
  Settings,
  Clock,
  Sun,
  Moon,
  Menu,
  PanelLeftClose,
} from 'lucide-react';
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
  { id: 'sessions', label: 'Sessions', icon: History, emoji: '📋' },
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
      <motion.div
        className="relative flex items-center justify-center shrink-0"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {/* Outer glow ring */}
        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/20 via-primary/5 to-transparent blur-sm" />
        {/* Main orb */}
        <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-primary/90 to-primary flex items-center justify-center shadow-lg shadow-primary/20">
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
            {/* Helmet dome */}
            <path d="M12 3C8 3 5 6 4.5 10L4 13H20L19.5 10C19 6 16 3 12 3Z" />
            {/* Helmet brim */}
            <path d="M3 13C3 13 4 15 12 15C20 15 21 13 21 13" />
            {/* Left wing */}
            <path d="M4.5 10L2 8.5C1.5 8 1 8.5 1.5 9L4.5 12" />
            {/* Right wing */}
            <path d="M19.5 10L22 8.5C22.5 8 23 8.5 22.5 9L19.5 12" />
          </svg>
        </div>
      </motion.div>
      {!collapsed && (
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, delay: 0.05 }}
          className="flex flex-col"
        >
          <span className="text-sm font-bold tracking-tight text-foreground leading-none">
            Hermes
          </span>
          <span className="text-[10px] font-medium text-muted-foreground leading-none mt-0.5">
            AI Agent Platform
          </span>
        </motion.div>
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
            'w-4 h-4 rounded-full transition-all duration-150',
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
            'h-8 w-full gap-2 px-2 text-muted-foreground hover:text-foreground',
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
    <motion.button
      onClick={() => onSelect(item.id)}
      className={cn(
        'group relative flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
        collapsed ? 'justify-center px-0' : '',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
      )}
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {/* Active indicator bar */}
      {isActive && (
        <motion.div
          layoutId="sidebar-active-indicator"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-full"
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />
      )}

      <Icon
        className={cn(
          'size-[18px] shrink-0 transition-colors',
          isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
        )}
      />
      {!collapsed && (
        <span className="truncate">{item.label}</span>
      )}
    </motion.button>
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

      <Separator />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto custom-scrollbar py-2 px-2 space-y-0.5">
        {navItems.map((item) => (
          <SidebarNavItem
            key={item.id}
            item={item}
            isActive={currentView === item.id}
            collapsed={collapsed}
            onSelect={handleSelect}
          />
        ))}
      </nav>

      <Separator />

      {/* Bottom section */}
      <div className="shrink-0 py-3 px-2 space-y-3">
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
        className="hidden md:flex flex-col h-screen sticky top-0 border-r border-border bg-sidebar/80 backdrop-blur-sm overflow-hidden shrink-0"
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
                  'h-7 w-7 rounded-md text-muted-foreground hover:text-foreground',
                  collapsed && 'absolute -right-1 top-0',
                )}
              >
                <PanelLeftClose className="size-3.5" />
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
