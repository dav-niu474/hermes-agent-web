'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  Plus,
  Trash2,
  Play,
  Pause,
  MoreHorizontal,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Repeat,
  Zap,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
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

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  task: string;
  isEnabled: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  status: 'active' | 'paused' | 'error';
}

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

const INITIAL_JOBS: CronJob[] = [
  { id: 'c1', name: 'Daily News Summary', schedule: '0 9 * * *', task: 'Search for and summarize the latest AI/ML news from the past 24 hours. Provide a structured summary with key developments, new releases, and notable papers.', isEnabled: true, lastRunAt: new Date('2025-01-15T09:00:00'), nextRunAt: new Date('2025-01-16T09:00:00'), status: 'active' },
  { id: 'c2', name: 'Weekly Code Review', schedule: '0 10 * * 1', task: 'Review all code changes in the past week from the repository. Generate a summary of changes, potential issues, and improvement suggestions.', isEnabled: true, lastRunAt: new Date('2025-01-13T10:00:00'), nextRunAt: new Date('2025-01-20T10:00:00'), status: 'active' },
  { id: 'c3', name: 'Health Check', schedule: '0 */6 * * *', task: 'Check the health of all running services and databases. Report any issues or degraded performance.', isEnabled: true, lastRunAt: new Date('2025-01-15T06:00:00'), nextRunAt: new Date('2025-01-15T12:00:00'), status: 'active' },
  { id: 'c4', name: 'Backup Verification', schedule: '0 2 * * *', task: 'Verify that the latest database backups are valid and can be restored. Report backup status and storage usage.', isEnabled: true, lastRunAt: new Date('2025-01-15T02:00:00'), nextRunAt: new Date('2025-01-16T02:00:00'), status: 'active' },
  { id: 'c5', name: 'Log Analysis', schedule: '0 8 * * 1-5', task: 'Analyze application logs from the previous day. Identify errors, warnings, and performance anomalies.', isEnabled: false, lastRunAt: new Date('2025-01-10T08:00:00'), nextRunAt: null, status: 'paused' },
  { id: 'c6', name: 'Dependency Updates', schedule: '0 10 * * 1', task: 'Check for available updates to project dependencies. Generate a report with version changes and potential breaking changes.', isEnabled: false, lastRunAt: null, nextRunAt: null, status: 'paused' },
];

export function CronjobsView() {
  const [jobs, setJobs] = useState<CronJob[]>(INITIAL_JOBS);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newSchedule, setNewSchedule] = useState('0 9 * * *');
  const [newTask, setNewTask] = useState('');
  const [newEnabled, setNewEnabled] = useState(true);

  const activeCount = jobs.filter(j => j.isEnabled).length;

  const handleToggle = (id: string) => {
    setJobs(prev => prev.map(j => {
      if (j.id !== id) return j;
      const enabled = !j.isEnabled;
      return { ...j, isEnabled: enabled, status: enabled ? 'active' : 'paused' };
    }));
  };

  const handleCreate = () => {
    if (!newName.trim() || !newTask.trim()) {
      toast.error('Please fill in name and task');
      return;
    }
    const job: CronJob = {
      id: `c-${Date.now()}`,
      name: newName.trim(),
      schedule: newSchedule,
      task: newTask.trim(),
      isEnabled: newEnabled,
      lastRunAt: null,
      nextRunAt: newEnabled ? new Date(Date.now() + 3600000) : null,
      status: newEnabled ? 'active' : 'paused',
    };
    setJobs(prev => [job, ...prev]);
    setCreateOpen(false);
    setNewName('');
    setNewSchedule('0 9 * * *');
    setNewTask('');
    setNewEnabled(true);
    toast.success(`Cron job "${job.name}" created`);
  };

  const handleDelete = (id: string) => {
    setJobs(prev => prev.filter(j => j.id !== id));
    setDeleteId(null);
    toast.success('Cron job deleted');
  };

  const handleRunNow = (name: string) => {
    toast(`Running "${name}" now...`);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-sm px-4 sm:px-6 pt-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Cron Jobs</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {jobs.length} jobs &middot; <span className="text-emerald-600 dark:text-emerald-400 font-medium">{activeCount} active</span>
            </p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" /> New Job
          </Button>
        </div>
      </header>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6 space-y-3">
          <AnimatePresence mode="popLayout">
            {jobs.map(job => {
              const statusConfig = {
                active: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10', badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400' },
                paused: { icon: Pause, color: 'text-amber-500', bg: 'bg-amber-500/10', badgeClass: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-500/10 dark:text-amber-400' },
                error: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10', badgeClass: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-500/10 dark:text-red-400' },
              }[job.status];
              const StatusIcon = statusConfig.icon;

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
                        <div className={cn('p-2 rounded-lg shrink-0 mt-0.5', statusConfig.bg)}>
                          <StatusIcon className={cn('size-4', statusConfig.color)} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-semibold truncate">{job.name}</h3>
                            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', statusConfig.badgeClass)}>
                              {job.status}
                            </Badge>
                          </div>

                          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{job.task}</p>

                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Clock className="size-3" />
                              <code className="text-[11px] font-mono bg-muted/50 px-1.5 py-0.5 rounded">{job.schedule}</code>
                              <span className="text-[10px]">{humanReadableCron(job.schedule)}</span>
                            </div>
                            {job.lastRunAt && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                Last: {format(job.lastRunAt, 'MMM d, HH:mm')}
                              </span>
                            )}
                            {job.nextRunAt && (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                Next: {format(job.nextRunAt, 'MMM d, HH:mm')}
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
                            onCheckedChange={() => handleToggle(job.id)}
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

          {jobs.length === 0 && (
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
            <Button onClick={handleCreate}><Plus className="size-3.5 mr-1.5" /> Create Job</Button>
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
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => handleDelete(deleteId!)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
