import { create } from 'zustand';

export type ThemeStyle = 'default' | 'emerald' | 'rose' | 'ocean';
export type SidebarView = 'chat' | 'dashboard' | 'tools' | 'skills' | 'sessions' | 'memory' | 'settings' | 'cronjobs';

/** A tracked tool call within an assistant message. */
export interface ToolCallEntry {
  id: string;
  name: string;
  args: string;
  status: 'running' | 'done' | 'error';
  result?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  /** Accumulated reasoning / thinking text (rendered in collapsible block). */
  reasoning: string;
  /** Tool calls tracked during this message's generation. */
  toolCallEntries: ToolCallEntry[];
  tokens?: number;
  duration?: number;
  createdAt?: Date;
  isStreaming?: boolean;
}

interface AppState {
  currentView: SidebarView;
  setCurrentView: (view: SidebarView) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  themeStyle: ThemeStyle;
  setThemeStyle: (style: ThemeStyle) => void;

  chatSessions: { id: string; title: string; model: string }[];
  currentSessionId: string | null;
  chatMessages: ChatMessage[];
  isStreaming: boolean;
  setCurrentSessionId: (id: string | null) => void;
  addChatMessage: (message: ChatMessage) => void;
  updateLastAssistantMessage: (content: string) => void;
  /** Append reasoning text to the last assistant message. */
  appendReasoning: (text: string) => void;
  /** Add or update a tool call entry on the last assistant message. */
  upsertToolCall: (entry: ToolCallEntry) => void;
  /** Mark the latest running tool call as done with a result. */
  completeToolCall: (id: string, result: string) => void;
  setIsStreaming: (streaming: boolean) => void;
  setChatSessions: (sessions: { id: string; title: string; model: string }[]) => void;
  clearMessages: () => void;

  agentStatus: 'connected' | 'disconnected' | 'error';
  setAgentStatus: (status: 'connected' | 'disconnected' | 'error') => void;
  hermesUrl: string;
  setHermesUrl: (url: string) => void;

  selectedModel: string;
  setSelectedModel: (model: string) => void;
  availableModels: string[];
  setAvailableModels: (models: string[]) => void;

  hermesApiKey: string;
  setHermesApiKey: (key: string) => void;
  hermesModels: { id: string; owned_by: string }[];
  setHermesModels: (models: { id: string; owned_by: string }[]) => void;

  settings: Record<string, string>;
  updateSetting: (key: string, value: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentView: 'chat',
  setCurrentView: (view) => set({ currentView: view }),
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  themeStyle: 'default',
  setThemeStyle: (style) => {
    set({ themeStyle: style });
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', style);
    }
  },

  chatSessions: [],
  currentSessionId: null,
  chatMessages: [],
  isStreaming: false,
  setCurrentSessionId: (id) => set({ currentSessionId: id }),
  addChatMessage: (message) =>
    set((s) => ({ chatMessages: [...s.chatMessages, message] })),
  updateLastAssistantMessage: (content) =>
    set((s) => {
      const msgs = [...s.chatMessages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i] = { ...msgs[i], content };
          break;
        }
      }
      return { chatMessages: msgs };
    }),
  appendReasoning: (text) =>
    set((s) => {
      const msgs = [...s.chatMessages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i] = { ...msgs[i], reasoning: (msgs[i].reasoning || '') + text };
          break;
        }
      }
      return { chatMessages: msgs };
    }),
  upsertToolCall: (entry) =>
    set((s) => {
      const msgs = [...s.chatMessages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          const existing = msgs[i].toolCallEntries || [];
          const idx = existing.findIndex((t) => t.id === entry.id);
          if (idx >= 0) {
            existing[idx] = { ...existing[idx], ...entry };
          } else {
            existing.push(entry);
          }
          msgs[i] = { ...msgs[i], toolCallEntries: existing };
          break;
        }
      }
      return { chatMessages: msgs };
    }),
  completeToolCall: (id, result) =>
    set((s) => {
      const msgs = [...s.chatMessages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          const existing = msgs[i].toolCallEntries || [];
          const idx = existing.findIndex((t) => t.id === id);
          if (idx >= 0) {
            existing[idx] = { ...existing[idx], status: 'done' as const, result, completedAt: Date.now() };
          }
          msgs[i] = { ...msgs[i], toolCallEntries: existing };
          break;
        }
      }
      return { chatMessages: msgs };
    }),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setChatSessions: (sessions) => set({ chatSessions: sessions }),
  clearMessages: () => set({ chatMessages: [] }),

  agentStatus: 'disconnected',
  setAgentStatus: (status) => set({ agentStatus: status }),
  hermesUrl: 'http://localhost:8642',
  setHermesUrl: (url) => set({ hermesUrl: url }),

  selectedModel: 'hermes-agent',
  setSelectedModel: (model) => set({ selectedModel: model }),
  availableModels: [],
  setAvailableModels: (models) => set({ availableModels: models }),

  hermesApiKey: '',
  setHermesApiKey: (key) => set({ hermesApiKey: key }),
  hermesModels: [] as { id: string; owned_by: string }[],
  setHermesModels: (models) => set({ hermesModels: models }),

  settings: {},
  updateSetting: (key, value) =>
    set((s) => ({ settings: { ...s.settings, [key]: value } })),
}));
