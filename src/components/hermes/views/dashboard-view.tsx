'use client';

import { useEffect, useRef, useState } from 'react';
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
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAppStore } from '@/store/app-store';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { cn } from '@/lib/utils';

/* ═══════════════════════════════════════════
   MOCK DATA
   ═══════════════════════════════════════════ */

const activityData = [
  { day: 'Mon', messages: 24, tokens: 4500 },
  { day: 'Tue', messages: 38, tokens: 7200 },
  { day: 'Wed', messages: 15, tokens: 3100 },
  { day: 'Thu', messages: 52, tokens: 9800 },
  { day: 'Fri', messages: 41, tokens: 7600 },
  { day: 'Sat', messages: 28, tokens: 5200 },
  { day: 'Sun', messages: 33, tokens: 6100 },
];

const toolUsage = [
  { name: 'Web Search', count: 142, color: 'bg-emerald-500' },
  { name: 'Code Exec', count: 98, color: 'bg-amber-500' },
  { name: 'File Read', count: 87, color: 'bg-rose-500' },
  { name: 'DB Query', count: 64, color: 'bg-cyan-500' },
  { name: 'API Call', count: 53, color: 'bg-orange-500' },
];

const mockSessions = [
  {
    id: 's1',
    title: 'Building REST API with authentication',
    model: 'GPT-4o',
    messages: 42,
    lastActive: '2 min ago',
    status: 'active' as const,
  },
  {
    id: 's2',
    title: 'Database schema optimization',
    model: 'Claude 3.5',
    messages: 28,
    lastActive: '1 hour ago',
    status: 'active' as const,
  },
  {
    id: 's3',
    title: 'React component refactoring',
    model: 'GPT-4o',
    messages: 63,
    lastActive: '3 hours ago',
    status: 'archived' as const,
  },
  {
    id: 's4',
    title: 'CI/CD pipeline setup',
    model: 'Claude 3.5',
    messages: 15,
    lastActive: 'Yesterday',
    status: 'archived' as const,
  },
  {
    id: 's5',
    title: 'Performance debugging',
    model: 'GPT-4o',
    messages: 31,
    lastActive: '2 days ago',
    status: 'archived' as const,
  },
];

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
    <motion.div variants={itemVariants} whileHover={{ y: -2, transition: { duration: 0.2 } }}>
      <Card className="h-full hover:shadow-md transition-shadow duration-200">
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

function TotalSessionsCard() {
  const sessions = useAppStore((s) => s.chatSessions);
  const total = sessions.length || 24;
  const todayCount = 3;
  const displayTotal = useCountUp(total);

  return (
    <motion.div variants={itemVariants} whileHover={{ y: -2, transition: { duration: 0.2 } }}>
      <Card className="h-full hover:shadow-md transition-shadow duration-200">
        <CardContent className="p-5 flex items-start justify-between">
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Total Sessions</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight">{displayTotal}</span>
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

function MessagesTodayCard() {
  const total = 42;
  const yesterday = 35;
  const delta = Math.round(((total - yesterday) / yesterday) * 100);
  const displayTotal = useCountUp(total);
  const isUp = delta > 0;

  return (
    <motion.div variants={itemVariants} whileHover={{ y: -2, transition: { duration: 0.2 } }}>
      <Card className="h-full hover:shadow-md transition-shadow duration-200">
        <CardContent className="p-5 flex items-start justify-between">
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Messages Today</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight">{displayTotal}</span>
              <span className="text-sm text-muted-foreground">/ {yesterday} yesterday</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 text-xs font-medium',
                  isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
                )}
              >
                {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {isUp ? '+' : ''}{delta}%
              </span>
              <span className="text-xs text-muted-foreground">vs yesterday</span>
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

function ToolsUsedCard() {
  const maxCount = Math.max(...toolUsage.map((t) => t.count));
  const totalTools = toolUsage.reduce((acc, t) => acc + t.count, 0);
  const displayTotal = useCountUp(totalTools);

  return (
    <motion.div variants={itemVariants} whileHover={{ y: -2, transition: { duration: 0.2 } }}>
      <Card className="h-full hover:shadow-md transition-shadow duration-200">
        <CardContent className="p-5 flex items-start justify-between">
          <div className="space-y-3 flex-1 min-w-0">
            <p className="text-sm font-medium text-muted-foreground">Tools Used</p>
            <span className="text-3xl font-bold tracking-tight">{displayTotal}</span>
            <div className="space-y-1.5">
              {toolUsage.slice(0, 3).map((tool) => (
                <div key={tool.name} className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground w-16 truncate">
                    {tool.name}
                  </span>
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className={cn('h-full rounded-full', tool.color)}
                      initial={{ width: 0 }}
                      animate={{ width: `${(tool.count / maxCount) * 100}%` }}
                      transition={{ duration: 0.8, delay: 0.4, ease: 'easeOut' }}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground w-6 text-right">
                    {tool.count}
                  </span>
                </div>
              ))}
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
   ACTIVITY CHART
   ═══════════════════════════════════════════ */

function ActivityChartCard() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

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
          <div className="h-[220px]">
            <AnimatePresence>
              {mounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={activityData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="msgGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: 'hsl(var(--foreground))',
                      }}
                      labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="messages"
                      stroke="hsl(var(--chart-1))"
                      strokeWidth={2}
                      fill="url(#msgGradient)"
                      animationDuration={1200}
                      animationEasing="ease-out"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </AnimatePresence>
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

function RecentSessionsTable() {
  const sessions = useAppStore((s) => s.chatSessions);
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const setCurrentSessionId = useAppStore((s) => s.setCurrentSessionId);
  const hasSessions = sessions.length > 0;
  const displaySessions = hasSessions ? sessions.slice(0, 5).map((s, i) => ({
    ...s,
    messages: Math.floor(Math.random() * 50) + 5,
    lastActive: i === 0 ? '2 min ago' : i === 1 ? '1 hour ago' : `${i + 1} days ago`,
    status: i < 2 ? ('active' as const) : ('archived' as const),
  })) : mockSessions;

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
            {hasSessions && (
              <button
                onClick={() => setCurrentView('sessions')}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                View all <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="max-h-96 overflow-y-auto custom-scrollbar">
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
                {displaySessions.map((session) => (
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
                      <span className="text-sm text-muted-foreground">{session.messages}</span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-sm text-muted-foreground">{session.lastActive}</span>
                    </TableCell>
                    <TableCell className="pr-6">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          session.status === 'active'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400'
                            : 'border-border text-muted-foreground'
                        )}
                      >
                        <CircleDot className="w-2.5 h-2.5" />
                        {session.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
      className="flex flex-col items-center justify-center py-20 px-4"
    >
      <motion.div
        className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-6"
        animate={{ rotate: [0, 5, -5, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Activity className="w-9 h-9 text-muted-foreground" />
      </motion.div>
      <h3 className="text-lg font-semibold mb-2">Welcome to Hermes Dashboard</h3>
      <p className="text-sm text-muted-foreground text-center max-w-sm mb-8">
        Your mission control center is ready. Start chatting with your agent to see real-time stats, activity charts, and session history appear here.
      </p>
      <motion.button
        onClick={() => setCurrentView('chat')}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <MessageSquare className="w-4 h-4" />
        Start Your First Chat
      </motion.button>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   TOKEN USAGE CHART (mini bar)
   ═══════════════════════════════════════════ */

function TokenUsageMiniChart() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

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
            <span className="text-xs text-muted-foreground font-medium">43.5k total</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[160px]">
            <AnimatePresence>
              {mounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activityData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => v >= 1000 ? `${v / 1000}k` : v}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: 'hsl(var(--foreground))',
                      }}
                      formatter={(value: number) => [`${value.toLocaleString()} tokens`, 'Tokens']}
                    />
                    <Bar
                      dataKey="tokens"
                      fill="hsl(var(--chart-4))"
                      radius={[4, 4, 0, 0]}
                      animationDuration={1000}
                      animationEasing="ease-out"
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </AnimatePresence>
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
  const chatSessions = useAppStore((s) => s.chatSessions);
  const isEmpty = chatSessions.length === 0 && agentStatus === 'disconnected';

  if (isEmpty) {
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
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor your agent&apos;s performance, usage, and system health at a glance.
        </p>
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
          <TotalSessionsCard />
          <MessagesTodayCard />
          <ToolsUsedCard />
        </div>

        {/* ─── Middle Row: Charts ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ActivityChartCard />
          <SystemResourcesCard />
        </div>

        {/* ─── Token usage mini chart ─── */}
        <TokenUsageMiniChart />

        {/* ─── Bottom Row: Sessions + Quick Actions ─── */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <div className="xl:col-span-3">
            <RecentSessionsTable />
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
