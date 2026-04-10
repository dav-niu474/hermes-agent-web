'use client';

import { useAppStore } from '@/store/app-store';
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

  return <ViewComponent />;
}
