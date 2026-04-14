'use client';

import { Sidebar } from '@/components/hermes/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-dvh overflow-hidden bg-background">
        {/* Sidebar */}
        <Sidebar />

        {/* Main content area */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
          {/* Mobile spacer for fixed header */}
          <div className="h-14 md:hidden shrink-0 bg-background/80 backdrop-blur-md" />
          {/* Page content — fills remaining space, overflow handled by individual views */}
          <div className="flex-1 min-h-0 overflow-hidden relative">
            {children}
          </div>
        </main>
      </div>
      <Toaster
        richColors
        position="bottom-right"
        toastOptions={{
          className: 'text-sm',
          style: {
            borderRadius: '12px',
          },
        }}
      />
    </TooltipProvider>
  );
}
