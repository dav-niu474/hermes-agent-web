'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Plus,
  Brain,
  Pencil,
  Trash2,
  X,
  User,
  FileText,
  RefreshCw,
  Loader2,
  AlertCircle,
  HardDrive,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
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

// ── Types ──────────────────────────────────────────────────────────────────

interface MemoryEntry {
  id: string;
  type: 'memory' | 'user';
  section: string;
  preview: string;
}

interface MemoryApiResponse {
  memoryContent: string;
  userContent: string;
  memoryEntries: { section: string; preview: string }[];
  userEntries: { section: string; preview: string }[];
  memoryUsage: string;
  userUsage: string;
  memoryPath?: string;
  userPath?: string;
}

// ── Category filters ──────────────────────────────────────────────────────

const FILTER_CATEGORIES = [
  { id: 'all', name: 'All', icon: Brain, color: 'text-foreground', bg: 'bg-muted' },
  { id: 'memory', name: 'Agent Memory', icon: FileText, color: 'text-teal-500', bg: 'bg-teal-500/10' },
  { id: 'user', name: 'User Profile', icon: User, color: 'text-violet-500', bg: 'bg-violet-500/10' },
];

// ── Helpers ───────────────────────────────────────────────────────────────

function generateId(section: string, type: string): string {
  // Deterministic ID from section content + type so we can track entries
  let hash = 0;
  const str = type + ':' + section;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit int
  }
  return `mem-${Math.abs(hash).toString(36)}`;
}

function getTypeConfig(type: 'memory' | 'user') {
  return type === 'memory'
    ? { icon: FileText, label: 'Agent Memory', color: 'text-teal-500', bg: 'bg-teal-500/10', badgeVariant: 'default' as const }
    : { icon: User, label: 'User Profile', color: 'text-violet-500', bg: 'bg-violet-500/10', badgeVariant: 'secondary' as const };
}

function parseEntries(data: MemoryApiResponse): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  for (const e of data.memoryEntries) {
    entries.push({ id: generateId(e.section, 'memory'), type: 'memory', section: e.section, preview: e.preview });
  }
  for (const e of data.userEntries) {
    entries.push({ id: generateId(e.section, 'user'), type: 'user', section: e.section, preview: e.preview });
  }
  return entries;
}

// ── Skeleton card ─────────────────────────────────────────────────────────

function MemoryCardSkeleton() {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Skeleton className="size-9 rounded-lg shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-20 rounded-full" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Component ─────────────────────────────────────────────────────────────

export function MemoryView() {
  // ── State ──
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterId, setFilterId] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [addTarget, setAddTarget] = useState<'memory' | 'user'>('memory');
  const [addContent, setAddContent] = useState('');
  const [editEntry, setEditEntry] = useState<MemoryEntry | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deleteEntry, setDeleteEntry] = useState<MemoryEntry | null>(null);
  const [mutating, setMutating] = useState(false);
  const [memoryUsage, setMemoryUsage] = useState<string>('');
  const [userUsage, setUserUsage] = useState<string>('');

  // ── Fetch ──
  const fetchMemories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/memory');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const data: MemoryApiResponse = await res.json();
      setEntries(parseEntries(data));
      setMemoryUsage(data.memoryUsage || '');
      setUserUsage(data.userUsage || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  // ── Filtering ──
  const filtered = useMemo(() => {
    let result = entries;
    if (filterId !== 'all') {
      result = result.filter(e => e.type === filterId);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(e => e.section.toLowerCase().includes(q));
    }
    return result;
  }, [entries, filterId, search]);

  const stats = useMemo(() => {
    const memCount = entries.filter(e => e.type === 'memory').length;
    const usrCount = entries.filter(e => e.type === 'user').length;
    return { total: entries.length, memCount, usrCount };
  }, [entries]);

  // ── Mutation helpers ──
  async function mutateMemory(
    action: string,
    body: Record<string, unknown>,
    successMsg: string,
  ) {
    setMutating(true);
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Operation failed (${res.status})`);
      }
      toast.success(successMsg);
      await fetchMemories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setMutating(false);
    }
  }

  // ── Handlers ──
  const handleAdd = useCallback(() => {
    if (!addContent.trim()) {
      toast.error('Please enter content');
      return;
    }
    mutateMemory('add', { target: addTarget, content: addContent.trim() }, 'Memory added successfully');
    setAddOpen(false);
    setAddContent('');
    setAddTarget('memory');
  }, [addContent, addTarget]);

  const handleEdit = useCallback(() => {
    if (!editEntry || !editContent.trim()) {
      toast.error('Please enter content');
      return;
    }
    mutateMemory('replace', {
      target: editEntry.type,
      old_text: editEntry.section,
      new_content: editContent.trim(),
    }, 'Memory updated successfully');
    setEditEntry(null);
    setEditContent('');
  }, [editEntry, editContent]);

  const handleDelete = useCallback(() => {
    if (!deleteEntry) return;
    mutateMemory('remove', {
      target: deleteEntry.type,
      old_text: deleteEntry.section,
    }, 'Memory deleted successfully');
    setDeleteEntry(null);
  }, [deleteEntry]);

  const openEditDialog = useCallback((entry: MemoryEntry) => {
    setEditEntry(entry);
    setEditContent(entry.section);
  }, []);

  const openDeleteDialog = useCallback((entry: MemoryEntry) => {
    setDeleteEntry(entry);
  }, []);

  // ── Render ──
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-sm px-4 sm:px-6 pt-4 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Memory</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {loading ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="size-3 animate-spin" /> Loading...
                </span>
              ) : error ? (
                <span className="text-destructive inline-flex items-center gap-1.5">
                  <AlertCircle className="size-3" /> {error}
                </span>
              ) : (
                <>
                  {stats.total} {stats.total === 1 ? 'entry' : 'entries'} stored
                  {memoryUsage && (
                    <>&nbsp;&middot;&nbsp;<span className="text-teal-500">{memoryUsage}</span></>
                  )}
                  {userUsage && (
                    <>&nbsp;&middot;&nbsp;<span className="text-violet-500">{userUsage}</span></>
                  )}
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="size-8" onClick={fetchMemories} disabled={loading || mutating}>
                  <RefreshCw className={cn('size-3.5', (loading || mutating) && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
            <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="size-3.5" /> Add Entry
            </Button>
          </div>
        </div>

        {/* Type filter pills */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          {FILTER_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setFilterId(cat.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs whitespace-nowrap transition-all duration-150',
                filterId === cat.id
                  ? cn(cat.bg, 'border-border/80 font-medium')
                  : 'bg-transparent border-border/40 text-muted-foreground hover:bg-muted/50',
              )}
            >
              <cat.icon className={cn('size-3', cat.color)} />
              <span>{cat.name}</span>
              {!loading && (
                <Badge variant="secondary" className="ml-0.5 text-[10px] px-1.5 py-0 h-4 min-w-4 flex items-center justify-center">
                  {cat.id === 'all' ? stats.total : cat.id === 'memory' ? stats.memCount : stats.usrCount}
                </Badge>
              )}
            </button>
          ))}
        </div>

        {/* Search + filter dropdown */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search memories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 bg-muted/30 border-border/50"
            />
            {search && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 size-6 h-6"
                onClick={() => setSearch('')}
              >
                <X className="size-3" />
              </Button>
            )}
          </div>
          <Select value={filterId} onValueChange={setFilterId}>
            <SelectTrigger className="h-9 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTER_CATEGORIES.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6 space-y-3">
          {/* Loading state */}
          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <MemoryCardSkeleton key={i} />
              ))}
            </div>
          )}

          {/* Error state (non-empty) */}
          {!loading && error && entries.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <div className="p-3 rounded-full bg-destructive/10 mb-3">
                <AlertCircle className="size-5 text-destructive" />
              </div>
              <p className="text-sm font-medium">Failed to load memories</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">{error}</p>
              <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={fetchMemories}>
                <RefreshCw className="size-3" /> Try Again
              </Button>
            </motion.div>
          )}

          {/* Empty state */}
          {!loading && !error && filtered.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <div className="p-3 rounded-full bg-muted/60 mb-3">
                <Brain className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">
                {entries.length === 0 ? 'No memories yet' : 'No matching memories'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {entries.length === 0
                  ? 'Add entries to help the agent remember important information'
                  : 'Try adjusting your search or filter'}
              </p>
              {entries.length === 0 && (
                <Button size="sm" className="mt-4 gap-1.5" onClick={() => setAddOpen(true)}>
                  <Plus className="size-3.5" /> Add First Entry
                </Button>
              )}
            </motion.div>
          )}

          {/* Memory cards */}
          {!loading && (
            <AnimatePresence mode="popLayout">
              {filtered.map(entry => {
                const typeConf = getTypeConfig(entry.type);
                const Icon = typeConf.icon;
                return (
                  <motion.div
                    key={entry.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Card className="hover:shadow-md transition-all duration-200 group">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className={cn('p-2 rounded-lg shrink-0 mt-0.5', typeConf.bg)}>
                            <Icon className={cn('size-4', typeConf.color)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant={typeConf.badgeVariant} className="text-[10px] px-1.5 py-0">
                                {typeConf.label}
                              </Badge>
                            </div>
                            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
                              {entry.section}
                            </p>
                          </div>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7"
                                  onClick={() => openEditDialog(entry)}
                                >
                                  <Pencil className="size-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-destructive"
                                  onClick={() => openDeleteDialog(entry)}
                                >
                                  <Trash2 className="size-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>

      {/* ── Add Memory Dialog ── */}
      <Dialog open={addOpen} onOpenChange={(open) => {
        setAddOpen(open);
        if (!open) { setAddContent(''); setAddTarget('memory'); }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Entry</DialogTitle>
            <DialogDescription>
              Store important information for the agent to remember across sessions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Target</Label>
              <Select value={addTarget} onValueChange={(v) => setAddTarget(v as 'memory' | 'user')}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="memory">
                    <span className="flex items-center gap-2">
                      <FileText className="size-3.5 text-teal-500" /> Agent Memory
                    </span>
                  </SelectItem>
                  <SelectItem value="user">
                    <span className="flex items-center gap-2">
                      <User className="size-3.5 text-violet-500" /> User Profile
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {addTarget === 'memory'
                  ? 'Agent memory — knowledge the agent uses to improve its responses'
                  : 'User profile — information about you that personalizes interactions'}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea
                value={addContent}
                onChange={(e) => setAddContent(e.target.value)}
                rows={5}
                placeholder="What should the agent remember..."
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={mutating}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={mutating || !addContent.trim()}>
              {mutating && <Loader2 className="size-3.5 animate-spin mr-1" />}
              Add Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Memory Dialog ── */}
      <Dialog open={!!editEntry} onOpenChange={(open) => {
        if (!open) { setEditEntry(null); setEditContent(''); }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Entry</DialogTitle>
            <DialogDescription>
              Modify this memory entry. The agent will use the updated version.
            </DialogDescription>
          </DialogHeader>
          {editEntry && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {(() => { const tc = getTypeConfig(editEntry.type); return (
                  <Badge variant={tc.badgeVariant} className="text-[10px] px-1.5 py-0 gap-1">
                    <tc.icon className="size-3" /> {tc.label}
                  </Badge>
                ); })()}
              </div>
              <div className="space-y-2">
                <Label>Content</Label>
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={5}
                  className="resize-none"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditEntry(null); setEditContent(''); }} disabled={mutating}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={mutating || !editContent.trim()}>
              {mutating && <Loader2 className="size-3.5 animate-spin mr-1" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={!!deleteEntry} onOpenChange={(open) => {
        if (!open) setDeleteEntry(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this memory entry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteEntry && (
            <div className="rounded-lg bg-muted/50 border border-border/60 p-3 my-2">
              <p className="text-xs text-muted-foreground mb-1">
                {getTypeConfig(deleteEntry.type).label}
              </p>
              <p className="text-sm line-clamp-3 break-words">{deleteEntry.section}</p>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={mutating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {mutating && <Loader2 className="size-3.5 animate-spin mr-1" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
