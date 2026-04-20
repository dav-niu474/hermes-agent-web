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
  PieChart,
  Gauge,
  Play,
  Bot,
  Hammer,
  DollarSign,
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
   INSIGHTS TYPES (matches the API response)
   ═══════════════════════════════════════════ */

interface InsightsOverview {
  totalSessions: number;
  totalMessages: number;
  totalToolCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  avgMessagesPerSession: number;
  dateRangeStart: string;
  dateRangeEnd: string;
  userMessages: number;
  assistantMessages: number;
  toolMessages: number;
}

interface ModelUsage {
  model: string;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  toolCalls: number;
}

interface ToolUsage {
  tool: string;
  count: number;
  percentage: number;
}

interface ActivityData {
  byDay: Array<{ day: string; count: number }>;
  byHour: Array<{ hour: number; count: number }>;
  busiestDay: string;
  busiestHour: number;
  activeDays: number;
}

interface TopSession {
  id: string;
  title: string | null;
  messageCount: number;
  model: string | null;
  createdAt: string;
}

interface InsightsReport {
  overview: InsightsOverview;
  models: ModelUsage[];
  tools: ToolUsage[];
  activity: ActivityData;
  topSessions: TopSession[];
  generatedAt: string;
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

/** Format number with K/M suffix */
function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Format date string 'YYYY-MM-DD' to short label */
function toShortDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

function toMonthDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
          <div className="w-10 h-10 rounded-full bg-background/80 flex items-center justify-center">
            <Icon className="w-5 h-5 text-muted-foreground" />
          </div>
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
      <Card className="h-full hover:shadow-xl hover:shadow-primary/[0.06] transition-all duration-300 border-border/50">
        <CardContent className="p-5 flex items-start justify-between hover:bg-gradient-to-br from-transparent to-primary/[0.02] transition-colors duration-300 rounded-lg">
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
          <div className={cn('p-3 rounded-xl', config.bg)}>
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
      <Card className="h-full hover:shadow-xl hover:shadow-primary/[0.06] transition-all duration-300 border-border/50">
        <CardContent className="p-5 flex items-start justify-between hover:bg-gradient-to-br from-transparent to-primary/[0.02] transition-colors duration-300 rounded-lg">
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Total Sessions</p>
            <div className="flex items-baseline gap-2">
              {loading ? (
                <div className="h-8 w-12 bg-muted rounded animate-pulse" />
              ) : (
                <span className="text-3xl font-bold tracking-tight tabular-nums">{displayTotal}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="text-xs gap-1">
                <TrendingUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                +{todayCount} today
              </Badge>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-chart-4/15">
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
      <Card className="h-full hover:shadow-xl hover:shadow-primary/[0.06] transition-all duration-300 border-border/50">
        <CardContent className="p-5 flex items-start justify-between hover:bg-gradient-to-br from-transparent to-primary/[0.02] transition-colors duration-300 rounded-lg">
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Total Messages</p>
            <div className="flex items-baseline gap-2">
              {loading ? (
                <div className="h-8 w-12 bg-muted rounded animate-pulse" />
              ) : (
                <span className="text-3xl font-bold tracking-tight tabular-nums">{displayTotal}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Across all sessions</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-chart-1/15">
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
      <Card className="h-full hover:shadow-xl hover:shadow-primary/[0.06] transition-all duration-300 border-border/50">
        <CardContent className="p-5 flex items-start justify-between hover:bg-gradient-to-br from-transparent to-primary/[0.02] transition-colors duration-300 rounded-lg">
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Tokens Used</p>
            <div className="flex items-baseline gap-2">
              {loading ? (
                <div className="h-8 w-12 bg-muted rounded animate-pulse" />
              ) : (
                <>
                  <span className="text-3xl font-bold tracking-tight tabular-nums">{displayTotal >= 1000 ? formatted : displayTotal}</span>
                  {total < 1000 && <span className="text-sm text-muted-foreground">tokens</span>}
                </>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Cumulative usage</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-chart-2/15">
            <Wrench className="w-5 h-5 text-chart-2" />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ToolCallsCard({ total, loading }: { total: number; loading: boolean }) {
  const displayTotal = useCountUp(total, 1200, !loading);

  return (
    <motion.div variants={itemVariants} whileHover={{ y: -2, transition: { duration: 0.2 } }}>
      <Card className="h-full hover:shadow-xl hover:shadow-primary/[0.06] transition-all duration-300 border-border/50">
        <CardContent className="p-5 flex items-start justify-between hover:bg-gradient-to-br from-transparent to-primary/[0.02] transition-colors duration-300 rounded-lg">
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Tool Calls</p>
            <div className="flex items-baseline gap-2">
              {loading ? (
                <div className="h-8 w-12 bg-muted rounded animate-pulse" />
              ) : (
                <span className="text-3xl font-bold tracking-tight tabular-nums">{displayTotal}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Agent tool invocations</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-chart-5/15">
            <Hammer className="w-5 h-5 text-chart-5" />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   ACTIVITY CHART — Real data driven
   ═══════════════════════════════════════════ */

function ActivityChartCard({ data, loading, days }: { data: ActivityData | null; loading: boolean; days: number }) {
  // Show last 14 days for the chart
  const chartDays = data?.byDay.slice(-14) ?? [];
  const maxCount = Math.max(...chartDays.map(d => d.count), 1);
  const chartWidth = Math.max(chartDays.length * 38, 280);
  const svgWidth = chartWidth + 20;

  if (loading) {
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
                <CardDescription>Loading activity data...</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="h-[220px] flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  if (!data || chartDays.length === 0) {
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
                <CardDescription>No activity data yet</CardDescription>
              </div>
              <Badge variant="outline" className="text-xs">
                {days} days
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="h-[220px] flex flex-col items-center justify-center">
              <div className="p-3 rounded-full bg-muted/50 mb-3">
                <BarChart3 className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No activity recorded</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Start chatting to see daily activity here.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

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
              <CardDescription>
                {data.activeDays} active days &middot; Peak: {toShortDay(data.busiestDay)} ({toMonthDay(data.busiestDay)})
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs">
              Last {chartDays.length} days
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="h-[220px] flex items-end">
            <svg
              viewBox={`0 0 ${svgWidth} 180`}
              className="w-full h-auto"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <linearGradient id="barGrad0" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity="0.25" />
                </linearGradient>
                <linearGradient id="barGrad1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity="0.25" />
                </linearGradient>
              </defs>
              {/* Baseline */}
              <line x1="10" y1="145" x2={svgWidth - 10} y2="145" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
              {/* Y-axis labels */}
              <text x="5" y="148" textAnchor="start" className="fill-muted-foreground/40" fontSize="8">0</text>
              {maxCount > 0 && (
                <text x="5" y="20" textAnchor="start" className="fill-muted-foreground/40" fontSize="8">{maxCount}</text>
              )}
              {chartDays.map((d, i) => {
                const barHeight = maxCount > 0 ? Math.max((d.count / maxCount) * 120, d.count > 0 ? 4 : 0) : 0;
                const x = 14 + i * 38;
                return (
                  <g key={d.day}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <motion.rect
                          x={x}
                          y={145}
                          width={24}
                          height={0}
                          rx={4}
                          fill={i % 2 === 0 ? 'url(#barGrad0)' : 'url(#barGrad1)'}
                          initial={{ height: 0, y: 145 }}
                          animate={{ height: barHeight, y: 145 - barHeight }}
                          transition={{ duration: 0.6, delay: 0.1 + i * 0.04, ease: 'easeOut' }}
                          className="cursor-pointer"
                          style={{ transformOrigin: 'bottom' }}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        {toMonthDay(d.day)}: {d.count} messages
                      </TooltipContent>
                    </Tooltip>
                    <text
                      x={x + 12}
                      y={160}
                      textAnchor="middle"
                      className="fill-muted-foreground/50"
                      fontSize="8"
                    >
                      {toShortDay(d.day)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   MODEL USAGE CARD
   ═══════════════════════════════════════════ */

function ModelUsageCard({ models, loading }: { models: ModelUsage[]; loading: boolean }) {
  if (loading) {
    return (
      <motion.div variants={itemVariants}>
        <Card className="h-full hover:shadow-md transition-shadow duration-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="w-4 h-4 text-chart-3" />
              Model Usage
            </CardTitle>
            <CardDescription>Loading model data...</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  if (models.length === 0) {
    return (
      <motion.div variants={itemVariants}>
        <Card className="h-full hover:shadow-md transition-shadow duration-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="w-4 h-4 text-chart-3" />
              Model Usage
            </CardTitle>
            <CardDescription>Distribution across models</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] flex flex-col items-center justify-center">
              <div className="p-3 rounded-full bg-muted/50 mb-3">
                <Bot className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No model data yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Start chatting to see model distribution.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  const totalTokens = models.reduce((s, m) => s + m.totalTokens, 0) || 1;

  const chartColors = [
    'hsl(var(--chart-1))',
    'hsl(var(--chart-2))',
    'hsl(var(--chart-3))',
    'hsl(var(--chart-4))',
    'hsl(var(--chart-5))',
  ];

  return (
    <motion.div variants={itemVariants}>
      <Card className="h-full hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="w-4 h-4 text-chart-3" />
            Model Usage
          </CardTitle>
          <CardDescription>{models.length} model{models.length !== 1 ? 's' : ''} used</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Horizontal bar chart */}
          <div className="space-y-3">
            {models.slice(0, 5).map((model, i) => {
              const pct = totalTokens > 0 ? Math.round((model.totalTokens / totalTokens) * 100) : 0;
              return (
                <div key={model.model} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: chartColors[i % chartColors.length] }}
                      />
                      <span className="text-sm font-medium truncate">{model.model}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">{model.sessions} sessions</span>
                      <Badge variant="secondary" className="text-xs">{pct}%</Badge>
                    </div>
                  </div>
                  <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{ backgroundColor: chartColors[i % chartColors.length] }}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, delay: 0.2 + i * 0.1, ease: 'easeOut' }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground/70">
                    <span>{formatNumber(model.totalTokens)} tokens</span>
                    <span>{model.toolCalls} tool calls</span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   TOOL USAGE CARD
   ═══════════════════════════════════════════ */

function ToolUsageCard({ tools, loading }: { tools: ToolUsage[]; loading: boolean }) {
  if (loading) {
    return (
      <motion.div variants={itemVariants}>
        <Card className="h-full hover:shadow-md transition-shadow duration-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="w-4 h-4 text-chart-2" />
              Tool Usage
            </CardTitle>
            <CardDescription>Loading tool data...</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  if (tools.length === 0) {
    return (
      <motion.div variants={itemVariants}>
        <Card className="h-full hover:shadow-md transition-shadow duration-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="w-4 h-4 text-chart-2" />
              Tool Usage
            </CardTitle>
            <CardDescription>Top tools by invocation count</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] flex flex-col items-center justify-center">
              <div className="p-3 rounded-full bg-muted/50 mb-3">
                <Wrench className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No tool data yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Tools used by the agent will appear here.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  const maxCount = Math.max(...tools.map(t => t.count), 1);
  const topTools = tools.slice(0, 10);

  return (
    <motion.div variants={itemVariants}>
      <Card className="h-full hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="w-4 h-4 text-chart-2" />
                Tool Usage
              </CardTitle>
              <CardDescription>
                Top {topTools.length} tool{topTools.length !== 1 ? 's' : ''} by frequency
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs">
              {tools.reduce((s, t) => s + t.count, 0)} total
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2.5 max-h-[280px] overflow-y-auto custom-scrollbar">
            {topTools.map((tool, i) => {
              const barWidth = Math.max((tool.count / maxCount) * 100, tool.count > 0 ? 3 : 0);
              return (
                <div key={tool.tool} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium truncate max-w-[180px]" title={tool.tool}>
                      {tool.tool}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground tabular-nums">{tool.count}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {tool.percentage}%
                      </Badge>
                    </div>
                  </div>
                  <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full bg-chart-2"
                      initial={{ width: 0 }}
                      animate={{ width: `${barWidth}%` }}
                      transition={{ duration: 0.6, delay: 0.15 + i * 0.04, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   SESSION INSIGHTS MINI-CARD
   ═══════════════════════════════════════════ */

function SessionInsightsCard({ overview, loading }: { overview: InsightsOverview | null; loading: boolean }) {
  if (loading || !overview) {
    return (
      <motion.div variants={itemVariants}>
        <Card className="hover:shadow-md transition-shadow duration-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart className="w-4 h-4 text-chart-4" />
              Session Insights
            </CardTitle>
            <CardDescription>Loading...</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-4 bg-muted rounded w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  const total = overview.userMessages + overview.assistantMessages + overview.toolMessages || 1;
  const userPct = Math.round((overview.userMessages / total) * 100);
  const assistantPct = Math.round((overview.assistantMessages / total) * 100);
  const toolPct = Math.round((overview.toolMessages / total) * 100);

  return (
    <motion.div variants={itemVariants}>
      <Card className="hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <PieChart className="w-4 h-4 text-chart-4" />
                Session Insights
              </CardTitle>
              <CardDescription>Message breakdown &amp; cost estimate</CardDescription>
            </div>
            {overview.estimatedCost > 0 && (
              <Badge variant="outline" className="text-xs gap-1 border-chart-4/30 text-chart-4">
                <DollarSign className="w-3 h-3" />
                ${overview.estimatedCost.toFixed(2)}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Message breakdown bars */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-chart-1" />
                  User Messages
                </span>
                <span className="text-xs text-muted-foreground">{overview.userMessages} ({userPct}%)</span>
              </div>
              <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-chart-1"
                  initial={{ width: 0 }}
                  animate={{ width: `${userPct}%` }}
                  transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-chart-2" />
                  Assistant Messages
                </span>
                <span className="text-xs text-muted-foreground">{overview.assistantMessages} ({assistantPct}%)</span>
              </div>
              <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-chart-2"
                  initial={{ width: 0 }}
                  animate={{ width: `${assistantPct}%` }}
                  transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-chart-5" />
                  Tool Messages
                </span>
                <span className="text-xs text-muted-foreground">{overview.toolMessages} ({toolPct}%)</span>
              </div>
              <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-chart-5"
                  initial={{ width: 0 }}
                  animate={{ width: `${toolPct}%` }}
                  transition={{ duration: 0.8, delay: 0.4, ease: 'easeOut' }}
                />
              </div>
            </div>
          </div>

          {/* Quick stats row */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
            <div className="text-center">
              <p className="text-lg font-bold tabular-nums">{overview.avgMessagesPerSession}</p>
              <p className="text-[10px] text-muted-foreground">Avg msgs/session</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold tabular-nums">{formatNumber(overview.totalTokens)}</p>
              <p className="text-[10px] text-muted-foreground">Total tokens</p>
            </div>
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
              <div className="relative h-2.5 bg-muted rounded-full overflow-hidden">
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
                    <TableHead className="pl-6 font-semibold">Title</TableHead>
                    <TableHead className="hidden sm:table-cell font-semibold">Model</TableHead>
                    <TableHead className="hidden md:table-cell font-semibold">Messages</TableHead>
                    <TableHead className="hidden lg:table-cell font-semibold">Last Active</TableHead>
                    <TableHead className="pr-6 font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.slice(0, 8).map((session, idx) => (
                    <TableRow
                      key={session.id}
                      className={cn(
                        'cursor-pointer hover:bg-muted/30 transition-colors duration-150',
                        idx % 2 === 1 && 'bg-muted/20'
                      )}
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
   MODEL BENCHMARK CARD
   ═══════════════════════════════════════════ */

interface BenchmarkResult {
  model: string;
  status: 'ok' | 'error';
  latencyMs: number;
  ttfbMs: number | null;
  totalTokens: number | null;
  response: string;
  error?: string;
}

const BENCHMARK_MODELS = [
  { id: 'z-ai/glm-5.1', label: 'GLM 5.1' },
  { id: 'z-ai/glm5', label: 'GLM 5' },
  { id: 'z-ai/glm4.7', label: 'GLM 4.7' },
  { id: 'minimaxai/minimax-m2.7', label: 'MiniMax M2.7' },
  { id: 'minimaxai/minimax-m2.5', label: 'MiniMax M2.5' },
];

function ModelBenchmarkCard() {
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [testing, setTesting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const setCurrentView = useAppStore((s) => s.setCurrentView);

  const runBenchmark = useCallback(async () => {
    setTesting(true);
    setResults([]);
    setErrorMsg(null);
    try {
      const resp = await fetch('/api/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ models: BENCHMARK_MODELS.map(m => m.id) }),
      });
      const data = await resp.json();
      if (data.results) {
        setResults(data.results);
      } else if (data.error) {
        setErrorMsg(data.error);
      }
    } catch (e) {
      setResults([{ model: '-', status: 'error', latencyMs: 0, ttfbMs: null, totalTokens: null, response: '', error: String(e) }]);
    } finally {
      setTesting(false);
    }
  }, []);

  const okCount = results.filter(r => r.status === 'ok').length;
  const avgLatency = results.length && okCount
    ? Math.round(results.filter(r => r.status === 'ok').reduce((s, r) => s + r.latencyMs, 0) / okCount)
    : 0;

  return (
    <motion.div variants={itemVariants}>
      <Card className="hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Gauge className="w-4 h-4 text-chart-4" />
                Model Benchmark
              </CardTitle>
              <CardDescription className="mt-1">Test NVIDIA NIM model response speed</CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={runBenchmark}
              disabled={testing}
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {testing ? 'Testing...' : 'Run Test'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {results.length === 0 && !testing && !errorMsg && (
            <div className="text-center text-muted-foreground text-sm py-6">
              <Gauge className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Click "Run Test" to benchmark NVIDIA NIM models
            </div>
          )}
          {errorMsg && results.length === 0 && !testing && (
            <div className="text-center text-sm py-4">
              <div className="flex items-center justify-center gap-2 text-amber-600 mb-2">
                <AlertTriangle className="w-4 h-4" />
                <span className="font-medium">API Key Required</span>
              </div>
              <p className="text-muted-foreground mb-3 text-xs">
                NVIDIA_API_KEY not configured. Go to Settings → API Keys to add your key.
              </p>
              <Button size="sm" variant="outline" onClick={() => setCurrentView('settings')}>
                <Settings className="w-3.5 h-3.5 mr-1.5" />
                Open Settings
              </Button>
            </div>
          )}
          {testing && results.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-6">
              <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
              Sending requests to NVIDIA NIM...
            </div>
          )}
          {results.length > 0 && (
            <>
              {/* Summary bar */}
              <div className="flex items-center gap-4 mb-4 text-sm">
                <Badge variant={okCount === results.length ? 'default' : 'secondary'}>
                  {okCount}/{results.length} passed
                </Badge>
                {avgLatency > 0 && (
                  <span className="text-muted-foreground">
                    Avg: <span className="font-medium text-foreground">{avgLatency}ms</span>
                  </span>
                )}
                <button
                  className="text-muted-foreground hover:text-foreground ml-auto text-xs"
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? '▲ Less' : '▼ Details'}
                </button>
              </div>
              {/* Results table */}
              <div className="space-y-2">
                {results.map((r) => (
                  <div
                    key={r.model}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm',
                      r.status === 'ok' ? 'bg-emerald-500/5' : 'bg-destructive/5'
                    )}
                  >
                    <span className={cn(
                      'w-2 h-2 rounded-full flex-shrink-0',
                      r.status === 'ok' ? 'bg-emerald-500' : 'bg-destructive'
                    )} />
                    <span className="font-medium truncate flex-1 min-w-0" title={r.model}>
                      {r.model}
                    </span>
                    {r.status === 'ok' ? (
                      <>
                        <span className="text-muted-foreground tabular-nums">
                          {r.latencyMs}ms
                        </span>
                        {r.totalTokens != null && (
                          <span className="text-xs text-muted-foreground hidden sm:inline">
                            {r.totalTokens} tok
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-destructive truncate max-w-[200px]" title={r.error}>
                        {r.error}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {/* Expanded details */}
              <AnimatePresence>
                {expanded && results.filter(r => r.status === 'ok').length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 pt-3 border-t space-y-1.5">
                      {results.filter(r => r.status === 'ok').map((r) => (
                        <div key={r.model} className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{r.model}</span>
                          <span className="tabular-nums">
                            TTFB {r.ttfbMs}ms → Total {r.latencyMs}ms
                            {r.response && <span className="ml-2 text-foreground/60">"{r.response}"</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
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
                  'group relative flex flex-col items-center gap-2.5 p-4 rounded-xl border border-border/50',
                  'bg-card hover:bg-gradient-to-br hover:from-accent/60 hover:to-accent/30 transition-all duration-200',
                  'hover:border-border hover:shadow-sm'
                )}
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.06, duration: 0.3 }}
              >
                <div className={cn('p-3 rounded-xl transition-colors group-hover:scale-110', action.bg)}>
                  <action.icon className={cn('w-5 h-5 transition-colors', action.color)} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">{action.label}</p>
                  <p className="text-[11px] text-muted-foreground">{action.description}</p>
                </div>
                <motion.div
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-hover:text-muted-foreground"
                  initial={{ opacity: 0, x: -4 }}
                  whileHover={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </motion.div>
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
        className="relative w-24 h-24 rounded-2xl bg-gradient-to-br from-muted/80 to-muted/40 flex items-center justify-center mb-6 shadow-lg shadow-muted/20"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Activity className="w-11 h-11 text-muted-foreground/70" />
      </motion.div>
      <h3 className="text-lg font-semibold mb-2 relative z-10">Welcome to Hermes Dashboard</h3>
      <p className="text-sm text-muted-foreground text-center max-w-sm mb-8 relative z-10">
        Your mission control center is ready. Start chatting with your agent to see real-time stats, activity charts, and session history appear here.
      </p>
      <motion.button
        onClick={() => setCurrentView('chat')}
        className="relative inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/30 transition-all duration-200 hover:scale-[1.03] active:scale-[0.97] ring-1 ring-primary/20"
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
      >
        <MessageSquare className="w-4 h-4" />
        Start Your First Chat
        <ArrowRight className="w-4 h-4 ml-0.5" />
      </motion.button>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   MAIN DASHBOARD VIEW
   ═══════════════════════════════════════════ */

export function DashboardView() {
  const agentStatus = useAppStore((s) => s.agentStatus);
  const [stats, setStats] = useState<ApiStats | null>(null);
  const [insights, setInsights] = useState<InsightsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insightsDays] = useState(30);

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

  const fetchInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const res = await fetch(`/api/insights?days=${insightsDays}`);
      if (!res.ok) throw new Error('Failed to fetch insights');
      const data: InsightsReport = await res.json();
      setInsights(data);
    } catch (err) {
      console.error('Failed to fetch insights:', err);
      // Insights failure is non-fatal — still show stats
    } finally {
      setInsightsLoading(false);
    }
  }, [insightsDays]);

  useEffect(() => {
    fetchStats();
    fetchInsights();
  }, [fetchStats, fetchInsights]);

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
          <div className="flex items-center gap-3">
            {error && (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{error}</span>
              </div>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => { fetchStats(); fetchInsights(); }}
                  disabled={loading || insightsLoading}
                >
                  <RefreshCw className={cn('w-4 h-4', (loading || insightsLoading) && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh all data</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </motion.div>

      <motion.div
        className="space-y-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* ─── Top Row: Stat Cards (5 columns) ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
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
          <ToolCallsCard
            total={insights?.overview.totalToolCalls ?? 0}
            loading={insightsLoading}
          />
        </div>

        {/* ─── Middle Row: Activity Chart + Session Insights ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ActivityChartCard
            data={insights?.activity ?? null}
            loading={insightsLoading}
            days={insightsDays}
          />
          <SessionInsightsCard
            overview={insights?.overview ?? null}
            loading={insightsLoading}
          />
        </div>

        {/* ─── Model Usage + Tool Usage ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ModelUsageCard
            models={insights?.models ?? []}
            loading={insightsLoading}
          />
          <ToolUsageCard
            tools={insights?.tools ?? []}
            loading={insightsLoading}
          />
        </div>

        {/* ─── Model Benchmark ─── */}
        <ModelBenchmarkCard />

        {/* ─── System Resources ─── */}
        <SystemResourcesCard />

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
