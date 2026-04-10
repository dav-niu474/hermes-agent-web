'use client';

import { useState, useMemo } from 'react';
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
  X,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

// ─── Data ────────────────────────────────────────────────────────────────────

interface SkillCategory {
  id: string;
  name: string;
  count: number;
  icon: LucideIcon;
  color: string;
  bgColor: string;
}

const SKILL_CATEGORIES: SkillCategory[] = [
  { id: 'all', name: 'All Skills', count: 100, icon: Layers, color: 'text-foreground', bgColor: 'bg-muted' },
  { id: 'software-development', name: 'Development', count: 35, icon: Code, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
  { id: 'creative', name: 'Creative', count: 15, icon: Palette, color: 'text-rose-500', bgColor: 'bg-rose-500/10' },
  { id: 'research', name: 'Research', count: 12, icon: BookOpen, color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
  { id: 'productivity', name: 'Productivity', count: 10, icon: Briefcase, color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
  { id: 'devops', name: 'DevOps', count: 8, icon: Server, color: 'text-teal-500', bgColor: 'bg-teal-500/10' },
  { id: 'autonomous-ai-agents', name: 'AI Agents', count: 7, icon: Bot, color: 'text-violet-500', bgColor: 'bg-violet-500/10' },
  { id: 'smart-home', name: 'Smart Home', count: 5, icon: Home, color: 'text-lime-500', bgColor: 'bg-lime-500/10' },
  { id: 'communication', name: 'Communication', count: 4, icon: MessageCircle, color: 'text-sky-500', bgColor: 'bg-sky-500/10' },
  { id: 'security', name: 'Security', count: 4, icon: Shield, color: 'text-red-500', bgColor: 'bg-red-500/10' },
];

interface Skill {
  name: string;
  category: string;
  description: string;
  isBuiltin: boolean;
  usageCount: number;
  enabled: boolean;
}

const INITIAL_SKILLS_DATA: Skill[] = [
  { name: 'Code Review', category: 'software-development', description: 'Perform thorough code reviews with best practices feedback', isBuiltin: true, usageCount: 156, enabled: true },
  { name: 'API Builder', category: 'software-development', description: 'Generate REST API endpoints with validation and docs', isBuiltin: true, usageCount: 89, enabled: true },
  { name: 'Database Schema', category: 'software-development', description: 'Design and optimize database schemas', isBuiltin: true, usageCount: 67, enabled: true },
  { name: 'Unit Test Writer', category: 'software-development', description: 'Generate comprehensive unit tests with edge cases', isBuiltin: true, usageCount: 134, enabled: true },
  { name: 'Git Workflow', category: 'software-development', description: 'Manage git operations and branching strategies', isBuiltin: true, usageCount: 45, enabled: false },
  { name: 'Blog Post Writer', category: 'creative', description: 'Create engaging blog posts with SEO optimization', isBuiltin: true, usageCount: 78, enabled: true },
  { name: 'Story Generator', category: 'creative', description: 'Generate creative stories with plot and character development', isBuiltin: true, usageCount: 56, enabled: true },
  { name: 'Image Prompt', category: 'creative', description: 'Craft detailed image generation prompts', isBuiltin: true, usageCount: 92, enabled: true },
  { name: 'Market Research', category: 'research', description: 'Conduct market analysis and competitive research', isBuiltin: true, usageCount: 34, enabled: true },
  { name: 'Paper Summarizer', category: 'research', description: 'Summarize academic papers with key findings', isBuiltin: true, usageCount: 41, enabled: false },
  { name: 'Email Composer', category: 'productivity', description: 'Draft professional emails for various contexts', isBuiltin: true, usageCount: 123, enabled: true },
  { name: 'Meeting Notes', category: 'productivity', description: 'Organize and format meeting notes with action items', isBuiltin: true, usageCount: 67, enabled: true },
  { name: 'Dockerfile', category: 'devops', description: 'Generate optimized Dockerfiles with multi-stage builds', isBuiltin: true, usageCount: 45, enabled: true },
  { name: 'CI/CD Pipeline', category: 'devops', description: 'Create CI/CD pipelines for various platforms', isBuiltin: true, usageCount: 38, enabled: false },
  { name: 'Task Delegator', category: 'autonomous-ai-agents', description: 'Break down complex tasks for subagent delegation', isBuiltin: true, usageCount: 89, enabled: true },
  { name: 'Home Automation', category: 'smart-home', description: 'Create Home Assistant automation rules', isBuiltin: true, usageCount: 23, enabled: true },
  { name: 'Translation', category: 'communication', description: 'Translate content while preserving tone and context', isBuiltin: true, usageCount: 156, enabled: true },
  { name: 'Security Audit', category: 'security', description: 'Perform security vulnerability assessments', isBuiltin: true, usageCount: 29, enabled: false },
  { name: 'Custom Skill', category: 'creative', description: 'A user-created custom skill for specialized tasks', isBuiltin: false, usageCount: 5, enabled: true },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCategoryInfo(catId: string): SkillCategory {
  return SKILL_CATEGORIES.find((c) => c.id === catId) ?? SKILL_CATEGORIES[0];
}

// ─── Skill Detail Dialog ─────────────────────────────────────────────────────

function SkillDetailDialog({
  skill,
  open,
  onOpenChange,
  onEdit,
}: {
  skill: Skill | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEdit: (skill: Skill) => void;
}) {
  if (!skill) return null;
  const catInfo = getCategoryInfo(skill.category);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${catInfo.bgColor}`}>
              <catInfo.icon className={`size-5 ${catInfo.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base">{skill.name}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="secondary" className="text-xs">{catInfo.name}</Badge>
                {skill.isBuiltin ? (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Star className="size-2.5" /> Built-in
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Sparkles className="size-2.5" /> Custom
                  </Badge>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-foreground mb-1.5">Description</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">{skill.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/40 rounded-lg p-3 border border-border/40">
              <div className="text-xs text-muted-foreground mb-0.5">Usage Count</div>
              <div className="flex items-center gap-1.5">
                <TrendingUp className="size-3.5 text-emerald-500" />
                <span className="text-sm font-semibold text-foreground">{skill.usageCount}</span>
              </div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 border border-border/40">
              <div className="text-xs text-muted-foreground mb-0.5">Status</div>
              <div className="flex items-center gap-1.5">
                <div className={`size-2 rounded-full ${skill.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                <span className="text-sm font-semibold text-foreground">{skill.enabled ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); onEdit(skill); }}>
            <Pencil className="size-3.5" /> Edit Skill
          </Button>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
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
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingSkill: Skill | null;
  onSave: (skill: Omit<Skill, 'usageCount' | 'isBuiltin'> & { id?: string }) => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [enabled, setEnabled] = useState(true);

  const isEditing = !!editingSkill;

  const handleSave = () => {
    if (!name.trim() || !category || !description.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }
    onSave({ name: name.trim(), category, description: description.trim(), content, enabled });
    onOpenChange(false);
  };

  // Sync state when dialog opens
  const handleOpenChange = (v: boolean) => {
    if (v) {
      if (editingSkill) {
        setName(editingSkill.name);
        setCategory(editingSkill.category);
        setDescription(editingSkill.description);
        setContent('# Instructions\n\nProvide detailed instructions for this skill...');
        setEnabled(editingSkill.enabled);
      } else {
        setName('');
        setCategory('');
        setDescription('');
        setContent('# Instructions\n\nProvide detailed instructions for this skill...');
        setEnabled(true);
      }
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Skill' : 'Create New Skill'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Modify the skill configuration and instructions.'
              : 'Define a new skill that the agent can use.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 pb-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="skill-name">
                Skill Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="skill-name"
                placeholder="e.g. Code Review"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="skill-category">
                Category <span className="text-destructive">*</span>
              </Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="skill-category" className="w-full">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {SKILL_CATEGORIES.filter((c) => c.id !== 'all').map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div className="flex items-center gap-2">
                        <cat.icon className="size-3.5 text-muted-foreground" />
                        {cat.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
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

            {/* Content / Instructions */}
            <div className="space-y-2">
              <Label htmlFor="skill-content">Instructions</Label>
              <Textarea
                id="skill-content"
                placeholder="Provide detailed instructions for the agent..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                These instructions guide the agent when using this skill.
              </p>
            </div>

            {/* Enabled toggle */}
            <div className="flex items-center justify-between py-1">
              <Label htmlFor="skill-enabled" className="text-sm">Enable this skill</Label>
              <Switch id="skill-enabled" checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>
            <Plus className="size-3.5" />
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
  onToggle,
  onView,
  onEdit,
}: {
  skill: Skill;
  onToggle: (name: string) => void;
  onView: () => void;
  onEdit: () => void;
}) {
  const catInfo = getCategoryInfo(skill.category);

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
        {/* Top row: icon, badges, toggle */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${catInfo.bgColor}`}>
              <catInfo.icon className={`size-4 ${catInfo.color}`} />
            </div>
            <div className="flex flex-col gap-1">
              {skill.isBuiltin ? (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 font-normal text-muted-foreground">
                  <Star className="size-2.5" /> Built-in
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 font-normal text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800">
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
                    onClick={(e) => { e.stopPropagation(); onEdit(); }}
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
                    className="size-7 rounded-md"
                    onClick={(e) => { e.stopPropagation(); onView(); }}
                  >
                    <Eye className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View</TooltipContent>
              </Tooltip>
            </div>

            {/* Toggle */}
            <Switch
              checked={skill.enabled}
              onCheckedChange={() => onToggle(skill.name)}
              className="scale-90"
            />
          </div>
        </div>

        {/* Name */}
        <h3 className="text-sm font-semibold text-foreground mb-1 group-hover:text-primary transition-colors leading-snug">
          {skill.name}
        </h3>

        {/* Description */}
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-3">
          {skill.description}
        </p>

        {/* Bottom: category + usage */}
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-medium">
            {catInfo.name}
          </Badge>
          <div className="flex items-center gap-1 text-muted-foreground">
            <TrendingUp className="size-3" />
            <span className="text-[11px] font-medium">{skill.usageCount}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main View ───────────────────────────────────────────────────────────────

export function SkillsView() {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [skills, setSkills] = useState<Skill[]>(INITIAL_SKILLS_DATA);
  const [viewingSkill, setViewingSkill] = useState<Skill | null>(null);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const filteredSkills = useMemo(() => {
    let result = skills;
    if (categoryId !== 'all') {
      result = result.filter((s) => s.category === categoryId);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      );
    }
    return result;
  }, [skills, search, categoryId]);

  const enabledCount = skills.filter((s) => s.enabled).length;

  const handleToggle = (name: string) => {
    setSkills((prev) =>
      prev.map((s) => (s.name === name ? { ...s, enabled: !s.enabled } : s))
    );
  };

  const handleCreate = (data: Omit<Skill, 'usageCount' | 'isBuiltin'> & { id?: string }) => {
    const newSkill: Skill = {
      name: data.name,
      category: data.category,
      description: data.description,
      isBuiltin: false,
      usageCount: 0,
      enabled: data.enabled,
    };
    setSkills((prev) => [...prev, newSkill]);
    toast.success(`Skill "${data.name}" created successfully`);
  };

  const handleEdit = (data: Omit<Skill, 'usageCount' | 'isBuiltin'> & { id?: string }) => {
    if (!editingSkill) return;
    setSkills((prev) =>
      prev.map((s) =>
        s.name === editingSkill.name
          ? { ...s, name: data.name, category: data.category, description: data.description, enabled: data.enabled }
          : s
      )
    );
    toast.success(`Skill "${data.name}" updated successfully`);
    setEditingSkill(null);
  };

  const handleEditFromView = (skill: Skill) => {
    setEditingSkill(skill);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-sm px-4 sm:px-6 pt-4 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Skills Manager</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {filteredSkills.length} skill{filteredSkills.length !== 1 ? 's' : ''} &middot;{' '}
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">{enabledCount} enabled</span>
            </p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">Create Skill</span>
          </Button>
        </div>

        {/* Search + Category pills */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search skills by name or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 bg-muted/30 border-border/50"
            />
          </div>
          <ScrollArea className="w-full" orientation="horizontal">
            <div className="flex items-center gap-1.5 pb-1">
              {SKILL_CATEGORIES.map((cat) => {
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
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-4 sm:p-6">
            {filteredSkills.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
                <div className="p-3 rounded-full bg-muted/60 mb-3">
                  <Search className="size-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">No skills found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Try adjusting your search or category filter
                </p>
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                <AnimatePresence mode="popLayout">
                  {filteredSkills.map((skill) => (
                    <SkillCard
                      key={skill.name}
                      skill={skill}
                      onToggle={handleToggle}
                      onView={() => setViewingSkill(skill)}
                      onEdit={() => setEditingSkill(skill)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* View Skill Dialog */}
      <SkillDetailDialog
        skill={viewingSkill}
        open={!!viewingSkill}
        onOpenChange={(v) => !v && setViewingSkill(null)}
        onEdit={handleEditFromView}
      />

      {/* Edit Skill Dialog */}
      <SkillFormDialog
        open={!!editingSkill}
        onOpenChange={(v) => !v && setEditingSkill(null)}
        editingSkill={editingSkill}
        onSave={handleEdit}
      />

      {/* Create Skill Dialog */}
      <SkillFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        editingSkill={null}
        onSave={handleCreate}
      />
    </div>
  );
}
