'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Trash2,
  Download,
  MessageSquare,
  ArrowUpDown,
  Clock,
  ExternalLink,
  MoreHorizontal,
  Filter,
  RefreshCw,
  Loader2,
  MessageCirclePlus,
  AlertCircle,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Session {
  id: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

type SortBy = 'updatedAt' | 'createdAt' | 'messageCount' | 'model';
type SortOrder = 'desc' | 'asc';

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SessionCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <div className="size-3.5 rounded bg-muted" />
              <div className="h-4 w-3/4 rounded bg-muted" />
            </div>
            <div className="h-3 w-full rounded bg-muted" />
            <div className="flex items-center gap-2">
              <div className="h-5 w-20 rounded-full bg-muted" />
              <div className="h-3 w-12 rounded bg-muted" />
              <div className="h-3 w-20 rounded bg-muted" />
            </div>
          </div>
          <div className="size-7 rounded bg-muted shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SessionsView() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('updatedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const setCurrentSessionId = useAppStore((s) => s.setCurrentSessionId);
  const setChatSessions = useAppStore((s) => s.setChatSessions);

  // -----------------------------------------------------------------------
  // Fetch sessions from API
  // -----------------------------------------------------------------------

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/sessions');
      if (!res.ok) throw new Error(`Failed to fetch sessions (${res.status})`);
      const data: Session[] = await res.json();
      setSessions(data);
      // Sync with global store
      setChatSessions(data.map((s) => ({ id: s.id, title: s.title, model: s.model })));
    } catch (err) {
      console.error('[SessionsView] fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [setChatSessions]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // -----------------------------------------------------------------------
  // Delete session
  // -----------------------------------------------------------------------

  const handleDelete = useCallback(async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/sessions/${deleteId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      toast.success('Session deleted');
      setDeleteId(null);
      // If the deleted session was the active one, clear it
      const currentId = useAppStore.getState().currentSessionId;
      if (currentId === deleteId) {
        useAppStore.getState().setCurrentSessionId(null);
        useAppStore.getState().clearMessages();
      }
      await fetchSessions();
    } catch (err) {
      console.error('[SessionsView] delete error:', err);
      toast.error('Failed to delete session');
    } finally {
      setDeleting(false);
    }
  }, [deleteId, fetchSessions]);

  // -----------------------------------------------------------------------
  // Open session
  // -----------------------------------------------------------------------

  const handleOpenSession = useCallback((id: string) => {
    setCurrentSessionId(id);
    setCurrentView('chat');
  }, [setCurrentSessionId, setCurrentView]);

  // -----------------------------------------------------------------------
  // Filter & sort
  // -----------------------------------------------------------------------

  const filtered = useMemo(() => {
    let result = [...sessions];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) => s.title.toLowerCase().includes(q) || s.model.toLowerCase().includes(q),
      );
    }

    // Filter by status (time-based since API has no status field)
    if (statusFilter === 'recent') {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      result = result.filter((s) => new Date(s.updatedAt).getTime() > sevenDaysAgo);
    } else if (statusFilter === 'hasMessages') {
      result = result.filter((s) => s.messageCount > 0);
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'updatedAt') cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      else if (sortBy === 'createdAt') cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      else if (sortBy === 'messageCount') cmp = a.messageCount - b.messageCount;
      else cmp = a.model.localeCompare(b.model);
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [sessions, search, sortBy, sortOrder, statusFilter]);

  const toggleSort = (field: SortBy) => {
    if (sortBy === field) setSortOrder((p) => (p === 'desc' ? 'asc' : 'desc'));
    else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  // -----------------------------------------------------------------------
  // Relative time helper
  // -----------------------------------------------------------------------

  const relativeTime = (dateStr: string) => {
    const now = Date.now();
    const date = new Date(dateStr).getTime();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return format(new Date(dateStr), 'MMM d, HH:mm');
  };

  // -----------------------------------------------------------------------
  // Render: Error
  // -----------------------------------------------------------------------

  if (error && !loading) {
    return (
      <div className="flex flex-col h-full">
        <header className="shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-sm px-4 sm:px-6 pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight">Sessions</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Failed to load sessions</p>
            </div>
            <Button variant="outline" size="sm" onClick={fetchSessions} disabled={loading}>
              <RefreshCw className={cn('size-3.5 mr-1.5', loading && 'animate-spin')} />
              Retry
            </Button>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="flex flex-col items-center text-center gap-3 max-w-sm">
            <div className="p-3 rounded-full bg-destructive/10">
              <AlertCircle className="size-6 text-destructive" />
            </div>
            <p className="text-sm font-medium">Could not load sessions</p>
            <p className="text-xs text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchSessions} disabled={loading}>
              <RefreshCw className={cn('size-3.5 mr-1.5', loading && 'animate-spin')} />
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: Main
  // -----------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-sm px-4 sm:px-6 pt-4 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Sessions</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {loading
                ? 'Loading sessions...'
                : `${sessions.length} session${sessions.length !== 1 ? 's' : ''} total`}
              {!loading && search && (
                <span className="ml-1">
                  &middot; {filtered.length} match{filtered.length !== 1 ? 'es' : ''}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchSessions}
                  disabled={loading}
                  className="h-8 text-xs"
                >
                  <RefreshCw className={cn('size-3.5 mr-1.5', loading && 'animate-spin')} />
                  Refresh
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh sessions list</TooltipContent>
            </Tooltip>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-auto text-xs">
                <Filter className="size-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sessions</SelectItem>
                <SelectItem value="recent">Recent (7d)</SelectItem>
                <SelectItem value="hasMessages">Has Messages</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Search + Sort */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search sessions by title or model..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 bg-muted/30 border-border/50"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 text-xs shrink-0">
                <ArrowUpDown className="size-3.5 mr-1.5" />
                <span className="hidden sm:inline">Sort</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {([
                ['updatedAt', 'Last Updated'],
                ['createdAt', 'Created'],
                ['messageCount', 'Message Count'],
                ['model', 'Model'],
              ] as const).map(([field, label]) => (
                <DropdownMenuItem
                  key={field}
                  onClick={() => toggleSort(field as SortBy)}
                  className={cn(sortBy === field && 'font-semibold')}
                >
                  {label}
                  {sortBy === field && (
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {sortOrder === 'desc' ? '↓' : '↑'}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6 space-y-3">
          {/* Loading skeletons */}
          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <SessionCardSkeleton key={i} />
              ))}
            </div>
          )}

          {/* Session cards */}
          {!loading && (
            <AnimatePresence mode="popLayout">
              {filtered.map((session) => (
                <motion.div
                  key={session.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card
                    className="hover:shadow-md transition-all duration-200 group cursor-pointer"
                    onClick={() => handleOpenSession(session.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <MessageSquare className="size-3.5 text-muted-foreground shrink-0" />
                            <h3 className="text-sm font-semibold truncate">{session.title}</h3>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 font-normal"
                            >
                              {session.model}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <MessageSquare className="size-2.5" /> {session.messageCount} msg{session.messageCount !== 1 ? 's' : ''}
                            </span>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Clock className="size-2.5" /> {relativeTime(session.updatedAt)}
                            </span>
                          </div>
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 opacity-0 group-hover:opacity-100 shrink-0"
                            >
                              <MoreHorizontal className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenSession(session.id);
                              }}
                            >
                              <ExternalLink className="size-3.5" /> Open
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                toast.info('Export JSON — Coming soon');
                              }}
                            >
                              <Download className="size-3.5" /> Export JSON
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteId(session.id);
                              }}
                            >
                              <Trash2 className="size-3.5" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          )}

          {/* No sessions at all */}
          {!loading && sessions.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <div className="p-3 rounded-full bg-muted/60 mb-3">
                <MessageCirclePlus className="size-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No sessions yet</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Start a chat to see sessions here
              </p>
              <Button size="sm" onClick={() => setCurrentView('chat')}>
                <MessageSquare className="size-3.5 mr-1.5" />
                Start a Chat
              </Button>
            </motion.div>
          )}

          {/* Sessions exist but filtered to zero */}
          {!loading && sessions.length > 0 && filtered.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <div className="p-3 rounded-full bg-muted/60 mb-3">
                <Search className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No sessions found</p>
              <p className="text-xs text-muted-foreground mt-1">
                Try adjusting your search or filter
              </p>
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Session</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All messages in this session will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                  Deleting…
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
