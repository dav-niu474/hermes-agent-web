import { create } from 'zustand';

export type ThemeStyle = 'default' | 'emerald' | 'rose' | 'ocean';
export type SidebarView = 'chat' | 'dashboard' | 'tools' | 'skills' | 'sessions' | 'memory' | 'settings' | 'cronjobs';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: string;
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
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setChatSessions: (sessions) => set({ chatSessions: sessions }),
  clearMessages: () => set({ chatMessages: [] }),

  agentStatus: 'disconnected',
  setAgentStatus: (status) => set({ agentStatus: status }),
  hermesUrl: 'http://localhost:8642',
  setHermesUrl: (url) => set({ hermesUrl: url }),

  selectedModel: 'glm-5-plus',
  setSelectedModel: (model) => set({ selectedModel: model }),
  availableModels: [],
  setAvailableModels: (models) => set({ availableModels: models }),

  settings: {},
  updateSetting: (key, value) =>
    set((s) => ({ settings: { ...s.settings, [key]: value } })),
}));
