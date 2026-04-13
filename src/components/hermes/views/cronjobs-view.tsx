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
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  task: string;
  isEnabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
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

// ─── Main Component ──────────────────────────────────────────────────────────

export function CronjobsView() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSchedule, setNewSchedule] = useState('0 9 * * *');
  const [newTask, setNewTask] = useState('');
  const [newEnabled, setNewEnabled] = useState(true);

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
      setJobs(jobs); // rollback
      toast.error('Failed to update job');
    }
  }, [jobs]);

  // ── Create job ──

  const handleCreate = useCallback(async () => {
    if (!newName.trim() || !newTask.trim()) {
      toast.error('Please fill in name and task');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/cronjobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          schedule: newSchedule,
          task: newTask.trim(),
          isEnabled: newEnabled,
        }),
      });
      if (!res.ok) throw new Error(`Failed to create job (${res.status})`);
      const created: CronJob = await res.json();
      setJobs(prev => [created, ...prev]);
      setCreateOpen(false);
      setNewName('');
      setNewSchedule('0 9 * * *');
      setNewTask('');
      setNewEnabled(true);
      toast.success(`Cron job "${created.name}" created`);
    } catch (err) {
      console.error('[CronjobsView] create error:', err);
      toast.error('Failed to create cron job');
    } finally {
      setCreating(false);
    }
  }, [newName, newSchedule, newTask, newEnabled]);

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

  // ── Run now ──

  const handleRunNow = useCallback((name: string) => {
    toast.info(`Triggering "${name}"...`);
  }, []);

  // ── Derived state ──

  const activeCount = jobs.filter(j => j.isEnabled).length;

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
                const lastRun = formatDate(job.lastRunAt);
                const nextRun = formatDate(job.nextRunAt);

                return (
                  <motion.div
                    key={job.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Card className="hover:shadow-md transition-all duration-200 group">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          {/* Icon */}
                          <div className={cn('p-2 rounded-lg shrink-0 mt-0.5', config.bg)}>
                            <StatusIcon className={cn('size-4', config.color)} />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-sm font-semibold truncate">{job.name}</h3>
                              <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', config.badgeClass)}>
                                {status}
                              </Badge>
                            </div>

                            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{job.task}</p>

                            <div className="flex items-center gap-3 flex-wrap">
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Clock className="size-3" />
                                <code className="text-[11px] font-mono bg-muted/50 px-1.5 py-0.5 rounded">{job.schedule}</code>
                                <span className="text-[10px]">{humanReadableCron(job.schedule)}</span>
                              </div>
                              {lastRun && (
                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  Last: {lastRun}
                                </span>
                              )}
                              {nextRun && (
                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                  Next: {nextRun}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 shrink-0">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 opacity-0 group-hover:opacity-100"
                                  onClick={() => handleRunNow(job.name)}
                                >
                                  <Play className="size-3.5 text-emerald-500" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Run now</TooltipContent>
                            </Tooltip>
                            <Switch
                              checked={job.isEnabled}
                              onCheckedChange={() => handleToggle(job)}
                              className="scale-90"
                            />
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-7 opacity-0 group-hover:opacity-100">
                                  <MoreHorizontal className="size-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(job.id)}>
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
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Cron Job</DialogTitle>
            <DialogDescription>Schedule a recurring task for your agent to execute.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Job Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Daily Report" />
            </div>
            <div className="space-y-2">
              <Label>Schedule</Label>
              <Select value={newSchedule} onValueChange={setNewSchedule}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCHEDULE_PRESETS.map(p => (
                    <SelectItem key={p.value} value={p.value}>
                      <span className="font-mono text-xs mr-2">{p.value}</span>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{humanReadableCron(newSchedule)}</p>
            </div>
            <div className="space-y-2">
              <Label>Task Description</Label>
              <Textarea value={newTask} onChange={(e) => setNewTask(e.target.value)} rows={4} placeholder="Describe what the agent should do when this job runs..." />
            </div>
            <div className="flex items-center justify-between">
              <Label>Enabled</Label>
              <Switch checked={newEnabled} onCheckedChange={setNewEnabled} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              <Plus className="size-3.5 mr-1.5" /> Create Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cron Job</AlertDialogTitle>
            <AlertDialogDescription>This scheduled task will be permanently removed.</AlertDialogDescription>
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
