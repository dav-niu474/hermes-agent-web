'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Trash2,
  Download,
  MessageSquare,
  Calendar,
  ChevronDown,
  ArrowUpDown,
  Clock,
  ExternalLink,
  MoreHorizontal,
  Filter,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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

const MOCK_SESSIONS = [
  { id: 's1', title: 'Building REST API with FastAPI and authentication', model: 'claude-opus-4', messages: 42, createdAt: new Date('2025-01-15T10:30:00'), updatedAt: new Date('2025-01-15T11:45:00'), status: 'active' as const, preview: 'The API endpoints are set up with JWT authentication...' },
  { id: 's2', title: 'Docker Container Setup for Microservices', model: 'gpt-4o', messages: 28, createdAt: new Date('2025-01-14T09:00:00'), updatedAt: new Date('2025-01-14T10:20:00'), status: 'active' as const, preview: 'Docker compose file configured with 3 services...' },
  { id: 's3', title: 'React Component Refactoring', model: 'claude-3.5-sonnet', messages: 63, createdAt: new Date('2025-01-13T14:00:00'), updatedAt: new Date('2025-01-13T16:30:00'), status: 'archived' as const, preview: 'Refactored the dashboard into smaller composable components...' },
  { id: 's4', title: 'CI/CD Pipeline with GitHub Actions', model: 'gpt-4o', messages: 15, createdAt: new Date('2025-01-12T11:00:00'), updatedAt: new Date('2025-01-12T11:45:00'), status: 'archived' as const, preview: 'Created the workflow YAML for automated testing...' },
  { id: 's5', title: 'Performance Debugging - Memory Leaks', model: 'claude-opus-4', messages: 31, createdAt: new Date('2025-01-11T08:30:00'), updatedAt: new Date('2025-01-11T10:15:00'), status: 'archived' as const, preview: 'Identified the memory leak in the event listener cleanup...' },
  { id: 's6', title: 'Database Schema Optimization', model: 'gpt-4o', messages: 22, createdAt: new Date('2025-01-10T15:00:00'), updatedAt: new Date('2025-01-10T16:30:00'), status: 'archived' as const, preview: 'Added proper indexes and normalized the user table...' },
  { id: 's7', title: 'Web Scraping with Browser Automation', model: 'claude-3.5-sonnet', messages: 18, createdAt: new Date('2025-01-09T10:00:00'), updatedAt: new Date('2025-01-09T11:00:00'), status: 'archived' as const, preview: 'Built a scraper that navigates and extracts product data...' },
  { id: 's8', title: 'Kubernetes Deployment Configuration', model: 'claude-opus-4', messages: 35, createdAt: new Date('2025-01-08T13:00:00'), updatedAt: new Date('2025-01-08T15:00:00'), status: 'archived' as const, preview: 'Created deployment manifests with auto-scaling policies...' },
  { id: 's9', title: 'Natural Language Processing Pipeline', model: 'gpt-4o', messages: 47, createdAt: new Date('2025-01-07T09:30:00'), updatedAt: new Date('2025-01-07T12:00:00'), status: 'archived' as const, preview: 'Implemented text preprocessing, tokenization and sentiment analysis...' },
  { id: 's10', title: 'Home Automation Script with HA Integration', model: 'claude-opus-4', messages: 12, createdAt: new Date('2025-01-06T16:00:00'), updatedAt: new Date('2025-01-06T16:45:00'), status: 'archived' as const, preview: 'Created automation rules for smart lighting and climate control...' },
];

type SortBy = 'updatedAt' | 'messages' | 'model';
type SortOrder = 'desc' | 'asc';

export function SessionsView() {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('updatedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const setCurrentSessionId = useAppStore((s) => s.setCurrentSessionId);

  const filtered = useMemo(() => {
    let result = [...MOCK_SESSIONS];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(s => s.title.toLowerCase().includes(q) || s.model.toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') {
      result = result.filter(s => s.status === statusFilter);
    }
    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'updatedAt') cmp = a.updatedAt.getTime() - b.updatedAt.getTime();
      else if (sortBy === 'messages') cmp = a.messages - b.messages;
      else cmp = a.model.localeCompare(b.model);
      return sortOrder === 'desc' ? -cmp : cmp;
    });
    return result;
  }, [search, sortBy, sortOrder, statusFilter]);

  const toggleSort = (field: SortBy) => {
    if (sortBy === field) setSortOrder(p => p === 'desc' ? 'asc' : 'desc');
    else { setSortBy(field); setSortOrder('desc'); }
  };

  const handleOpenSession = (id: string) => {
    setCurrentSessionId(id);
    setCurrentView('chat');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-sm px-4 sm:px-6 pt-4 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Sessions</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {filtered.length} session{filtered.length !== 1 ? 's' : ''} found
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-auto text-xs">
                <Filter className="size-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search sessions by title or model..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 bg-muted/30 border-border/50"
          />
        </div>
      </header>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6 space-y-3">
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
                <Card className="hover:shadow-md transition-all duration-200 group cursor-pointer" onClick={() => handleOpenSession(session.id)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <MessageSquare className="size-3.5 text-muted-foreground shrink-0" />
                          <h3 className="text-sm font-semibold truncate">{session.title}</h3>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1 mb-2">{session.preview}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">{session.model}</Badge>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <MessageSquare className="size-2.5" /> {session.messages}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="size-2.5" /> {format(session.updatedAt, 'MMM d, HH:mm')}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] px-1.5 py-0',
                              session.status === 'active'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400'
                                : 'text-muted-foreground'
                            )}
                          >
                            {session.status}
                          </Badge>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="size-7 opacity-0 group-hover:opacity-100 shrink-0">
                            <MoreHorizontal className="size-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenSession(session.id); }}>
                            <ExternalLink className="size-3.5" /> Open
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Download className="size-3.5" /> Export JSON
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteId(session.id); }}>
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

          {filtered.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20 text-center">
              <div className="p-3 rounded-full bg-muted/60 mb-3">
                <Search className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No sessions found</p>
              <p className="text-xs text-muted-foreground mt-1">Try adjusting your search or filter</p>
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Session</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. All messages in this session will be permanently deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => setDeleteId(null)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
