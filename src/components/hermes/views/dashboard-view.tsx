'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Wifi,
  WifiOff,
  AlertTriangle,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Wrench,
  Zap,
  Brain,
  Settings,
  Clock,
  ArrowRight,
  BarChart3,
  Cpu,
  HardDrive,
  Layers,
  Sparkles,
  Inbox,
  CircleDot,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';

/* ═══════════════════════════════════════════
   API TYPES
   ═══════════════════════════════════════════ */

interface ApiStats {
  totalSessions: number;
  totalMessages: number;
  totalTokens: number;
  sessionsToday: number;
  messagesToday: number;
  recentSessions: {
    id: string;
    title: string;
    model: string;
    messageCount: number;
    updatedAt: string;
    createdAt: string;
  }[];
}

/* ═══════════════════════════════════════════
   ANIMATION UTILITIES
   ═══════════════════════════════════════════ */

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 24 },
  },
};

/** Animated counter hook */
function useCountUp(target: number, duration = 1200, enabled = true) {
  const [value, setValue] = useState(enabled ? 0 : target);
  const prevEnabled = useRef(enabled);
  useEffect(() => {
    if (!enabled) {
      if (prevEnabled.current !== enabled) {
        const id = requestAnimationFrame(() => setValue(target));
        prevEnabled.current = enabled;
        return () => cancelAnimationFrame(id);
      }
      prevEnabled.current = enabled;
      return;
    }
    prevEnabled.current = enabled;
    const startTime = performance.now();
    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [target, duration, enabled]);
  return value;
}

/** Format a date string to relative time */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
  if (diffDay === 1) return 'Yesterday';
  return `${diffDay} days ago`;
}

/* ═══════════════════════════════════════════
   LOADING SKELETON
   ═══════════════════════════════════════════ */

function SkeletonCard() {
  return (
    <Card className="h-full">
      <CardContent className="p-5">
        <div className="space-y-3 animate-pulse">
          <div className="h-4 bg-muted rounded w-24" />
          <div className="h-8 bg-muted rounded w-16" />
          <div className="h-5 bg-muted rounded w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════
   CIRCULAR PROGRESS
   ═══════════════════════════════════════════ */

function CircularProgress({
  value,
  max,
  label,
  sublabel,
  color,
  icon: Icon,
  delay = 0,
}: {
  value: number;
  max: number;
  label: string;
  sublabel: string;
  color: string;
  icon: React.ElementType;
  delay?: number;
}) {
  const [animatedValue, setAnimatedValue] = useState(0);
  const pct = Math.round((value / max) * 100);

  useEffect(() => {
    const timer = setTimeout(() => {
      let start = 0;
      const startTime = performance.now();
      function tick(now: number) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / 1000, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setAnimatedValue(Math.round(eased * pct));
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }, delay);
    return () => clearTimeout(timer);
  }, [pct, delay]);

  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animatedValue / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-muted/50"
          />
          <motion.circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, delay: delay / 1000, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon className="w-5 h-5 text-muted-foreground" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold">{animatedValue}%</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-[10px] text-muted-foreground/70">{sublabel}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   STAT CARDS
   ═══════════════════════════════════════════ */

function StatusDot({ status }: { status: 'connected' | 'disconnected' | 'error' }) {
  const colors = {
    connected: 'bg-emerald-500 text-emerald-500',
    disconnected: 'bg-muted-foreground text-muted-foreground',
    error: 'bg-destructive text-destructive',
  };
  return (
    <span
      className={cn(
        'relative flex h-3 w-3',
        status === 'connected' && 'pulse-glow'
      )}
    >
      <span
        className={cn(
          'inline-flex h-full w-full rounded-full',
          colors[status].split(' ')[0]
        )}
      />
    </span>
  );
}

function AgentStatusCard() {
  const agentStatus = useAppStore((s) => s.agentStatus);

  const config = {
    connected: {
      label: 'Connected',
      icon: Wifi,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-100 dark:bg-emerald-500/15',
      badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400',
    },
    disconnected: {
      label: 'Disconnected',
      icon: WifiOff,
      color: 'text-muted-foreground',
      bg: 'bg-muted',
      badgeClass: 'border-border bg-muted text-muted-foreground',
    },
    error: {
      label: 'Error',
      icon: AlertTriangle,
      color: 'text-destructive',
      bg: 'bg-destructive/10',
      badgeClass: 'border-destructive/30 bg-destructive/10 text-destructive',
    },
  }[agentStatus];

  const Icon = config.icon;

  return (
    <motion.div
      variants={itemVariants} whileHover={{ y: -2, transition: { duration: 0.2 } }}>
      <Card className="h-full hover:shadow-lg hover:shadow-primary/[0.04] transition-all duration-300 border-border/50">
        <CardContent className="p-5 flex items-start justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Agent Status</span>
              <StatusDot status={agentStatus} />
            </div>
            <Badge variant="outline" className={cn('text-sm px-3 py-1', config.badgeClass)}>
              {config.label}
            </Badge>
            <p className="text-xs text-muted-foreground">
              {agentStatus === 'connected'
                ? 'Hermes agent is active and ready'
                : agentStatus === 'error'
                  ? 'Connection issue detected'
                  : 'Agent is not connected'}
            </p>
          </div>
          <div className={cn('p-2.5 rounded-xl', config.bg)}>
            <Icon className={cn('w-5 h-5', config.color)} />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function TotalSessionsCard({ total, todayCount, loading }: { total: number; todayCount: number; loading: boolean }) {
  const displayTotal = useCountUp(total, 1200, !loading);

  return (
    <motion.div variants={itemVariants} whileHover={{ y: -2, transition: { duration: 0.2 } }}>
      <Card className="h-full hover:shadow-lg hover:shadow-primary/[0.04] transition-all duration-300 border-border/50">
        <CardContent className="p-5 flex items-start justify-between">
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Total Sessions</p>
            <div className="flex items-baseline gap-2">
              {loading ? (
                <div className="h-8 w-12 bg-muted rounded animate-pulse" />
              ) : (
                <span className="text-3xl font-bold tracking-tight">{displayTotal}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="text-xs gap-1">
                <TrendingUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                +{todayCount} today
              </Badge>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-chart-4/15">
            <MessageSquare className="w-5 h-5 text-chart-4" />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function MessagesTodayCard({ total, loading }: { total: number; loading: boolean }) {
  const displayTotal = useCountUp(total, 1200, !loading);

  return (
    <motion.div variants={itemVariants} whileHover={{ y: -2, transition: { duration: 0.2 } }}>
      <Card className="h-full hover:shadow-lg hover:shadow-primary/[0.04] transition-all duration-300 border-border/50">
        <CardContent className="p-5 flex items-start justify-between">
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Total Messages</p>
            <div className="flex items-baseline gap-2">
              {loading ? (
                <div className="h-8 w-12 bg-muted rounded animate-pulse" />
              ) : (
                <span className="text-3xl font-bold tracking-tight">{displayTotal}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Across all sessions</span>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-chart-1/15">
            <Activity className="w-5 h-5 text-chart-1" />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function TokensUsedCard({ total, loading }: { total: number; loading: boolean }) {
  const displayTotal = useCountUp(total, 1200, !loading);
  const formatted = total >= 1000000
    ? `${(total / 1000000).toFixed(1)}M`
    : total >= 1000
      ? `${(total / 1000).toFixed(1)}k`
      : String(total);

  return (
    <motion.div variants={itemVariants} whileHover={{ y: -2, transition: { duration: 0.2 } }}>
      <Card className="h-full hover:shadow-lg hover:shadow-primary/[0.04] transition-all duration-300 border-border/50">
        <CardContent className="p-5 flex items-start justify-between">
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Tokens Used</p>
            <div className="flex items-baseline gap-2">
              {loading ? (
                <div className="h-8 w-12 bg-muted rounded animate-pulse" />
              ) : (
                <>
                  <span className="text-3xl font-bold tracking-tight">{displayTotal >= 1000 ? formatted : displayTotal}</span>
                  {total < 1000 && <span className="text-sm text-muted-foreground">tokens</span>}
                </>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Cumulative usage</span>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-chart-2/15">
            <Wrench className="w-5 h-5 text-chart-2" />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   ACTIVITY CHART — Placeholder (no historical tracking)
   ═══════════════════════════════════════════ */

function ActivityChartCard() {
  return (
    <motion.div variants={itemVariants}>
      <Card className="h-full hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-chart-1" />
                Message Activity
              </CardTitle>
              <CardDescription>Messages sent over the last 7 days</CardDescription>
            </div>
            <Badge variant="outline" className="text-xs">
              Last 7 days
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="h-[220px] flex flex-col items-center justify-center text-center">
            <div className="p-3 rounded-full bg-muted/50 mb-3">
              <BarChart3 className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Historical chart data</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Daily activity tracking will appear here as you use the agent over time.
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   SYSTEM RESOURCES PANEL
   ═══════════════════════════════════════════ */

function SystemResourcesCard() {
  const resources = [
    {
      value: 45000,
      max: 200000,
      label: 'Context Window',
      sublabel: '45k / 200k tokens',
      color: 'hsl(var(--chart-1))',
      icon: Layers,
      barColor: 'bg-chart-1',
    },
    {
      value: 128,
      max: 512,
      label: 'Memory Storage',
      sublabel: '128 / 512 MB',
      color: 'hsl(var(--chart-4))',
      icon: HardDrive,
      barColor: 'bg-chart-4',
    },
    {
      value: 12,
      max: 20,
      label: 'Active Skills',
      sublabel: '12 / 20 loaded',
      color: 'hsl(var(--chart-2))',
      icon: Zap,
      barColor: 'bg-chart-2',
    },
  ];

  return (
    <motion.div variants={itemVariants}>
      <Card className="h-full hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="w-4 h-4 text-chart-2" />
                System Resources
              </CardTitle>
              <CardDescription>Current agent resource utilization</CardDescription>
            </div>
            <Badge variant="outline" className="text-xs">
              Live
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {resources.map((res, i) => (
            <div key={res.label} className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <res.icon className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">{res.label}</span>
                </div>
                <span className="text-xs text-muted-foreground">{res.sublabel}</span>
              </div>
              <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className={cn('absolute inset-y-0 left-0 rounded-full', res.barColor)}
                  initial={{ width: 0 }}
                  animate={{ width: `${(res.value / res.max) * 100}%` }}
                  transition={{ duration: 1, delay: 0.3 + i * 0.15, ease: 'easeOut' }}
                />
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-muted-foreground">{Math.round((res.value / res.max) * 100)}% used</span>
                <span className="text-[10px] text-muted-foreground">{res.max - res.value} available</span>
              </div>
            </div>
          ))}

          {/* Circular progress summary */}
          <div className="pt-4 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground mb-4">Overall Health</p>
            <div className="flex justify-around">
              <CircularProgress
                value={45000}
                max={200000}
                label="Context"
                sublabel="45k tokens"
                color="hsl(var(--chart-1))"
                icon={Layers}
                delay={200}
              />
              <CircularProgress
                value={128}
                max={512}
                label="Memory"
                sublabel="128 MB"
                color="hsl(var(--chart-4))"
                icon={HardDrive}
                delay={400}
              />
              <CircularProgress
                value={12}
                max={20}
                label="Skills"
                sublabel="12 active"
                color="hsl(var(--chart-2))"
                icon={Zap}
                delay={600}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   RECENT SESSIONS TABLE
   ═══════════════════════════════════════════ */

function RecentSessionsTable({ sessions, loading, onRefresh }: { sessions: ApiStats['recentSessions']; loading: boolean; onRefresh: () => void }) {
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const setCurrentSessionId = useAppStore((s) => s.setCurrentSessionId);
  const hasSessions = sessions.length > 0;

  return (
    <motion.div variants={itemVariants}>
      <Card className="h-full hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Inbox className="w-4 h-4 text-chart-3" />
                Recent Sessions
              </CardTitle>
              <CardDescription>Your latest conversation sessions</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRefresh} disabled={loading}>
                    <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh</TooltipContent>
              </Tooltip>
              {hasSessions && (
                <button
                  onClick={() => setCurrentView('sessions')}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  View all <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="max-h-96 overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="animate-pulse flex items-center gap-4 px-6">
                    <div className="h-4 bg-muted rounded flex-1" />
                    <div className="h-5 bg-muted rounded w-16" />
                    <div className="h-4 bg-muted rounded w-8" />
                    <div className="h-5 bg-muted rounded w-20" />
                  </div>
                ))}
              </div>
            ) : !hasSessions ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                <div className="p-3 rounded-full bg-muted/50 mb-3">
                  <MessageSquare className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No sessions yet</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Start a chat to see your sessions here
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Title</TableHead>
                    <TableHead className="hidden sm:table-cell">Model</TableHead>
                    <TableHead className="hidden md:table-cell">Messages</TableHead>
                    <TableHead className="hidden lg:table-cell">Last Active</TableHead>
                    <TableHead className="pr-6">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.slice(0, 8).map((session) => (
                    <TableRow
                      key={session.id}
                      className="cursor-pointer"
                      onClick={() => {
                        setCurrentSessionId(session.id);
                        setCurrentView('chat');
                      }}
                    >
                      <TableCell className="pl-6">
                        <div className="flex items-center gap-2 max-w-[200px]">
                          <MessageSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate font-medium text-sm">
                            {session.title}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="secondary" className="text-xs font-normal">
                          {session.model}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-sm text-muted-foreground">{session.messageCount}</span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-sm text-muted-foreground">{formatRelativeTime(session.updatedAt)}</span>
                      </TableCell>
                      <TableCell className="pr-6">
                        <Badge
                          variant="outline"
                          className="text-xs border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400"
                        >
                          <CircleDot className="w-2.5 h-2.5" />
                          active
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   QUICK ACTIONS
   ═══════════════════════════════════════════ */

const quickActions = [
  {
    label: 'New Chat',
    description: 'Start a conversation',
    icon: MessageSquare,
    view: 'chat' as const,
    color: 'text-chart-1',
    bg: 'bg-chart-1/10',
  },
  {
    label: 'Browse Tools',
    description: 'Explore available tools',
    icon: Wrench,
    view: 'tools' as const,
    color: 'text-chart-2',
    bg: 'bg-chart-2/10',
  },
  {
    label: 'Manage Skills',
    description: 'Configure agent skills',
    icon: Zap,
    view: 'skills' as const,
    color: 'text-chart-4',
    bg: 'bg-chart-4/10',
  },
  {
    label: 'View Memory',
    description: 'Agent knowledge base',
    icon: Brain,
    view: 'memory' as const,
    color: 'text-chart-3',
    bg: 'bg-chart-3/10',
  },
  {
    label: 'Settings',
    description: 'Agent configuration',
    icon: Settings,
    view: 'settings' as const,
    color: 'text-muted-foreground',
    bg: 'bg-muted',
  },
  {
    label: 'Schedule Task',
    description: 'Set up cron jobs',
    icon: Clock,
    view: 'cronjobs' as const,
    color: 'text-chart-5',
    bg: 'bg-chart-5/10',
  },
];

function QuickActionsGrid() {
  const setCurrentView = useAppStore((s) => s.setCurrentView);

  return (
    <motion.div variants={itemVariants}>
      <Card className="h-full hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-chart-5" />
              Quick Actions
            </CardTitle>
            <CardDescription>Jump to common tasks</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {quickActions.map((action, i) => (
              <motion.button
                key={action.view}
                onClick={() => setCurrentView(action.view)}
                className={cn(
                  'group flex flex-col items-center gap-2.5 p-4 rounded-xl border border-border/50',
                  'bg-card hover:bg-accent/50 transition-all duration-200',
                  'hover:border-border hover:shadow-sm'
                )}
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.06, duration: 0.3 }}
              >
                <div className={cn('p-2.5 rounded-xl transition-colors group-hover:scale-110', action.bg)}>
                  <action.icon className={cn('w-5 h-5 transition-colors', action.color)} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">{action.label}</p>
                  <p className="text-[11px] text-muted-foreground">{action.description}</p>
                </div>
              </motion.button>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   EMPTY STATE
   ═══════════════════════════════════════════ */

function EmptyDashboard() {
  const setCurrentView = useAppStore((s) => s.setCurrentView);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-20 px-4 relative overflow-hidden"
    >
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute w-[400px] h-[400px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-primary/[0.04] to-transparent blur-3xl" />
      </div>
      <motion.div
        className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-muted/80 to-muted/40 flex items-center justify-center mb-6 shadow-sm"
        animate={{ rotate: [0, 5, -5, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Activity className="w-9 h-9 text-muted-foreground/70" />
      </motion.div>
      <h3 className="text-lg font-semibold mb-2 relative z-10">Welcome to Hermes Dashboard</h3>
      <p className="text-sm text-muted-foreground text-center max-w-sm mb-8 relative z-10">
        Your mission control center is ready. Start chatting with your agent to see real-time stats, activity charts, and session history appear here.
      </p>
      <motion.button
        onClick={() => setCurrentView('chat')}
        className="relative inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
      >
        <MessageSquare className="w-4 h-4" />
        Start Your First Chat
      </motion.button>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   TOKEN USAGE CHART — Placeholder (no historical tracking)
   ═══════════════════════════════════════════ */

function TokenUsageMiniChart({ totalTokens }: { totalTokens: number }) {
  const formatted = totalTokens >= 1000000
    ? `${(totalTokens / 1000000).toFixed(1)}M`
    : totalTokens >= 1000
      ? `${(totalTokens / 1000).toFixed(1)}k`
      : String(totalTokens);

  return (
    <motion.div variants={itemVariants}>
      <Card className="hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4 text-chart-4" />
                Token Usage
              </CardTitle>
              <CardDescription>Daily token consumption (7 days)</CardDescription>
            </div>
            <span className="text-xs text-muted-foreground font-medium">{formatted} total</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[160px] flex flex-col items-center justify-center text-center">
            <div className="p-3 rounded-full bg-muted/50 mb-3">
              <Activity className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Historical token usage</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Daily breakdown will appear here as you use the agent.
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   MAIN DASHBOARD VIEW
   ═══════════════════════════════════════════ */

export function DashboardView() {
  const agentStatus = useAppStore((s) => s.agentStatus);
  const [stats, setStats] = useState<ApiStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stats');
      if (!res.ok) throw new Error('Failed to fetch stats');
      const data: ApiStats = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch dashboard stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Show empty state when agent is disconnected and no sessions
  if (!loading && !error && (!stats || (stats.totalSessions === 0 && agentStatus === 'disconnected'))) {
    return <EmptyDashboard />;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
    <div className="flex-1 overflow-y-auto custom-scrollbar">
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto w-full">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 md:mb-8"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitor your agent&apos;s performance, usage, and system health at a glance.
            </p>
          </div>
          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </motion.div>

      <motion.div
        className="space-y-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* ─── Top Row: Stat Cards ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <AgentStatusCard />
          <TotalSessionsCard
            total={stats?.totalSessions ?? 0}
            todayCount={stats?.sessionsToday ?? 0}
            loading={loading}
          />
          <MessagesTodayCard
            total={stats?.totalMessages ?? 0}
            loading={loading}
          />
          <TokensUsedCard
            total={stats?.totalTokens ?? 0}
            loading={loading}
          />
        </div>

        {/* ─── Middle Row: Charts ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ActivityChartCard />
          <SystemResourcesCard />
        </div>

        {/* ─── Token usage mini chart ─── */}
        <TokenUsageMiniChart totalTokens={stats?.totalTokens ?? 0} />

        {/* ─── Bottom Row: Sessions + Quick Actions ─── */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <div className="xl:col-span-3">
            <RecentSessionsTable
              sessions={stats?.recentSessions ?? []}
              loading={loading}
              onRefresh={fetchStats}
            />
          </div>
          <div className="xl:col-span-2">
            <QuickActionsGrid />
          </div>
        </div>
      </motion.div>
    </div>
    </div>
    </div>
  );
}
