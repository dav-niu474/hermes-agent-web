'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Plus,
  Brain,
  Tag,
  Pencil,
  Trash2,
  MoreHorizontal,
  X,
  Lightbulb,
  User,
  Briefcase,
  Code,
  Folder,
  BookOpen,
  Filter,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface MemoryEntry {
  id: string;
  category: string;
  content: string;
  tags: string[];
  source: string;
  createdAt: Date;
}

const CATEGORIES = [
  { id: 'all', name: 'All', icon: Brain, color: 'text-foreground', bg: 'bg-muted' },
  { id: 'preference', name: 'Preferences', icon: User, color: 'text-violet-500', bg: 'bg-violet-500/10' },
  { id: 'project', name: 'Projects', icon: Briefcase, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { id: 'fact', name: 'Facts', icon: Lightbulb, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { id: 'skill', name: 'Skills', icon: Code, color: 'text-rose-500', bg: 'bg-rose-500/10' },
  { id: 'context', name: 'Context', icon: BookOpen, color: 'text-teal-500', bg: 'bg-teal-500/10' },
];

const INITIAL_MEMORIES: MemoryEntry[] = [
  { id: 'm1', category: 'preference', content: 'User prefers Python over JavaScript for scripting tasks. Comfortable with async/await patterns and type hints.', tags: ['coding', 'python', 'preference'], source: 'Session #12', createdAt: new Date('2025-01-10') },
  { id: 'm2', category: 'project', content: 'User is working on a microservices architecture using FastAPI. Services communicate via RabbitMQ. PostgreSQL for persistent storage.', tags: ['project', 'fastapi', 'microservices'], source: 'Session #15', createdAt: new Date('2025-01-12') },
  { id: 'm3', category: 'fact', content: 'User timezone is Asia/Shanghai (UTC+8). Working hours approximately 9:00-18:00 local time.', tags: ['personal', 'timezone'], source: 'Session #3', createdAt: new Date('2025-01-05') },
  { id: 'm4', category: 'skill', content: 'User has strong experience with Docker and Kubernetes. Familiar with CI/CD pipelines using GitHub Actions.', tags: ['devops', 'docker', 'k8s'], source: 'Session #8', createdAt: new Date('2025-01-08') },
  { id: 'm5', category: 'preference', content: 'User likes concise code comments and prefers self-documenting code. Avoids over-engineering solutions.', tags: ['coding', 'style'], source: 'Session #20', createdAt: new Date('2025-01-14') },
  { id: 'm6', category: 'context', content: 'Currently debugging a memory leak in a React application. The issue seems related to uncleaned event listeners in useEffect hooks.', tags: ['debugging', 'react'], source: 'Session #22', createdAt: new Date('2025-01-14') },
  { id: 'm7', category: 'project', content: 'User maintains a home automation system with Home Assistant. Has 23 devices including lights, thermostats, and security cameras.', tags: ['home', 'automation', 'ha'], source: 'Session #6', createdAt: new Date('2025-01-07') },
  { id: 'm8', category: 'fact', content: 'User uses macOS as primary development machine with VS Code and iTerm2. Also has a Linux server for deployment.', tags: ['environment', 'tools'], source: 'Session #1', createdAt: new Date('2025-01-02') },
  { id: 'm9', category: 'skill', content: 'User is learning Rust and has completed basic syntax tutorials. Interested in systems programming and WebAssembly.', tags: ['rust', 'learning'], source: 'Session #18', createdAt: new Date('2025-01-13') },
  { id: 'm10', category: 'preference', content: 'User prefers dark mode in all applications. Uses Fira Code font for coding at 14px size.', tags: ['ui', 'preference'], source: 'Session #4', createdAt: new Date('2025-01-04') },
];

function getCategoryConfig(id: string) {
  return CATEGORIES.find(c => c.id === id) || CATEGORIES[0];
}

export function MemoryView() {
  const [memories, setMemories] = useState<MemoryEntry[]>(INITIAL_MEMORIES);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [editMemory, setEditMemory] = useState<MemoryEntry | null>(null);
  const [newCat, setNewCat] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTags, setNewTags] = useState('');

  const filtered = useMemo(() => {
    let result = memories;
    if (categoryId !== 'all') result = result.filter(m => m.category === categoryId);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(m =>
        m.content.toLowerCase().includes(q) ||
        m.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return result;
  }, [memories, categoryId, search]);

  const allTags = useMemo(() => {
    const tagMap = new Map<string, number>();
    memories.forEach(m => m.tags.forEach(t => tagMap.set(t, (tagMap.get(t) || 0) + 1)));
    return Array.from(tagMap.entries()).sort((a, b) => b[1] - a[1]);
  }, [memories]);

  const stats = useMemo(() => ({
    total: memories.length,
    byCategory: CATEGORIES.slice(1).map(c => ({ ...c, count: memories.filter(m => m.category === c.id).length })),
  }), [memories]);

  const handleAdd = () => {
    if (!newContent.trim() || !newCat) {
      toast.error('Please fill in category and content');
      return;
    }
    const entry: MemoryEntry = {
      id: `m-${Date.now()}`,
      category: newCat,
      content: newContent.trim(),
      tags: newTags.split(',').map(t => t.trim()).filter(Boolean),
      source: 'Web UI',
      createdAt: new Date(),
    };
    setMemories(prev => [entry, ...prev]);
    setAddOpen(false);
    setNewCat('');
    setNewContent('');
    setNewTags('');
    toast.success('Memory added successfully');
  };

  const handleEdit = () => {
    if (!editMemory || !editMemory.content.trim()) return;
    setMemories(prev => prev.map(m => m.id === editMemory.id ? editMemory : m));
    setEditMemory(null);
    toast.success('Memory updated');
  };

  const handleDelete = (id: string) => {
    setMemories(prev => prev.filter(m => m.id !== id));
    toast.success('Memory deleted');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-sm px-4 sm:px-6 pt-4 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Memory</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {stats.total} memories stored &middot; Agent knowledge base
            </p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" /> Add Memory
          </Button>
        </div>

        {/* Category stats */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          {stats.byCategory.map(c => (
            <div key={c.id} className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs whitespace-nowrap', c.bg, 'border-border/60')}>
              <c.icon className={cn('size-3', c.color)} />
              <span className="font-medium">{c.count}</span>
              <span className="text-muted-foreground">{c.name}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search memories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 bg-muted/30 border-border/50"
            />
          </div>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="h-9 w-36">
              <Filter className="size-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tag cloud */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {allTags.slice(0, 12).map(([tag, count]) => (
              <Badge key={tag} variant="secondary" className="text-[10px] px-2 py-0 cursor-pointer hover:bg-accent" onClick={() => setSearch(tag)}>
                <Tag className="size-2 mr-1" /> {tag} ({count})
              </Badge>
            ))}
          </div>
        )}
      </header>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6 space-y-3">
          <AnimatePresence mode="popLayout">
            {filtered.map(memory => {
              const catConfig = getCategoryConfig(memory.category);
              return (
                <motion.div
                  key={memory.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className="hover:shadow-md transition-all duration-200 group">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={cn('p-2 rounded-lg shrink-0 mt-0.5', catConfig.bg)}>
                          <catConfig.icon className={cn('size-4', catConfig.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{catConfig.name}</Badge>
                            <span className="text-[10px] text-muted-foreground">{format(memory.createdAt, 'MMM d, yyyy')}</span>
                            {memory.source && (
                              <span className="text-[10px] text-muted-foreground">&middot; {memory.source}</span>
                            )}
                          </div>
                          <p className="text-sm text-foreground leading-relaxed mb-2">{memory.content}</p>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {memory.tags.map(tag => (
                              <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                                #{tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditMemory(memory)}>
                                <Pencil className="size-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => handleDelete(memory.id)}>
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

          {filtered.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20 text-center">
              <div className="p-3 rounded-full bg-muted/60 mb-3"><Brain className="size-5 text-muted-foreground" /></div>
              <p className="text-sm font-medium">No memories found</p>
              <p className="text-xs text-muted-foreground mt-1">Add memories to help the agent remember important information</p>
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* Add Memory Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Memory</DialogTitle>
            <DialogDescription>Store important information for the agent to remember across sessions.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={newCat} onValueChange={setNewCat}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.filter(c => c.id !== 'all').map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} rows={4} placeholder="What should the agent remember..." />
            </div>
            <div className="space-y-2">
              <Label>Tags (comma separated)</Label>
              <Input value={newTags} onChange={(e) => setNewTags(e.target.value)} placeholder="e.g. coding, python, preference" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd}>Add Memory</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Memory Dialog */}
      <Dialog open={!!editMemory} onOpenChange={() => setEditMemory(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Memory</DialogTitle>
            <DialogDescription>Update this memory entry.</DialogDescription>
          </DialogHeader>
          {editMemory && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={editMemory.category} onValueChange={(v) => setEditMemory({ ...editMemory, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.filter(c => c.id !== 'all').map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Content</Label>
                <Textarea value={editMemory.content} onChange={(e) => setEditMemory({ ...editMemory, content: e.target.value })} rows={4} />
              </div>
              <div className="space-y-2">
                <Label>Tags (comma separated)</Label>
                <Input value={editMemory.tags.join(', ')} onChange={(e) => setEditMemory({ ...editMemory, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMemory(null)}>Cancel</Button>
            <Button onClick={handleEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
