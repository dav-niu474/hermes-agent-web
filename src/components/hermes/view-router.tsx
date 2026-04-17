'use client';

import { useAppStore } from '@/store/app-store';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatView } from './views/chat-view';
import { DashboardView } from './views/dashboard-view';
import { ToolsView } from './views/tools-view';
import { SkillsView } from './views/skills-view';
import { SessionsView } from './views/sessions-view';
import { MemoryView } from './views/memory-view';
import { SettingsView } from './views/settings-view';
import { CronjobsView } from './views/cronjobs-view';

const viewComponents: Record<string, React.ComponentType> = {
  chat: ChatView,
  dashboard: DashboardView,
  tools: ToolsView,
  skills: SkillsView,
  sessions: SessionsView,
  memory: MemoryView,
  settings: SettingsView,
  cronjobs: CronjobsView,
};

/** Smooth page transition animation */
const pageVariants = {
  initial: { opacity: 0, y: 6, filter: 'blur(2px)' },
  animate: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] },
  },
  exit: {
    opacity: 0,
    y: -4,
    filter: 'blur(2px)',
    transition: { duration: 0.15, ease: [0.25, 0.1, 0.25, 1] },
  },
};

export function ViewRouter() {
  const currentView = useAppStore((s) => s.currentView);
  const ViewComponent = viewComponents[currentView];

  if (!ViewComponent) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">View not found</p>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={currentView}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="h-full w-full min-h-0"
      >
        <ViewComponent />
      </motion.div>
    </AnimatePresence>
  );
}
