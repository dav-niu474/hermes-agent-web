'use client';

import { Sidebar } from '@/components/hermes/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-dvh overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Mobile spacer for fixed header */}
          <div className="h-14 md:hidden shrink-0" />
          {/* Page content — fills remaining space, overflow handled by individual views */}
          <div className="flex-1 min-h-0 overflow-hidden relative">
            {children}
          </div>
        </main>
      </div>
      <Toaster richColors position="bottom-right" />
    </TooltipProvider>
  );
}
