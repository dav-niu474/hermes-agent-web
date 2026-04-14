'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  Plus,
  Trash2,
  Play,
  Pause,
  MoreHorizontal,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Pencil,
  History,
  XCircle,
  Activity,
  Infinity,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  scheduleKind: string;
  scheduleExpr: string | null;
  task: string;
  isEnabled: boolean;
  status: string;
  repeatMax: number | null;
  repeatDone: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

interface CronJobLog {
  id: string;
  jobId: string;
  status: string;
  output: string | null;
  error: string | null;
  duration: number | null;
  createdAt: string;
}

type JobStatus = 'active' | 'paused' | 'error';

// ─── Constants ───────────────────────────────────────────────────────────────

const SCHEDULE_PRESETS = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
  { label: 'Daily at 9 AM', value: '0 9 * * *' },
  { label: 'Weekly on Monday', value: '0 9 * * 1' },
  { label: 'Monthly on 1st', value: '0 9 1 * *' },
];

function humanReadableCron(cron: string): string {
  const match = SCHEDULE_PRESETS.find(p => p.value === cron);
  if (match) return match.label;
  const parts = cron.split(' ');
  if (parts.length !== 5) return cron;
  const [min, hour, day, month, weekday] = parts;
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let readable = '';
  if (hour !== '*' && min !== '*') readable += `At ${hour}:${min.padStart(2, '0')}`;
  if (day !== '*') readable += ` on day ${day}`;
  if (month !== '*') readable += ` in month ${month}`;
  if (weekday !== '*') readable += ` on ${weekdays[parseInt(weekday)] || weekday}`;
  if (!readable) readable = `Every ${min === '*' ? 'minute' : `${min} min`}`;
  return readable;
}

const STATUS_CONFIG: Record<JobStatus, { icon: typeof CheckCircle2; color: string; bg: string; badgeClass: string }> = {
  active: {
    icon: CheckCircle2,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400',
  },
  paused: {
    icon: Pause,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-500/10 dark:text-amber-400',
  },
  error: {
    icon: AlertCircle,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    badgeClass: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-500/10 dark:text-red-400',
  },
};

function deriveStatus(job: CronJob): JobStatus {
  if (job.lastStatus === 'error' && job.isEnabled) return 'error';
  if (job.status === 'error') return 'error';
  return job.isEnabled ? 'active' : 'paused';
}

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    return format(new Date(dateStr), 'MMM d, HH:mm');
  } catch {
    return null;
  }
}

function formatDateTime(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    return format(new Date(dateStr), 'MMM d, yyyy HH:mm:ss');
  } catch {
    return null;
  }
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Skeleton Loader ─────────────────────────────────────────────────────────

function JobCardSkeleton() {
  return (
    <Card className="border-border/40">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="p-2 rounded-lg bg-muted/60 shrink-0 mt-0.5">
            <Loader2 className="size-4 text-muted-foreground/40 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-4 w-32 rounded bg-muted/60 animate-pulse" />
              <div className="h-4 w-12 rounded-full bg-muted/40 animate-pulse" />
            </div>
            <div className="h-3 w-full rounded bg-muted/40 animate-pulse" />
            <div className="h-3 w-3/4 rounded bg-muted/30 animate-pulse" />
            <div className="flex items-center gap-3 pt-1">
              <div className="h-3 w-28 rounded bg-muted/40 animate-pulse" />
              <div className="h-3 w-20 rounded bg-muted/30 animate-pulse" />
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <div className="size-8 rounded bg-muted/30 animate-pulse" />
            <div className="size-8 rounded bg-muted/30 animate-pulse" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Log Entry Component ────────────────────────────────────────────────────

function LogEntry({ log, index }: { log: CronJobLog; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const isOk = log.status === 'ok';
  const hasOutput = log.output && log.output.length > 0;
  const hasError = log.error && log.error.length > 0;
  const outputLines = log.output ? log.output.split('\n') : [];

  return (
    <div className="border border-border/40 rounded-lg overflow-hidden">
      {/* Log header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
      >
        {/* Status icon */}
        <div className={cn(
          'shrink-0 p-1 rounded-full',
          isOk ? 'bg-emerald-500/10' : 'bg-red-500/10'
        )}>
          {isOk ? (
            <CheckCircle2 className="size-3.5 text-emerald-500" />
          ) : (
            <XCircle className="size-3.5 text-red-500" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn(
              'text-xs font-medium',
              isOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            )}>
              {isOk ? 'Success' : 'Error'}
            </span>
            {log.duration != null && (
              <span className="text-[11px] text-muted-foreground font-mono">
                {formatDuration(log.duration)}
              </span>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {formatDateTime(log.createdAt)}
          </span>
        </div>

        {/* Expand toggle */}
        {hasOutput && (
          <div className="shrink-0 text-muted-foreground">
            {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </div>
        )}
      </button>

      {/* Expanded content */}
      {(expanded && hasOutput) || hasError ? (
        <div className="border-t border-border/40">
          {hasError && (
            <div className="p-3 bg-red-500/5">
              <p className="text-xs text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap break-all">
                {log.error}
              </p>
            </div>
          )}
          {expanded && hasOutput && (
            <div className="p-3 bg-muted/20 max-h-64 overflow-y-auto custom-scrollbar">
              <pre className="text-xs text-foreground/80 font-mono whitespace-pre-wrap break-all leading-relaxed">
                {log.output}
              </pre>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ─── Execution History Dialog ────────────────────────────────────────────────

function ExecutionHistoryDialog({
  job,
  open,
  onOpenChange,
}: {
  job: CronJob | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [logs, setLogs] = useState<CronJobLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !job) return;
    // Use rAF to avoid sync setState in effect (lint rule)
    requestAnimationFrame(() => {
      setLoading(true);
      setError(null);

      fetch(`/api/cronjobs/logs?jobId=${job.id}&limit=50`)
        .then(res => {
          if (!res.ok) throw new Error(`Failed to fetch logs (${res.status})`);
          return res.json();
        })
        .then((data: CronJobLog[]) => {
          setLogs(data);
        })
        .catch(err => {
          console.error('[ExecutionHistory] fetch error:', err);
          setError(err instanceof Error ? err.message : 'Failed to load logs');
        })
        .finally(() => {
          setLoading(false);
        });
    });
  }, [open, job]);

  const okCount = logs.filter(l => l.status === 'ok').length;
  const errorCount = logs.filter(l => l.status === 'error').length;
  const avgDuration = logs.filter(l => l.duration != null).length > 0
    ? logs.reduce((sum, l) => sum + (l.duration ?? 0), 0) / logs.filter(l => l.duration != null).length
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted/60">
              <History className="size-4 text-muted-foreground" />
            </div>
            <div>
              <DialogTitle>Execution History</DialogTitle>
              <DialogDescription className="mt-0.5">
                {job?.name} &mdash; {logs.length} execution{logs.length !== 1 ? 's' : ''}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Stats bar */}
        {!loading && logs.length > 0 && (
          <div className="flex items-center gap-4 shrink-0 px-1">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="size-3 text-emerald-500" />
              <span className="text-xs text-muted-foreground">{okCount} ok</span>
            </div>
            {errorCount > 0 && (
              <div className="flex items-center gap-1.5">
                <XCircle className="size-3 text-red-500" />
                <span className="text-xs text-muted-foreground">{errorCount} error</span>
              </div>
            )}
            {avgDuration != null && (
              <div className="flex items-center gap-1.5">
                <Activity className="size-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">avg {formatDuration(Math.round(avgDuration))}</span>
              </div>
            )}
          </div>
        )}

        <Separator className="shrink-0" />

        {/* Logs list */}
        <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
          <div className="space-y-2">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {error && !loading && (
              <div className="flex flex-col items-center py-12 text-center">
                <AlertCircle className="size-5 text-red-500 mb-2" />
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            )}

            {!loading && !error && logs.length === 0 && (
              <div className="flex flex-col items-center py-12 text-center">
                <History className="size-5 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No execution logs yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Trigger the job to see logs here</p>
              </div>
            )}

            {!loading && logs.map((log, i) => (
              <LogEntry key={log.id} log={log} index={i} />
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create/Edit Job Dialog ─────────────────────────────────────────────────

function JobFormDialog({
  open,
  onOpenChange,
  editJob,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editJob: CronJob | null;
  onSaved: () => void;
}) {
  const isEdit = editJob !== null;
  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState('0 9 * * *');
  const [scheduleMode, setScheduleMode] = useState<'preset' | 'custom'>('preset');
  const [customSchedule, setCustomSchedule] = useState('');
  const [task, setTask] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (editJob) {
        setName(editJob.name);
        const isPreset = SCHEDULE_PRESETS.some(p => p.value === editJob.schedule);
        setScheduleMode(isPreset ? 'preset' : 'custom');
        if (isPreset) {
          setSchedule(editJob.schedule);
        } else {
          setCustomSchedule(editJob.schedule);
        }
        setTask(editJob.task);
        setEnabled(editJob.isEnabled);
      } else {
        setName('');
        setSchedule('0 9 * * *');
        setScheduleMode('preset');
        setCustomSchedule('');
        setTask('');
        setEnabled(true);
      }
    }
  }, [open, editJob]);

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || !task.trim()) {
      toast.error('Please fill in name and task');
      return;
    }

    const finalSchedule = scheduleMode === 'custom' ? customSchedule.trim() : schedule;
    if (!finalSchedule) {
      toast.error('Please provide a schedule');
      return;
    }

    setSaving(true);
    try {
      const url = '/api/cronjobs';
      const method = isEdit ? 'PUT' : 'POST';
      const body = isEdit
        ? { id: editJob.id, name: name.trim(), schedule: finalSchedule, task: task.trim(), isEnabled: enabled }
        : { name: name.trim(), schedule: finalSchedule, task: task.trim(), isEnabled: enabled };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(`Failed to ${isEdit ? 'update' : 'create'} job (${res.status})`);
      const saved = await res.json();

      toast.success(isEdit ? `"${saved.name}" updated` : `Cron job "${saved.name}" created`);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      console.error('[JobFormDialog] save error:', err);
      toast.error(`Failed to ${isEdit ? 'update' : 'create'} cron job`);
    } finally {
      setSaving(false);
    }
  }, [name, schedule, customSchedule, scheduleMode, task, enabled, isEdit, editJob, onOpenChange, onSaved]);

  const currentScheduleDisplay = scheduleMode === 'preset' ? schedule : customSchedule;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Cron Job' : 'New Cron Job'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Modify the scheduled task configuration.' : 'Schedule a recurring task for your agent to execute.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="job-name">Job Name</Label>
            <Input
              id="job-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Daily Report"
            />
          </div>

          {/* Schedule */}
          <div className="space-y-2">
            <Label>Schedule</Label>
            {/* Mode toggle */}
            <div className="flex items-center gap-2 mb-2">
              <Button
                type="button"
                variant={scheduleMode === 'preset' ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setScheduleMode('preset')}
              >
                Presets
              </Button>
              <Button
                type="button"
                variant={scheduleMode === 'custom' ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setScheduleMode('custom')}
              >
                Custom Expression
              </Button>
            </div>

            {scheduleMode === 'preset' ? (
              <Select value={schedule} onValueChange={setSchedule}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_PRESETS.map(p => (
                    <SelectItem key={p.value} value={p.value}>
                      <span className="font-mono text-xs mr-2">{p.value}</span>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={customSchedule}
                onChange={(e) => setCustomSchedule(e.target.value)}
                placeholder="e.g. */15 * * * *"
                className="font-mono text-sm"
              />
            )}
            <p className="text-[11px] text-muted-foreground">
              {currentScheduleDisplay ? humanReadableCron(currentScheduleDisplay) : 'Enter a cron expression'}
            </p>
          </div>

          {/* Task */}
          <div className="space-y-2">
            <Label htmlFor="job-task">Task Description</Label>
            <Textarea
              id="job-task"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              rows={4}
              placeholder="Describe what the agent should do when this job runs..."
            />
          </div>

          {/* Enabled */}
          <div className="flex items-center justify-between">
            <Label>Enabled</Label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
            {isEdit ? (
              <><Pencil className="size-3.5 mr-1.5" /> Save Changes</>
            ) : (
              <><Plus className="size-3.5 mr-1.5" /> Create Job</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Repeat Progress Component ───────────────────────────────────────────────

function RepeatProgress({ repeatMax, repeatDone }: { repeatMax: number | null; repeatDone: number }) {
  if (repeatMax == null) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Infinity className="size-3" />
            <span className="text-[11px] font-mono">&infin;</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>Repeats indefinitely</TooltipContent>
      </Tooltip>
    );
  }

  const pct = Math.min((repeatDone / repeatMax) * 100, 100);
  const isComplete = repeatDone >= repeatMax;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-12 h-1.5 rounded-full bg-muted/60 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                isComplete ? 'bg-amber-500' : 'bg-emerald-500'
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[11px] font-mono">
            {repeatDone}/{repeatMax}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {isComplete ? 'All runs completed' : `${repeatDone} of ${repeatMax} runs done (${Math.round(pct)}%)`}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Last Run Status Indicator ──────────────────────────────────────────────

function LastRunStatus({ lastStatus, lastRunAt }: { lastStatus: string | null; lastRunAt: string | null }) {
  if (!lastStatus || !lastRunAt) return null;

  const isOk = lastStatus === 'ok';

  return (
    <div className="flex items-center gap-1.5">
      {isOk ? (
        <CheckCircle2 className="size-3 text-emerald-500" />
      ) : (
        <XCircle className="size-3 text-red-500" />
      )}
      <span className={cn(
        'text-[11px]',
        isOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
      )}>
        Last: {isOk ? 'OK' : 'Error'}
      </span>
      <span className="text-[11px] text-muted-foreground">
        {formatDate(lastRunAt)}
      </span>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function CronjobsView() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [editJob, setEditJob] = useState<CronJob | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [historyJob, setHistoryJob] = useState<CronJob | null>(null);

  // Loading states
  const [deleting, setDeleting] = useState(false);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  // ── Fetch jobs ──

  const fetchJobs = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/cronjobs');
      if (!res.ok) throw new Error(`Failed to fetch jobs (${res.status})`);
      const data: CronJob[] = await res.json();
      setJobs(data);
    } catch (err) {
      console.error('[CronjobsView] fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load cron jobs');
      toast.error('Failed to load cron jobs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // ── Toggle job ──

  const handleToggle = useCallback(async (job: CronJob) => {
    const newEnabled = !job.isEnabled;
    const optimisticJobs = jobs.map(j =>
      j.id === job.id ? { ...j, isEnabled: newEnabled, status: newEnabled ? 'active' : 'paused' } : j,
    );
    setJobs(optimisticJobs);

    try {
      const res = await fetch('/api/cronjobs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: job.id, isEnabled: newEnabled }),
      });
      if (!res.ok) throw new Error(`Failed to update job (${res.status})`);
      const updated: CronJob = await res.json();
      setJobs(prev => prev.map(j => j.id === updated.id ? updated : j));
      toast.success(newEnabled ? `"${job.name}" enabled` : `"${job.name}" paused`);
    } catch (err) {
      console.error('[CronjobsView] toggle error:', err);
      setJobs(jobs);
      toast.error('Failed to update job');
    }
  }, [jobs]);

  // ── Delete job ──

  const handleDelete = useCallback(async (id: string) => {
    setDeleting(true);
    try {
      const res = await fetch('/api/cronjobs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(`Failed to delete job (${res.status})`);
      setJobs(prev => prev.filter(j => j.id !== id));
      setDeleteId(null);
      toast.success('Cron job deleted');
    } catch (err) {
      console.error('[CronjobsView] delete error:', err);
      toast.error('Failed to delete cron job');
    } finally {
      setDeleting(false);
    }
  }, []);

  // ── Run now (actually triggers via API) ──

  const handleRunNow = useCallback(async (job: CronJob) => {
    setTriggeringId(job.id);
    try {
      const res = await fetch(`/api/cronjobs/${job.id}/trigger`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`Failed to trigger job (${res.status})`);
      const data = await res.json();

      if (data.success) {
        toast.success(`"${job.name}" triggered successfully`);
        // Refresh job list after a short delay to show updated stats
        setTimeout(() => fetchJobs(true), 2000);
      } else {
        throw new Error('Trigger returned unsuccessful');
      }
    } catch (err) {
      console.error('[CronjobsView] trigger error:', err);
      toast.error(`Failed to trigger "${job.name}"`);
    } finally {
      setTriggeringId(null);
    }
  }, [fetchJobs]);

  // ── Derived state ──

  const activeCount = jobs.filter(j => j.isEnabled).length;
  const totalRuns = jobs.reduce((sum, j) => sum + j.runCount, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-sm px-4 sm:px-6 pt-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Cron Jobs</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {loading ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="size-3 animate-spin" />
                  Loading…
                </span>
              ) : (
                <>
                  {jobs.length} job{jobs.length !== 1 ? 's' : ''} &middot;{' '}
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">{activeCount} active</span>
                  {totalRuns > 0 && (
                    <span>
                      {' '}&middot;{' '}
                      <span className="text-muted-foreground">{totalRuns} total run{totalRuns !== 1 ? 's' : ''}</span>
                    </span>
                  )}
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  onClick={() => fetchJobs(true)}
                  disabled={loading || refreshing}
                >
                  <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
            <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3.5" /> New Job
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6 space-y-3">
          {/* Loading state */}
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <JobCardSkeleton key={i} />
              ))}
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <div className="p-3 rounded-full bg-red-500/10 mb-3">
                <AlertCircle className="size-5 text-red-500" />
              </div>
              <p className="text-sm font-medium">Failed to load cron jobs</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">{error}</p>
              <Button variant="outline" size="sm" onClick={() => fetchJobs()}>
                <RefreshCw className="size-3.5 mr-1.5" /> Try again
              </Button>
            </motion.div>
          )}

          {/* Job list */}
          {!loading && !error && (
            <AnimatePresence mode="popLayout">
              {jobs.map(job => {
                const status = deriveStatus(job);
                const config = STATUS_CONFIG[status];
                const StatusIcon = config.icon;
                const nextRun = formatDate(job.nextRunAt);
                const isTriggering = triggeringId === job.id;

                return (
                  <motion.div
                    key={job.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Card className="hover:shadow-md transition-all duration-200 group cursor-pointer">
                      <CardContent
                        className="p-4"
                        onClick={() => setHistoryJob(job)}
                      >
                        <div className="flex items-start gap-4">
                          {/* Status Icon */}
                          <div className={cn('p-2 rounded-lg shrink-0 mt-0.5', config.bg)}>
                            <StatusIcon className={cn('size-4', config.color)} />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            {/* Title row */}
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h3 className="text-sm font-semibold truncate">{job.name}</h3>
                              <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', config.badgeClass)}>
                                {status}
                              </Badge>
                              {/* Last run status */}
                              <LastRunStatus lastStatus={job.lastStatus} lastRunAt={job.lastRunAt} />
                            </div>

                            {/* Task description */}
                            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{job.task}</p>

                            {/* Meta row */}
                            <div className="flex items-center gap-3 flex-wrap">
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Clock className="size-3" />
                                <code className="text-[11px] font-mono bg-muted/50 px-1.5 py-0.5 rounded">{job.schedule}</code>
                                <span className="text-[10px]">{humanReadableCron(job.schedule)}</span>
                              </div>
                              {nextRun && (
                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                  Next: {nextRun}
                                </span>
                              )}
                            </div>

                            {/* Stats row */}
                            <div className="flex items-center gap-4 mt-2">
                              {/* Run count */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Activity className="size-3" />
                                    <span className="text-[11px] font-mono">{job.runCount}</span>
                                    <span className="text-[10px]">run{job.runCount !== 1 ? 's' : ''}</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>Total executions</TooltipContent>
                              </Tooltip>

                              {/* Repeat progress */}
                              <RepeatProgress repeatMax={job.repeatMax} repeatDone={job.repeatDone} />
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 shrink-0">
                            {/* Run now */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className={cn(
                                    'size-8',
                                    isTriggering ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                  )}
                                  disabled={isTriggering}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRunNow(job);
                                  }}
                                >
                                  {isTriggering ? (
                                    <Loader2 className="size-3.5 animate-spin text-emerald-500" />
                                  ) : (
                                    <Play className="size-3.5 text-emerald-500" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{isTriggering ? 'Running...' : 'Run now'}</TooltipContent>
                            </Tooltip>

                            {/* History */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 opacity-0 group-hover:opacity-100"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setHistoryJob(job);
                                  }}
                                >
                                  <History className="size-3.5 text-muted-foreground" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Execution history</TooltipContent>
                            </Tooltip>

                            {/* Enable/Disable toggle */}
                            <Switch
                              checked={job.isEnabled}
                              onCheckedChange={(e) => {
                                e.stopPropagation();
                                handleToggle(job);
                              }}
                              className="scale-90"
                            />

                            {/* More menu */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 opacity-0 group-hover:opacity-100"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreHorizontal className="size-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation();
                                  setHistoryJob(job);
                                }}>
                                  <History className="size-3.5" /> Execution History
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation();
                                  handleRunNow(job);
                                }}>
                                  <Play className="size-3.5" /> Run Now
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation();
                                  setEditJob(job);
                                }}>
                                  <Pencil className="size-3.5" /> Edit Job
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteId(job.id);
                                  }}
                                >
                                  <Trash2 className="size-3.5" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}

          {/* Empty state */}
          {!loading && !error && jobs.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20 text-center">
              <div className="p-3 rounded-full bg-muted/60 mb-3"><Clock className="size-5 text-muted-foreground" /></div>
              <p className="text-sm font-medium">No cron jobs</p>
              <p className="text-xs text-muted-foreground mt-1">Create scheduled tasks to automate your agent workflows</p>
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* Create Dialog */}
      <JobFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        editJob={null}
        onSaved={() => fetchJobs()}
      />

      {/* Edit Dialog */}
      <JobFormDialog
        open={editJob !== null}
        onOpenChange={(open) => { if (!open) setEditJob(null); }}
        editJob={editJob}
        onSaved={() => { setEditJob(null); fetchJobs(); }}
      />

      {/* Execution History Dialog */}
      <ExecutionHistoryDialog
        job={historyJob}
        open={historyJob !== null}
        onOpenChange={(open) => { if (!open) setHistoryJob(null); }}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cron Job</AlertDialogTitle>
            <AlertDialogDescription>This scheduled task and all its execution logs will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && handleDelete(deleteId)}
              disabled={deleting}
            >
              {deleting && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
