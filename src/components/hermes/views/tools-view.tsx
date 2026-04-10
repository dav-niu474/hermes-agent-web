'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  LayoutGrid,
  List,
  Layers,
  Globe,
  Terminal,
  FileText,
  Monitor,
  Eye,
  Zap,
  Brain,
  MessageSquare,
  Users,
  Home,
  Clock,
  ChevronRight,
  Circle,
  ExternalLink,
  Copy,
  Check,
  Image,
  BookOpen,
  FlaskConical,
  Loader2,
  RefreshCw,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// ─── API Types ────────────────────────────────────────────────────────────────

interface ToolCategory {
  id: string;
  name: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  count: number;
}

interface Tool {
  name: string;
  description: string;
  category: string;
  toolset: string;
  emoji: string;
  parameters?: Record<string, unknown>;
  isWebCompatible: boolean;
}

interface ToolsApiResponse {
  tools: Tool[];
  categories: Record<string, { label: string; icon: string; color: string; hex: string; count: number }>;
  total: number;
  toolsets?: Record<string, unknown>;
}

// ─── Icon mapping for categories from the API ─────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  Globe,
  Terminal,
  FileText,
  Monitor,
  Eye,
  Image,
  BookOpen,
  Zap,
  Brain,
  MessageSquare,
  Users,
  Home,
  Clock,
  FlaskConical,
  Layers,
};

function getCategoryIcon(iconName: string): LucideIcon {
  return ICON_MAP[iconName] || Layers;
}

function getColorClasses(color: string): { color: string; bgColor: string } {
  const colorMap: Record<string, { color: string; bgColor: string }> = {
    emerald: { color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
    amber: { color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
    orange: { color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
    violet: { color: 'text-violet-500', bgColor: 'bg-violet-500/10' },
    rose: { color: 'text-rose-500', bgColor: 'bg-rose-500/10' },
    yellow: { color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' },
    teal: { color: 'text-teal-500', bgColor: 'bg-teal-500/10' },
    sky: { color: 'text-sky-500', bgColor: 'bg-sky-500/10' },
    fuchsia: { color: 'text-fuchsia-500', bgColor: 'bg-fuchsia-500/10' },
    lime: { color: 'text-lime-500', bgColor: 'bg-lime-500/10' },
    red: { color: 'text-red-500', bgColor: 'bg-red-500/10' },
    purple: { color: 'text-purple-500', bgColor: 'bg-purple-500/10' },
  };
  return colorMap[color] || { color: 'text-muted-foreground', bgColor: 'bg-muted' };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildCategoriesFromApi(apiCategories: ToolsApiResponse['categories']): ToolCategory[] {
  if (!apiCategories) return [];

  const allCount = Object.values(apiCategories).reduce((sum, c) => sum + c.count, 0);
  const cats: ToolCategory[] = [
    { id: 'all', name: 'All Tools', icon: Layers, count: allCount, color: 'text-foreground', bgColor: 'bg-muted' },
  ];

  for (const [key, meta] of Object.entries(apiCategories)) {
    if (meta.count === 0) continue;
    const icon = getCategoryIcon(meta.icon);
    const colors = getColorClasses(meta.color);
    cats.push({
      id: key,
      name: meta.label,
      icon,
      count: meta.count,
      color: colors.color,
      bgColor: colors.bgColor,
    });
  }

  return cats;
}

function getCategoryInfo(categories: ToolCategory[], catLabel: string): ToolCategory {
  return categories.find((c) => c.name === catLabel) || categories[0] || {
    id: 'unknown',
    name: 'Unknown',
    icon: Layers,
    count: 0,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
  };
}

// ─── Components ──────────────────────────────────────────────────────────────

function ToolDetailDialog({ tool, categories, open, onOpenChange }: {
  tool: Tool | null;
  categories: ToolCategory[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!tool) return null;

  const catInfo = getCategoryInfo(categories, tool.category);

  const handleCopy = () => {
    navigator.clipboard.writeText(tool.name);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Format parameters for display
  const paramStr = tool.parameters
    ? formatParameters(tool.parameters)
    : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', catInfo.bgColor)}>
              <catInfo.icon className={cn('size-5', catInfo.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="font-mono text-base">{tool.name}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-xs">{catInfo.name}</Badge>
                <Badge variant="outline" className="text-xs gap-1">
                  <Circle className="size-2 fill-current" />
                  {tool.isWebCompatible ? 'web' : 'local'}
                </Badge>
                <span className="text-base">{tool.emoji}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-5 pb-4">
            {/* Description */}
            <div>
              <h4 className="text-sm font-medium text-foreground mb-1.5">Description</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{tool.description}</p>
            </div>

            {/* Parameters */}
            {paramStr && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-sm font-medium text-foreground">Parameters</h4>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={handleCopy}>
                        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                        {copied ? 'Copied' : 'Copy'}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy tool name</TooltipContent>
                  </Tooltip>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 border border-border/50 max-h-48 overflow-y-auto">
                  <pre className="text-xs text-muted-foreground font-mono leading-relaxed whitespace-pre-wrap break-all">{paramStr}</pre>
                </div>
              </div>
            )}

            {/* Toolset */}
            <div>
              <h4 className="text-sm font-medium text-foreground mb-1.5">Toolset</h4>
              <Badge variant="secondary" className="text-xs font-mono">{tool.toolset}</Badge>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function formatParameters(params: Record<string, unknown>): string {
  try {
    if (params.properties) {
      const props = params.properties as Record<string, Record<string, unknown>>;
      const required = (params.required as string[]) || [];
      return Object.entries(props)
        .map(([key, val]) => {
          const type = val.type || 'any';
          const desc = (val.description as string) || '';
          const isRequired = required.includes(key);
          return `${key}: ${type}${isRequired ? '' : '?'}${desc ? ` — ${desc}` : ''}`;
        })
        .join('\n');
    }
    return JSON.stringify(params, null, 2);
  } catch {
    return String(params);
  }
}

// ─── Tool Card (Grid) ────────────────────────────────────────────────────────

function ToolCardGrid({ tool, categories, onClick }: { tool: Tool; categories: ToolCategory[]; onClick: () => void }) {
  const catInfo = getCategoryInfo(categories, tool.category);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <button
        onClick={onClick}
        className="group relative w-full text-left rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* Status dot */}
        <div className="absolute top-3 right-3">
          <span className="text-sm">{tool.emoji}</span>
        </div>

        {/* Icon */}
        <div className={cn('mb-3 p-2 rounded-lg w-fit', catInfo.bgColor, 'transition-colors')}>
          <catInfo.icon className={cn('size-4.5', catInfo.color)} />
        </div>

        {/* Name */}
        <h3 className="font-mono text-sm font-semibold text-foreground mb-1 group-hover:text-primary transition-colors truncate">
          {tool.name}
        </h3>

        {/* Description */}
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-3">
          {tool.description}
        </p>

        {/* Category badge */}
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-medium">
          {catInfo.name}
        </Badge>
      </button>
    </motion.div>
  );
}

// ─── Tool Card (List) ────────────────────────────────────────────────────────

function ToolCardList({ tool, categories, onClick }: { tool: Tool; categories: ToolCategory[]; onClick: () => void }) {
  const catInfo = getCategoryInfo(categories, tool.category);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <button
        onClick={onClick}
        className="group relative w-full text-left rounded-lg border border-border/60 bg-card px-4 py-3 shadow-sm transition-all duration-200 hover:shadow-md hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring flex items-center gap-4"
      >
        {/* Emoji */}
        <span className="text-base shrink-0">{tool.emoji}</span>

        {/* Icon */}
        <div className={cn('shrink-0 p-1.5 rounded-lg', catInfo.bgColor)}>
          <catInfo.icon className={cn('size-4', catInfo.color)} />
        </div>

        {/* Name + desc */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-mono text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
              {tool.name}
            </h3>
            {!tool.isWebCompatible && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground">local</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{tool.description}</p>
        </div>

        {/* Category badge */}
        <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0 font-medium hidden sm:inline-flex">
          {catInfo.name}
        </Badge>

        {/* Arrow */}
        <ChevronRight className="size-4 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground transition-colors" />
      </button>
    </motion.div>
  );
}

// ─── Loading State ───────────────────────────────────────────────────────────

function ToolsLoadingState() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-4 sm:p-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border/60 bg-card p-4 animate-pulse">
          <div className="h-10 w-10 bg-muted rounded-lg mb-3" />
          <div className="h-4 bg-muted rounded w-3/4 mb-2" />
          <div className="h-3 bg-muted rounded w-full mb-1" />
          <div className="h-3 bg-muted rounded w-2/3 mb-3" />
          <div className="h-5 bg-muted rounded w-16" />
        </div>
      ))}
    </div>
  );
}

// ─── Main View ───────────────────────────────────────────────────────────────

export function ToolsView() {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [categories, setCategories] = useState<ToolCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTools = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (categoryId !== 'all') params.set('category', categoryId);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/tools?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch tools');
      const data: ToolsApiResponse = await res.json();

      setTools(data.tools);
      if (!search.trim() && categoryId === 'all') {
        setCategories(buildCategoriesFromApi(data.categories));
      }
    } catch (err) {
      console.error('Failed to fetch tools:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tools');
    } finally {
      setLoading(false);
    }
  }, [categoryId, search]);

  // Initial load (all tools with categories)
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/tools');
        if (!res.ok) throw new Error('Failed to fetch tools');
        const data: ToolsApiResponse = await res.json();
        setTools(data.tools);
        setCategories(buildCategoriesFromApi(data.categories));
      } catch (err) {
        console.error('Failed to fetch tools:', err);
        setError(err instanceof Error ? err.message : 'Failed to load tools');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Re-fetch when filters change (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTools();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchTools]);

  // Client-side filtering as fallback (for search within category)
  const filteredTools = useMemo(() => {
    // If we're fetching with server-side filters, use the result directly
    // But also apply client-side search for instant feedback
    let result = tools;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
      );
    }
    return result;
  }, [tools, search]);

  const totalToolCount = categories.length > 1 ? categories[0].count : tools.length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-sm px-4 sm:px-6 pt-4 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Tools Explorer</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {filteredTools.length} tool{filteredTools.length !== 1 ? 's' : ''} available
              {totalToolCount > 0 && totalToolCount !== filteredTools.length && (
                <span className="text-muted-foreground/60"> &middot; {totalToolCount} total</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchTools} disabled={loading}>
                  <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
            <div className="flex items-center gap-1.5 bg-muted/60 rounded-lg p-0.5 border border-border/50">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="icon"
                className="size-7 rounded-md"
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid className="size-3.5" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="icon"
                className="size-7 rounded-md"
                onClick={() => setViewMode('list')}
              >
                <List className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Search + Category pills */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search tools by name or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 bg-muted/30 border-border/50"
            />
          </div>
          {categories.length > 1 && (
            <ScrollArea className="w-full" orientation="horizontal">
              <div className="flex items-center gap-1.5 pb-1">
                {categories.map((cat) => {
                  const isActive = categoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setCategoryId(cat.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-150 border ${
                        isActive
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : 'bg-background text-muted-foreground border-border/60 hover:bg-muted/60 hover:text-foreground'
                      }`}
                    >
                      <cat.icon className="size-3" />
                      <span className="hidden sm:inline">{cat.name}</span>
                      <span
                        className={`ml-0.5 size-4 rounded-full text-[10px] font-semibold flex items-center justify-center ${
                          isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {cat.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <ToolsLoadingState />
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center p-4">
            <div className="p-3 rounded-full bg-destructive/10 mb-3">
              <AlertTriangle className="size-5 text-destructive" />
            </div>
            <p className="text-sm font-medium text-foreground">Failed to load tools</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={fetchTools}>
              <RefreshCw className="size-3.5" /> Retry
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="p-4 sm:p-6">
              {filteredTools.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-20 text-center"
                >
                  <div className="p-3 rounded-full bg-muted/60 mb-3">
                    <Search className="size-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No tools found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Try adjusting your search or category filter
                  </p>
                </motion.div>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  <AnimatePresence mode="popLayout">
                    {filteredTools.map((tool) => (
                      <ToolCardGrid
                        key={tool.name}
                        tool={tool}
                        categories={categories}
                        onClick={() => setSelectedTool(tool)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="space-y-2 max-w-3xl">
                  <AnimatePresence mode="popLayout">
                    {filteredTools.map((tool) => (
                      <ToolCardList
                        key={tool.name}
                        tool={tool}
                        categories={categories}
                        onClick={() => setSelectedTool(tool)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Detail Dialog */}
      <ToolDetailDialog
        tool={selectedTool}
        categories={categories}
        open={!!selectedTool}
        onOpenChange={(v) => !v && setSelectedTool(null)}
      />
    </div>
  );
}
