'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Plus,
  Code,
  Palette,
  BookOpen,
  Briefcase,
  Server,
  Bot,
  Home,
  MessageCircle,
  Shield,
  Eye,
  Pencil,
  TrendingUp,
  Layers,
  Zap,
  Star,
  Sparkles,
  Loader2,
  RefreshCw,
  Trash2,
  AlertTriangle,
  FileText,
  ChevronDown,
  ChevronUp,
  Film,
  Gamepad2,
  Package,
  type LucideIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ─── API Types ────────────────────────────────────────────────────────────────

interface SkillCategory {
  id: string;
  name: string;
  count: number;
  icon: LucideIcon;
  color: string;
  bgColor: string;
}

interface Skill {
  name: string;
  category: string | null;
  description: string;
  tags: string[];
  isBuiltin: boolean;
  status: 'active' | 'disabled';
  platforms?: string[];
  content?: string;
}

interface SkillsApiResponse {
  skills: Skill[];
  total: number;
  categories: string[];
}

// ─── Category configuration (matching spec colors) ───────────────────────────

const CATEGORY_CONFIG: Record<
  string,
  { icon: LucideIcon; color: string; bgColor: string }
> = {
  'software-development': {
    icon: Code,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
  },
  creative: {
    icon: Palette,
    color: 'text-rose-500',
    bgColor: 'bg-rose-500/10',
  },
  productivity: {
    icon: Briefcase,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
  mlops: {
    icon: Server,
    color: 'text-teal-500',
    bgColor: 'bg-teal-500/10',
  },
  research: {
    icon: BookOpen,
    color: 'text-violet-500',
    bgColor: 'bg-violet-500/10',
  },
  media: {
    icon: Film,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
  },
  'autonomous-agents': {
    icon: Bot,
    color: 'text-fuchsia-500',
    bgColor: 'bg-fuchsia-500/10',
  },
  gaming: {
    icon: Gamepad2,
    color: 'text-lime-500',
    bgColor: 'bg-lime-500/10',
  },
  misc: {
    icon: Package,
    color: 'text-sky-500',
    bgColor: 'bg-sky-500/10',
  },
  devops: {
    icon: Server,
    color: 'text-teal-500',
    bgColor: 'bg-teal-500/10',
  },
  'smart-home': {
    icon: Home,
    color: 'text-lime-500',
    bgColor: 'bg-lime-500/10',
  },
  communication: {
    icon: MessageCircle,
    color: 'text-sky-500',
    bgColor: 'bg-sky-500/10',
  },
  security: {
    icon: Shield,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  'data-science': {
    icon: TrendingUp,
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10',
  },
  general: {
    icon: Layers,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
  },
};

function getCategoryInfo(
  catId: string | null,
): {
  icon: LucideIcon;
  color: string;
  bgColor: string;
  name: string;
} {
  if (!catId) {
    return {
      icon: Layers,
      color: 'text-muted-foreground',
      bgColor: 'bg-muted',
      name: 'General',
    };
  }
  const mapped = CATEGORY_CONFIG[catId];
  if (mapped) {
    return {
      ...mapped,
      name: catId.charAt(0).toUpperCase() + catId.slice(1).replace(/-/g, ' '),
    };
  }
  return {
    icon: Layers,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
    name: catId.charAt(0).toUpperCase() + catId.slice(1).replace(/-/g, ' '),
  };
}

// ─── Minimal markdown → HTML ─────────────────────────────────────────────────

function simpleMarkdown(md: string): string {
  return md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /^### (.+)$/gm,
      '<h3 class="text-sm font-semibold mt-3 mb-1">$1</h3>',
    )
    .replace(
      /^## (.+)$/gm,
      '<h2 class="text-base font-semibold mt-4 mb-1.5">$1</h2>',
    )
    .replace(
      /^# (.+)$/gm,
      '<h1 class="text-lg font-bold mt-4 mb-2">$1</h1>',
    )
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(
      /`([^`]+)`/g,
      '<code class="px-1 py-0.5 rounded bg-muted text-xs font-mono">$1</code>',
    )
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm">$1</li>')
    .replace(/\n/g, '<br />');
}

// ─── Skill Content Viewer Dialog ─────────────────────────────────────────────

function SkillContentDialog({
  skill,
  open,
  onOpenChange,
}: {
  skill: Skill | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (open && skill) {
      requestAnimationFrame(() => setLoading(true));
      fetch(`/api/skills/${encodeURIComponent(skill.name)}`)
        .then((res) => {
          if (!res.ok) throw new Error('Failed to load skill content');
          return res.json();
        })
        .then((data) => {
          setContent(data.content || 'No content available.');
        })
        .catch((err) => {
          console.error('Failed to load skill content:', err);
          setContent(
            'Failed to load skill content. The skill may not have a SKILL.md file.',
          );
        })
        .finally(() => setLoading(false));
    }
  }, [open, skill]);

  if (!skill) return null;
  const catInfo = getCategoryInfo(skill.category);

  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const frontmatter = frontmatterMatch ? frontmatterMatch[1].trim() : '';
  const body = frontmatterMatch ? frontmatterMatch[2].trim() : content;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', catInfo.bgColor)}>
              <catInfo.icon className={cn('size-5', catInfo.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base flex items-center gap-2">
                {skill.name}
                {skill.isBuiltin ? (
                  <Badge
                    variant="outline"
                    className="text-[10px] gap-0.5 font-normal"
                  >
                    <Star className="size-2.5" /> Built-in
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-[10px] gap-0.5 font-normal text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800"
                  >
                    <Sparkles className="size-2.5" /> Custom
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {skill.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Loading skill content...
              </span>
            </div>
          ) : (
            <ScrollArea className="h-full max-h-[50vh]">
              <div className="space-y-3 pr-4">
                {frontmatter && (
                  <div>
                    <button
                      onClick={() => setExpanded(!expanded)}
                      className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
                    >
                      <FileText className="size-3" />
                      <span>Metadata (YAML Frontmatter)</span>
                      {expanded ? (
                        <ChevronUp className="size-3 ml-auto" />
                      ) : (
                        <ChevronDown className="size-3 ml-auto" />
                      )}
                    </button>
                    <AnimatePresence>
                      {expanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <pre className="mt-2 p-3 rounded-lg bg-muted/50 text-xs font-mono text-foreground/80 overflow-x-auto whitespace-pre-wrap">
                            {frontmatter}
                          </pre>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {body && (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <div
                      className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap break-words"
                      dangerouslySetInnerHTML={{
                        __html: simpleMarkdown(body),
                      }}
                    />
                  </div>
                )}

                {skill.tags && skill.tags.length > 0 && (
                  <div className="pt-2 border-t border-border/60">
                    <span className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Tags
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {skill.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Skill Detail Dialog (Quick Info) ────────────────────────────────────────

function SkillDetailDialog({
  skill,
  open,
  onOpenChange,
  onViewContent,
  onEdit,
  onDelete,
  onToggle,
}: {
  skill: Skill | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onViewContent: (skill: Skill) => void;
  onEdit: (skill: Skill) => void;
  onDelete: (skill: Skill) => void;
  onToggle: (skill: Skill) => void;
}) {
  if (!skill) return null;
  const catInfo = getCategoryInfo(skill.category);
  const isEnabled = skill.status === 'active';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', catInfo.bgColor)}>
              <catInfo.icon className={cn('size-5', catInfo.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base">{skill.name}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="secondary" className="text-xs">
                  {catInfo.name}
                </Badge>
                {skill.isBuiltin ? (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Star className="size-2.5" /> Built-in
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Sparkles className="size-2.5" /> Custom
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs gap-1',
                    isEnabled
                      ? 'text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                      : 'text-muted-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'size-1.5 rounded-full',
                      isEnabled ? 'bg-emerald-500' : 'bg-muted-foreground/40',
                    )}
                  />
                  {isEnabled ? 'Active' : 'Disabled'}
                </Badge>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-foreground mb-1.5">
              Description
            </h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {skill.description}
            </p>
          </div>

          {/* Enable / Disable toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
            <div className="flex items-center gap-2">
              <Zap className={cn('size-4', isEnabled ? 'text-emerald-500' : 'text-muted-foreground/50')} />
              <Label htmlFor="skill-toggle-detail" className="text-sm">
                {isEnabled ? 'Skill is active' : 'Skill is disabled'}
              </Label>
            </div>
            <Switch
              id="skill-toggle-detail"
              checked={isEnabled}
              onCheckedChange={() => onToggle(skill)}
            />
          </div>

          {skill.tags && skill.tags.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-foreground mb-1.5">
                Tags
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {skill.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {skill.platforms && skill.platforms.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-foreground mb-1.5">
                Platforms
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {skill.platforms.map((p) => (
                  <Badge
                    key={p}
                    variant="outline"
                    className="text-xs font-mono"
                  >
                    {p}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {!skill.isBuiltin && (
            <Button
              variant="destructive"
              onClick={() => {
                onOpenChange(false);
                onDelete(skill);
              }}
              className="gap-1.5"
            >
              <Trash2 className="size-3.5" /> Delete
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onEdit(skill);
            }}
          >
            <Pencil className="size-3.5" /> Edit
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onViewContent(skill);
            }}
          >
            <FileText className="size-3.5" /> View SKILL.md
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create / Edit Skill Dialog ──────────────────────────────────────────────

function SkillFormDialog({
  open,
  onOpenChange,
  editingSkill,
  onSave,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingSkill: Skill | null;
  onSave: (data: {
    action: string;
    name: string;
    category?: string;
    description?: string;
    content?: string;
  }) => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');

  const isEditing = !!editingSkill;

  const handleSave = () => {
    if (!name.trim() || !category || !description.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }
    onSave({
      action: isEditing ? 'edit' : 'create',
      name: name.trim(),
      category,
      description: description.trim(),
      content:
        content || `# ${name.trim()}\n\n${description.trim()}`,
    });
    onOpenChange(false);
  };

  const handleOpenChange = (v: boolean) => {
    if (v) {
      if (editingSkill) {
        setName(editingSkill.name);
        setCategory(editingSkill.category || 'general');
        setDescription(editingSkill.description);
        setContent(
          `# ${editingSkill.name}\n\n${editingSkill.description}`,
        );
      } else {
        setName('');
        setCategory('');
        setDescription('');
        setContent('');
      }
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Skill' : 'Create New Skill'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Modify the skill configuration and instructions.'
              : 'Define a new skill that the agent can use.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 pb-4">
            <div className="space-y-2">
              <Label htmlFor="skill-name">
                Skill Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="skill-name"
                placeholder="e.g. code-review"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isEditing}
              />
              {isEditing && (
                <p className="text-[11px] text-muted-foreground">
                  Skill names cannot be changed after creation.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="skill-category">
                Category <span className="text-destructive">*</span>
              </Label>
              <Select
                value={category}
                onValueChange={setCategory}
                disabled={isEditing}
              >
                <SelectTrigger id="skill-category" className="w-full">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_CONFIG).map(([key, val]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <val.icon className="size-3.5 text-muted-foreground" />
                        {key.charAt(0).toUpperCase() +
                          key.slice(1).replace(/-/g, ' ')}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isEditing && (
                <p className="text-[11px] text-muted-foreground">
                  Category cannot be changed after creation.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="skill-desc">
                Description <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="skill-desc"
                placeholder="Brief description of what this skill does..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="skill-content">Instructions (SKILL.md)</Label>
              <Textarea
                id="skill-content"
                placeholder={`---\nname: my-skill\ndescription: What this skill does\ntags: [tag1, tag2]\n---\n\n# My Skill\n\nInstructions for the agent...`}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                YAML frontmatter is optional. These instructions guide the agent
                when using this skill.
              </p>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            {isEditing ? 'Save Changes' : 'Create Skill'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Skill Card ──────────────────────────────────────────────────────────────

function SkillCard({
  skill,
  onView,
  onEdit,
  onReadContent,
  onToggle,
}: {
  skill: Skill;
  onView: () => void;
  onEdit: () => void;
  onReadContent: () => void;
  onToggle: () => void;
}) {
  const catInfo = getCategoryInfo(skill.category);
  const isEnabled = skill.status === 'active';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="group relative"
    >
      <div className="relative rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-border">
        {/* Top row: icon + badges | actions */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={cn('p-1.5 rounded-lg', catInfo.bgColor)}>
              <catInfo.icon className={cn('size-4', catInfo.color)} />
            </div>
            <div className="flex flex-col gap-1">
              {skill.isBuiltin ? (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 gap-0.5 font-normal text-muted-foreground"
                >
                  <Star className="size-2.5" /> Built-in
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 gap-0.5 font-normal text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800"
                >
                  <Sparkles className="size-2.5" /> Custom
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Hover actions */}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 rounded-md"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReadContent();
                    }}
                  >
                    <FileText className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View SKILL.md</TooltipContent>
              </Tooltip>
              {!skill.isBuiltin && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 rounded-md"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit();
                      }}
                    >
                      <Pencil className="size-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 rounded-md"
                    onClick={(e) => {
                      e.stopPropagation();
                      onView();
                    }}
                  >
                    <Eye className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Details</TooltipContent>
              </Tooltip>
            </div>

            {/* Enable / Disable toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={onToggle}
                    className="scale-75 origin-right"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {isEnabled ? 'Disable skill' : 'Enable skill'}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Name */}
        <h3
          className={cn(
            'text-sm font-semibold mb-1 leading-snug transition-colors',
            isEnabled
              ? 'text-foreground group-hover:text-primary'
              : 'text-muted-foreground',
          )}
        >
          {skill.name}
        </h3>

        {/* Description */}
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-3">
          {skill.description || 'No description available'}
        </p>

        {/* Bottom: category + tags */}
        <div className="flex items-center justify-between">
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 font-medium"
          >
            {catInfo.name}
          </Badge>
          {skill.tags && skill.tags.length > 0 && (
            <div className="flex items-center gap-1">
              {skill.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded"
                >
                  {tag}
                </span>
              ))}
              {skill.tags.length > 2 && (
                <span className="text-[10px] text-muted-foreground">
                  +{skill.tags.length - 2}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Loading Skeleton State ──────────────────────────────────────────────────

function SkillsLoadingState() {
  return (
    <div className="p-4 sm:p-6">
      {/* Header skeleton */}
      <div className="mb-6 space-y-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-9 w-full max-w-md rounded-lg" />
        <div className="flex gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-7 w-24 rounded-full"
            />
          ))}
        </div>
      </div>

      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <Skeleton className="size-4 rounded" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-6 rounded-full" />
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border/60 bg-card p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-7 rounded-lg" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-4 w-9 rounded-full" />
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main View ───────────────────────────────────────────────────────────────

export function SkillsView() {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [apiCategories, setApiCategories] = useState<string[]>([]);
  const [viewingSkill, setViewingSkill] = useState<Skill | null>(null);
  const [contentSkill, setContentSkill] = useState<Skill | null>(null);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (categoryId !== 'all') params.set('category', categoryId);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/skills?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch skills');
      const data: SkillsApiResponse = await res.json();

      setSkills(data.skills);
      if (!search.trim() && categoryId === 'all') {
        setApiCategories(data.categories);
      }
    } catch (err) {
      console.error('Failed to fetch skills:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to load skills',
      );
    } finally {
      setLoading(false);
    }
  }, [categoryId, search]);

  // Initial load — fetch all skills + categories
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/skills');
        if (!res.ok) throw new Error('Failed to fetch skills');
        const data: SkillsApiResponse = await res.json();
        setSkills(data.skills);
        setApiCategories(data.categories);
      } catch (err) {
        console.error('Failed to fetch skills:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to load skills',
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Re-fetch when filters change (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSkills();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchSkills]);

  // Build category list from API data
  const categoryList: SkillCategory[] = useMemo(() => {
    const catCounts: Record<string, number> = {};
    for (const s of skills) {
      const cat = s.category || 'general';
      catCounts[cat] = (catCounts[cat] || 0) + 1;
    }

    const cats: SkillCategory[] = [
      {
        id: 'all',
        name: 'All Skills',
        count: skills.length,
        icon: Layers,
        color: 'text-foreground',
        bgColor: 'bg-muted',
      },
    ];

    for (const cat of apiCategories) {
      const info = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG['general'];
      cats.push({
        id: cat,
        name:
          cat.charAt(0).toUpperCase() + cat.slice(1).replace(/-/g, ' '),
        count: catCounts[cat] || 0,
        icon: info.icon,
        color: info.color,
        bgColor: info.bgColor,
      });
    }

    return cats;
  }, [skills, apiCategories]);

  // Derived stats
  const builtinSkills = skills.filter((s) => s.isBuiltin);
  const customSkills = skills.filter((s) => !s.isBuiltin);
  const enabledCount = skills.filter((s) => s.status === 'active').length;
  const disabledCount = skills.filter((s) => s.status === 'disabled').length;

  // ── Handlers ──

  const handleToggle = async (skill: Skill) => {
    setToggling(skill.name);
    const newStatus: Skill['status'] =
      skill.status === 'active' ? 'disabled' : 'active';
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit',
          name: skill.name,
          category: skill.category || 'general',
          description: skill.description,
          content: `# ${skill.name}\n\n${skill.description}`,
          status: newStatus,
        }),
      });

      if (!res.ok) {
        const errData = await res
          .json()
          .catch(() => ({ error: 'Unknown error' }));
        throw new Error(errData.error || 'Failed to toggle skill');
      }

      toast.success(
        `"${skill.name}" ${newStatus === 'active' ? 'enabled' : 'disabled'}`,
      );
      fetchSkills();
    } catch (err) {
      console.error('Failed to toggle skill:', err);
      toast.error(
        err instanceof Error ? err.message : 'Failed to toggle skill',
      );
    } finally {
      setToggling(null);
    }
  };

  const handleSave = async (data: {
    action: string;
    name: string;
    category?: string;
    description?: string;
    content?: string;
  }) => {
    setSaving(true);
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errData = await res
          .json()
          .catch(() => ({ error: 'Unknown error' }));
        throw new Error(errData.error || 'Failed to save skill');
      }

      toast.success(
        `Skill "${data.name}" ${data.action === 'create' ? 'created' : 'updated'} successfully`,
      );
      fetchSkills();
    } catch (err) {
      console.error('Failed to save skill:', err);
      toast.error(
        err instanceof Error ? err.message : 'Failed to save skill',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (skill: Skill) => {
    if (
      !confirm(
        `Are you sure you want to delete the skill "${skill.name}"? This cannot be undone.`,
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          name: skill.name,
          category: skill.category || 'general',
        }),
      });

      if (!res.ok) {
        const errData = await res
          .json()
          .catch(() => ({ error: 'Unknown error' }));
        throw new Error(errData.error || 'Failed to delete skill');
      }

      toast.success(`Skill "${skill.name}" deleted successfully`);
      fetchSkills();
    } catch (err) {
      console.error('Failed to delete skill:', err);
      toast.error(
        err instanceof Error ? err.message : 'Failed to delete skill',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleViewContent = (skill: Skill) => {
    setContentSkill(skill);
  };

  const handleEditFromView = (skill: Skill) => {
    setEditingSkill(skill);
  };

  // ── Render ──

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-sm px-4 sm:px-6 pt-4 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">
              Skills Manager
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {skills.length} skill{skills.length !== 1 ? 's' : ''} &middot;{' '}
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                {enabledCount} active
              </span>
              {disabledCount > 0 && (
                <>
                  {' '}
                  &middot;{' '}
                  <span className="text-muted-foreground font-medium">
                    {disabledCount} disabled
                  </span>
                </>
              )}
              {customSkills.length > 0 && (
                <>
                  {' '}
                  &middot;{' '}
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    {customSkills.length} custom
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={fetchSkills}
                  disabled={loading}
                >
                  <RefreshCw
                    className={cn(
                      'size-3.5',
                      loading && 'animate-spin',
                    )}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-3.5" />
              <span className="hidden sm:inline">Create Skill</span>
            </Button>
          </div>
        </div>

        {/* Search + Category pills */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search skills by name, description, or tags..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 bg-muted/30 border-border/50"
            />
          </div>
          {categoryList.length > 1 && (
            <ScrollArea className="w-full" orientation="horizontal">
              <div className="flex items-center gap-1.5 pb-1">
                {categoryList.map((cat) => {
                  const isActive = categoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setCategoryId(cat.id)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-150 border',
                        isActive
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : 'bg-background text-muted-foreground border-border/60 hover:bg-muted/60 hover:text-foreground',
                      )}
                    >
                      <cat.icon className="size-3" />
                      <span className="hidden sm:inline">{cat.name}</span>
                      <span
                        className={cn(
                          'ml-0.5 size-4 rounded-full text-[10px] font-semibold flex items-center justify-center',
                          isActive
                            ? 'bg-primary-foreground/20 text-primary-foreground'
                            : 'bg-muted text-muted-foreground',
                        )}
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
      <div className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <SkillsLoadingState />
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center p-4">
            <div className="p-3 rounded-full bg-destructive/10 mb-3">
              <AlertTriangle className="size-5 text-destructive" />
            </div>
            <p className="text-sm font-medium text-foreground">
              Failed to load skills
            </p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={fetchSkills}
            >
              <RefreshCw className="size-3.5" /> Retry
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="p-4 sm:p-6 space-y-8">
              {skills.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-20 text-center"
                >
                  <div className="p-3 rounded-full bg-muted/60 mb-3">
                    <Search className="size-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    No skills found
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {search.trim() || categoryId !== 'all'
                      ? 'Try adjusting your search or category filter'
                      : 'No skills have been discovered yet'}
                  </p>
                  {!search.trim() && categoryId === 'all' && (
                    <Button
                      size="sm"
                      className="mt-4 gap-1.5"
                      onClick={() => setCreateOpen(true)}
                    >
                      <Plus className="size-3.5" /> Create Your First Skill
                    </Button>
                  )}
                </motion.div>
              ) : (
                <>
                  {/* Built-in Skills Section */}
                  {builtinSkills.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Star className="size-4 text-muted-foreground" />
                        <h2 className="text-sm font-semibold text-foreground">
                          Built-in Skills
                        </h2>
                        <Badge variant="secondary" className="text-[10px]">
                          {builtinSkills.length}
                        </Badge>
                        {builtinSkills.filter(
                          (s) => s.status === 'active',
                        ).length !== builtinSkills.length && (
                          <span className="text-xs text-muted-foreground">
                            (
                            {
                              builtinSkills.filter(
                                (s) => s.status === 'active',
                              ).length
                            }{' '}
                            active)
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        <AnimatePresence mode="popLayout">
                          {builtinSkills.map((skill) => (
                            <SkillCard
                              key={skill.name}
                              skill={skill}
                              onView={() => setViewingSkill(skill)}
                              onEdit={() => setEditingSkill(skill)}
                              onReadContent={() =>
                                handleViewContent(skill)
                              }
                              onToggle={() => handleToggle(skill)}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}

                  {/* Custom Skills Section */}
                  {customSkills.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="size-4 text-amber-500" />
                        <h2 className="text-sm font-semibold text-foreground">
                          Custom Skills
                        </h2>
                        <Badge variant="secondary" className="text-[10px]">
                          {customSkills.length}
                        </Badge>
                        {customSkills.filter(
                          (s) => s.status === 'active',
                        ).length !== customSkills.length && (
                          <span className="text-xs text-muted-foreground">
                            (
                            {
                              customSkills.filter(
                                (s) => s.status === 'active',
                              ).length
                            }{' '}
                            active)
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        <AnimatePresence mode="popLayout">
                          {customSkills.map((skill) => (
                            <SkillCard
                              key={skill.name}
                              skill={skill}
                              onView={() => setViewingSkill(skill)}
                              onEdit={() => setEditingSkill(skill)}
                              onReadContent={() =>
                                handleViewContent(skill)
                              }
                              onToggle={() => handleToggle(skill)}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* View Skill Dialog (Quick Details) */}
      <SkillDetailDialog
        skill={viewingSkill}
        open={!!viewingSkill}
        onOpenChange={(v) => !v && setViewingSkill(null)}
        onViewContent={handleViewContent}
        onEdit={handleEditFromView}
        onDelete={handleDelete}
        onToggle={handleToggle}
      />

      {/* View SKILL.md Content Dialog */}
      <SkillContentDialog
        skill={contentSkill}
        open={!!contentSkill}
        onOpenChange={(v) => !v && setContentSkill(null)}
      />

      {/* Edit Skill Dialog */}
      <SkillFormDialog
        open={!!editingSkill}
        onOpenChange={(v) => !v && setEditingSkill(null)}
        editingSkill={editingSkill}
        onSave={handleSave}
        isSaving={saving}
      />

      {/* Create Skill Dialog */}
      <SkillFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        editingSkill={null}
        onSave={handleSave}
        isSaving={saving}
      />
    </div>
  );
}
