'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings,
  Server,
  Bot,
  Terminal,
  Brain,
  Sliders,
  Save,
  RotateCcw,
  Wifi,
  WifiOff,
  Eye,
  EyeOff,
  Cpu,
  Zap,
  Shield,
  RefreshCw,
  Key,
  Loader2,
  Check,
  AlertCircle,
  Info,
  Cloud,
  Lock,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Config response type ──────────────────────────────────────────────────────

interface AppConfig {
  model?: Record<string, unknown>;
  agent?: { max_turns?: number; gateway_timeout?: number; tool_use_enforcement?: string };
  terminal?: { backend?: string; timeout?: number; modal?: Record<string, unknown> };
  browser?: { inactivity_timeout?: number; command_timeout?: number };
  memory?: { memory_enabled?: boolean; user_profile_enabled?: boolean; memory_char_limit?: number; user_char_limit?: number };
  display?: { compact?: boolean; personality?: string; streaming?: boolean; show_reasoning?: boolean };
  compression?: { enabled?: boolean; threshold?: number; target_ratio?: number; protect_last_n?: number };
  toolsets?: string[];
  enabled_toolsets?: string[];
  disabled_toolsets?: string[];
  [key: string]: unknown;
  llm?: {
    model: string;
    provider: string;
    baseUrl: string;
    hasApiKey: boolean;
    apiMode: string;
    source: string;
  };
}

// ─── Helper: safe number ──────────────────────────────────────────────────────

function num(val: unknown, fallback: number): number {
  if (typeof val === 'number' && isFinite(val)) return val;
  if (typeof val === 'string') { const n = Number(val); return isFinite(n) ? n : fallback; }
  return fallback;
}

function bool(val: unknown, fallback: boolean): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') return val === 'true' || val === '1';
  return fallback;
}

function str(val: unknown, fallback: string): string {
  if (typeof val === 'string') return val;
  return fallback;
}

// ─── Section save wrapper ─────────────────────────────────────────────────────

async function saveConfigSection(sectionName: string, data: Record<string, unknown>) {
  const res = await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `Failed to save ${sectionName}`);
  }
  return res.json();
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function SettingsView() {
  const { hermesUrl, setHermesUrl, hermesApiKey, setHermesApiKey, hermesModels, setHermesModels, agentStatus } = useAppStore();

  // ── Loading / connection state ──
  const [urlInput, setUrlInput] = useState(hermesUrl);
  const [apiKeyInput, setApiKeyInput] = useState(hermesApiKey);
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [rawConfig, setRawConfig] = useState<AppConfig | null>(null);

  // ── Form state (each tab) ──
  const [generalSettings, setGeneralSettings] = useState({
    personality: 'kawaii',
  });

  const [modelSettings, setModelSettings] = useState({
    defaultModel: '',
    provider: 'auto',
    baseUrl: '',
    contextLength: 128000,
  });

  const [terminalSettings, setTerminalSettings] = useState({
    backend: 'local',
    timeout: 180,
  });

  const [modalSettings, setModalSettings] = useState({
    tokenId: '',
    tokenSecret: '',
    appName: 'hermes-sandbox',
    image: 'ghcr.io/modal-labs/example-image',
    cpu: 1,
    memory: 512,
    idleTimeout: 300,
    showTokenSecret: false,
  });

  const [memorySettings, setMemorySettings] = useState({
    memoryEnabled: true,
    userProfileEnabled: true,
    memoryCharLimit: 2200,
    userCharLimit: 1375,
  });

  const [advancedSettings, setAdvancedSettings] = useState({
    maxTurns: 90,
    gatewayTimeout: 1800,
    toolUseEnforcement: 'auto',
    compressionEnabled: true,
    compressionThreshold: 50,
    protectLastN: 20,
    displayCompact: false,
    showReasoning: false,
  });

  // ── Load config on mount ──
  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config');
      const config: AppConfig = await res.json();

      setRawConfig(config);

      // General / Display
      const display = config.display as Record<string, unknown> || {};
      setGeneralSettings({
        personality: str(display.personality, 'kawaii'),
      });

      // Model
      const modelCfg = config.model as Record<string, unknown> || {};
      setModelSettings({
        defaultModel: str(modelCfg.default, ''),
        provider: str(modelCfg.provider, 'auto'),
        baseUrl: str(modelCfg.base_url, ''),
        contextLength: num(modelCfg.context_length, 128000),
      });

      // Terminal
      const termCfg = config.terminal as Record<string, unknown> || {};
      setTerminalSettings({
        backend: str(termCfg.backend, 'local'),
        timeout: num(termCfg.timeout, 180),
      });

      // Modal
      const modalCfg = termCfg.modal as Record<string, unknown> || {};
      setModalSettings({
        tokenId: str(modalCfg.token_id, ''),
        tokenSecret: str(modalCfg.token_secret, ''),
        appName: str(modalCfg.app_name, 'hermes-sandbox'),
        image: str(modalCfg.image, 'ghcr.io/modal-labs/example-image'),
        cpu: num(modalCfg.cpu, 1),
        memory: num(modalCfg.memory, 512),
        idleTimeout: num(modalCfg.idle_timeout, 300),
        showTokenSecret: false,
      });

      // Memory
      const memCfg = config.memory as Record<string, unknown> || {};
      setMemorySettings({
        memoryEnabled: bool(memCfg.memory_enabled, true),
        userProfileEnabled: bool(memCfg.user_profile_enabled, true),
        memoryCharLimit: num(memCfg.memory_char_limit, 2200),
        userCharLimit: num(memCfg.user_char_limit, 1375),
      });

      // Advanced
      const agentCfg = config.agent as Record<string, unknown> || {};
      const compCfg = config.compression as Record<string, unknown> || {};
      setAdvancedSettings({
        maxTurns: num(agentCfg.max_turns, 90),
        gatewayTimeout: num(agentCfg.gateway_timeout, 1800),
        toolUseEnforcement: str(agentCfg.tool_use_enforcement, 'auto'),
        compressionEnabled: bool(compCfg.enabled, true),
        compressionThreshold: Math.round(num(compCfg.threshold, 0.5) * 100),
        protectLastN: num(compCfg.protect_last_n, 20),
        displayCompact: bool(display.compact, false),
        showReasoning: bool(display.show_reasoning, false),
      });

      setConfigLoaded(true);
    } catch (err) {
      console.error('[Settings] Failed to load config:', err);
      setConfigLoaded(true); // still show UI
      toast.error('Failed to load agent configuration');
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // ── Section save handlers ──

  const handleSaveConnection = async () => {
    setSavingSection('connection');
    try {
      const res = await fetch('/api/hermes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hermes_url: urlInput, hermes_api_key: apiKeyInput }),
      });
      if (!res.ok) throw new Error('Save failed');
      setHermesUrl(urlInput);
      setHermesApiKey(apiKeyInput);
      toast.success('Connection settings saved');
    } catch {
      toast.error('Failed to save connection settings');
    } finally {
      setSavingSection(null);
    }
  };

  const handleTestConnection = async () => {
    toast('Testing connection...');
    try {
      await fetch('/api/hermes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hermes_url: urlInput, hermes_api_key: apiKeyInput }),
      });
      setHermesUrl(urlInput);
      setHermesApiKey(apiKeyInput);
    } catch { /* ignore */ }
    try {
      const res = await fetch('/api/hermes');
      const data = await res.json();
      if (data.status === 'connected') {
        toast.success('Connected to Hermes Agent!');
        if (data.models) setHermesModels(data.models);
      } else {
        toast.error(`Connection failed: ${data.error || 'Agent not reachable'}`);
      }
    } catch {
      toast.error('Connection test failed');
    }
  };

  const handleRefreshModels = async () => {
    try {
      const res = await fetch('/api/hermes');
      const data = await res.json();
      if (data.models) {
        setHermesModels(data.models);
        toast.success(`Loaded ${data.models.length} models from agent`);
      }
    } catch {
      toast.error('Failed to fetch models');
    }
  };

  const handleSaveGeneral = async () => {
    setSavingSection('general');
    try {
      await saveConfigSection('General', {
        display: {
          personality: generalSettings.personality,
        },
      });
      toast.success('General settings saved');
      loadConfig(); // refresh
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingSection(null);
    }
  };

  const handleSaveModel = async () => {
    setSavingSection('model');
    try {
      const modelPayload: Record<string, unknown> = {};
      if (modelSettings.defaultModel) modelPayload.default = modelSettings.defaultModel;
      if (modelSettings.provider && modelSettings.provider !== 'auto') modelPayload.provider = modelSettings.provider;
      if (modelSettings.baseUrl) modelPayload.base_url = modelSettings.baseUrl;
      if (modelSettings.contextLength) modelPayload.context_length = modelSettings.contextLength;
      await saveConfigSection('Model', { model: modelPayload });
      toast.success('Model settings saved');
      loadConfig();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingSection(null);
    }
  };

  const handleSaveTerminal = async () => {
    setSavingSection('terminal');
    try {
      const payload: Record<string, unknown> = {
        terminal: {
          backend: terminalSettings.backend,
          timeout: terminalSettings.timeout,
        },
      };
      await saveConfigSection('Terminal', payload);
      toast.success('Terminal settings saved');
      loadConfig();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingSection(null);
    }
  };

  const handleSaveModal = async () => {
    setSavingSection('modal');
    try {
      await saveConfigSection('Modal', {
        terminal: {
          backend: 'modal',
          modal: {
            token_id: modalSettings.tokenId,
            token_secret: modalSettings.tokenSecret,
            app_name: modalSettings.appName,
            image: modalSettings.image,
            cpu: modalSettings.cpu,
            memory: modalSettings.memory,
            idle_timeout: modalSettings.idleTimeout,
          },
        },
      });
      setTerminalSettings({ ...terminalSettings, backend: 'modal' });
      toast.success('Modal sandbox settings saved');
      loadConfig();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingSection(null);
    }
  };

  const handleSaveMemory = async () => {
    setSavingSection('memory');
    try {
      await saveConfigSection('Memory', {
        memory: {
          memory_enabled: memorySettings.memoryEnabled,
          user_profile_enabled: memorySettings.userProfileEnabled,
          memory_char_limit: memorySettings.memoryCharLimit,
          user_char_limit: memorySettings.userCharLimit,
        },
      });
      toast.success('Memory settings saved');
      loadConfig();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingSection(null);
    }
  };

  const handleSaveAdvanced = async () => {
    setSavingSection('advanced');
    try {
      await saveConfigSection('Advanced', {
        agent: {
          max_turns: advancedSettings.maxTurns,
          gateway_timeout: advancedSettings.gatewayTimeout,
          tool_use_enforcement: advancedSettings.toolUseEnforcement,
        },
        compression: {
          enabled: advancedSettings.compressionEnabled,
          threshold: advancedSettings.compressionThreshold / 100,
          protect_last_n: advancedSettings.protectLastN,
        },
        display: {
          compact: advancedSettings.displayCompact,
          show_reasoning: advancedSettings.showReasoning,
        },
      });
      toast.success('Advanced settings saved');
      loadConfig();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingSection(null);
    }
  };

  const handleResetDefaults = async () => {
    setSavingSection('advanced');
    try {
      await saveConfigSection('Defaults', {
        agent: { max_turns: 90, gateway_timeout: 1800, tool_use_enforcement: 'auto' },
        compression: { enabled: true, threshold: 0.5, target_ratio: 0.2, protect_last_n: 20 },
        display: { compact: false, personality: 'kawaii', streaming: false, show_reasoning: false },
        terminal: { backend: 'local', timeout: 180 },
        memory: { memory_enabled: true, user_profile_enabled: true, memory_char_limit: 2200, user_char_limit: 1375 },
      });
      toast.success('Settings reset to defaults');
      loadConfig();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset');
    } finally {
      setSavingSection(null);
    }
  };

  // ── Reusable SaveButton ──

  const SaveButton = ({ section, label = 'Save', variant = 'default' }: { section: string; label?: string; variant?: 'default' | 'outline' }) => (
    <Button
      size="sm"
      variant={variant}
      disabled={savingSection !== null}
      onClick={() => {
        switch (section) {
          case 'connection': handleSaveConnection(); break;
          case 'general': handleSaveGeneral(); break;
          case 'model': handleSaveModel(); break;
          case 'terminal': handleSaveTerminal(); break;
          case 'modal': handleSaveModal(); break;
          case 'memory': handleSaveMemory(); break;
          case 'advanced': handleSaveAdvanced(); break;
        }
      }}
      className="gap-1.5"
    >
      {savingSection === section ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Save className="size-3.5" />
      )}
      {label}
    </Button>
  );

  // ── Config source badge ──

  const SourceBadge = () => {
    const source = rawConfig?.llm?.source || 'unknown';
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="text-[10px] gap-1 cursor-help">
            <Info className="size-2.5" />
            {source === 'env' ? 'From env vars' : source === 'config' ? 'From config.yaml' : source === 'override' ? 'Session override' : 'Defaults'}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-xs">
          Config is loaded from environment variables, config.yaml (~/.hermes/config.yaml), or built-in defaults. Changes here write to config.yaml.
        </TooltipContent>
      </Tooltip>
    );
  };

  // ── Render ──

  return (
    <div className="flex flex-col h-full">
      <header className="shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-sm px-4 sm:px-6 pt-4 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Configure agent connection, behavior, and preferences</p>
          </div>
          <SourceBadge />
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
          {!configLoaded ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <span className="ml-3 text-sm text-muted-foreground">Loading configuration...</span>
            </div>
          ) : (
            <Tabs defaultValue="general" className="space-y-6">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="general" className="text-xs gap-1"><Settings className="size-3" />General</TabsTrigger>
                <TabsTrigger value="model" className="text-xs gap-1"><Bot className="size-3" />Model</TabsTrigger>
                <TabsTrigger value="terminal" className="text-xs gap-1"><Terminal className="size-3" />Terminal</TabsTrigger>
                <TabsTrigger value="memory" className="text-xs gap-1"><Brain className="size-3" />Memory</TabsTrigger>
                <TabsTrigger value="advanced" className="text-xs gap-1"><Sliders className="size-3" />Advanced</TabsTrigger>
              </TabsList>

              {/* ─── General Tab ─── */}
              <TabsContent value="general" className="space-y-6">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Server className="size-4" /> Agent Connection
                      </CardTitle>
                      <CardDescription>Configure how the web UI connects to the Hermes Agent backend</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="hermes-url">Agent Base URL</Label>
                        <div className="flex gap-2">
                          <Input
                            id="hermes-url"
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            placeholder="http://localhost:3000"
                            className="flex-1 font-mono text-sm"
                          />
                          <Button variant="outline" size="sm" onClick={handleTestConnection} className="gap-1.5 shrink-0">
                            <Wifi className="size-3" /> Test
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-xs',
                              agentStatus === 'connected' ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800' :
                              agentStatus === 'error' ? 'border-red-300 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800' :
                              'text-muted-foreground'
                            )}
                          >
                            <div className={cn('size-1.5 rounded-full mr-1.5', agentStatus === 'connected' ? 'bg-emerald-500' : agentStatus === 'error' ? 'bg-red-500' : 'bg-muted-foreground')} />
                            {agentStatus === 'connected' ? 'Connected' : agentStatus === 'error' ? 'Error' : 'Disconnected'}
                          </Badge>
                          {rawConfig?.llm && (
                            <span className="text-[11px] text-muted-foreground font-mono">
                              {rawConfig.llm.provider}/{rawConfig.llm.model}
                            </span>
                          )}
                        </div>
                      </div>

                      <Separator />

                      <div className="space-y-2">
                        <Label htmlFor="api-key" className="flex items-center gap-2">
                          <Shield className="size-3.5 text-primary" /> API Server Key
                        </Label>
                        <p className="text-[11px] text-muted-foreground">
                          Optional bearer token for Hermes Agent API authentication
                        </p>
                        <div className="relative">
                          <Input
                            id="api-key"
                            type={showApiKey ? 'text' : 'password'}
                            value={apiKeyInput}
                            onChange={(e) => setApiKeyInput(e.target.value)}
                            placeholder="Your API server key"
                            className="pr-10 font-mono text-xs"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 size-9"
                            onClick={() => setShowApiKey(!showApiKey)}
                          >
                            {showApiKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                          </Button>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <SaveButton section="connection" label="Save & Connect" />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Zap className="size-4" /> Display & Personality
                      </CardTitle>
                      <CardDescription>Customize agent personality and display preferences</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Agent Personality</Label>
                        <Select value={generalSettings.personality} onValueChange={(v) => setGeneralSettings({ ...generalSettings, personality: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="kawaii">🌸 Kawaii</SelectItem>
                            <SelectItem value="helpful">💬 Helpful Assistant</SelectItem>
                            <SelectItem value="concise">⚡ Concise & Direct</SelectItem>
                            <SelectItem value="creative">🎨 Creative & Exploratory</SelectItem>
                            <SelectItem value="technical">🔧 Technical Expert</SelectItem>
                            <SelectItem value="formal">🎩 Formal Professional</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">Affects the system prompt tone. Takes effect on new conversations.</p>
                      </div>
                      <div className="flex justify-end">
                        <SaveButton section="general" variant="outline" />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </TabsContent>

              {/* ─── Model Tab ─── */}
              <TabsContent value="model" className="space-y-6">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Bot className="size-4" /> Model Configuration
                      </CardTitle>
                      <CardDescription>Configure the default LLM model used by the agent. Changes take effect on new conversations.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Current model status */}
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Cpu className="size-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium font-mono truncate">
                            {rawConfig?.llm?.model || 'Not configured'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Provider: <span className="font-mono">{rawConfig?.llm?.provider || 'unknown'}</span>
                            {' · '}
                            API Key: {rawConfig?.llm?.hasApiKey ? <span className="text-emerald-600">✓ Configured</span> : <span className="text-amber-600">✗ Missing</span>}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0 capitalize">{rawConfig?.llm?.apiMode?.replace('_', ' ')}</Badge>
                      </div>

                      <Separator />

                      {/* Editable fields */}
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Default Model</Label>
                          <Input
                            value={modelSettings.defaultModel}
                            onChange={(e) => setModelSettings({ ...modelSettings, defaultModel: e.target.value })}
                            placeholder="meta/llama-3.3-70b-instruct"
                            className="font-mono text-sm"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            Leave empty to use the provider&apos;s default model.
                            Examples: <code className="text-[10px] bg-muted px-1 py-0.5 rounded">meta/llama-3.3-70b-instruct</code>, <code className="text-[10px] bg-muted px-1 py-0.5 rounded">gpt-4o</code>, <code className="text-[10px] bg-muted px-1 py-0.5 rounded">claude-sonnet-4-20250514</code>
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Provider</Label>
                            <Select value={modelSettings.provider} onValueChange={(v) => setModelSettings({ ...modelSettings, provider: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="auto">Auto-detect</SelectItem>
                                <SelectItem value="nvidia">NVIDIA NIM</SelectItem>
                                <SelectItem value="openai">OpenAI</SelectItem>
                                <SelectItem value="anthropic">Anthropic</SelectItem>
                                <SelectItem value="openrouter">OpenRouter</SelectItem>
                                <SelectItem value="google">Google / Gemini</SelectItem>
                                <SelectItem value="glm">GLM / ZhipuAI</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Context Length: {modelSettings.contextLength.toLocaleString()}</Label>
                            <Slider
                              value={[modelSettings.contextLength]}
                              onValueChange={([v]) => setModelSettings({ ...modelSettings, contextLength: v })}
                              min={4096}
                              max={2000000}
                              step={4096}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Custom Base URL</Label>
                          <Input
                            value={modelSettings.baseUrl}
                            onChange={(e) => setModelSettings({ ...modelSettings, baseUrl: e.target.value })}
                            placeholder="https://api.openai.com/v1 (leave empty for default)"
                            className="font-mono text-sm"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <SaveButton section="model" />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Key className="size-4" /> API Keys (Environment)
                          </CardTitle>
                          <CardDescription className="mt-1">API keys are resolved from environment variables at startup. Set them in <code className="text-[10px] bg-muted px-1 py-0.5 rounded">~/.hermes/.env</code> or system env.</CardDescription>
                        </div>
                        <Button variant="ghost" size="sm" onClick={handleRefreshModels} className="gap-1 text-xs h-7 shrink-0">
                          <RefreshCw className="size-3" /> Refresh
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {[
                          { var: 'NVIDIA_API_KEY', provider: 'NVIDIA NIM' },
                          { var: 'OPENAI_API_KEY', provider: 'OpenAI' },
                          { var: 'ANTHROPIC_API_KEY', provider: 'Anthropic' },
                          { var: 'OPENROUTER_API_KEY', provider: 'OpenRouter' },
                          { var: 'GOOGLE_API_KEY', provider: 'Google' },
                          { var: 'GLM_API_KEY', provider: 'GLM/ZhipuAI' },
                        ].map(({ var: envVar, provider }) => (
                          <div key={envVar} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/40 bg-card">
                            <Badge variant="outline" className="text-[10px] shrink-0">{provider}</Badge>
                            <code className="text-[10px] text-muted-foreground font-mono truncate">{envVar}</code>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="size-3 text-muted-foreground shrink-0 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                Set in ~/.hermes/.env or system environment. Cannot be changed from web UI for security.
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </TabsContent>

              {/* ─── Terminal Tab ─── */}
              <TabsContent value="terminal" className="space-y-6">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Terminal className="size-4" /> Terminal Configuration
                      </CardTitle>
                      <CardDescription>Configure the terminal/shell execution backend used by the agent&apos;s terminal tool</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Execution Backend</Label>
                        <Select
                          value={terminalSettings.backend}
                          onValueChange={(v) => setTerminalSettings({ ...terminalSettings, backend: v })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="local">Local (subprocess)</SelectItem>
                            <SelectItem value="modal">Modal (Serverless)</SelectItem>
                            <SelectItem value="docker" disabled>Docker container (coming soon)</SelectItem>
                            <SelectItem value="ssh" disabled>SSH (Remote) (coming soon)</SelectItem>
                            <SelectItem value="daytona" disabled>Daytona (coming soon)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">
                          <span className="font-medium text-foreground">Current:</span> {terminalSettings.backend} —
                          {terminalSettings.backend === 'local' ? ' Commands run directly on the host machine.' :
                           terminalSettings.backend === 'modal' ? ' Commands run in Modal&apos;s cloud-based gVisor containers.' :
                           ' Backend not available.'}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label>Default Timeout: {terminalSettings.timeout}s</Label>
                        <Slider
                          value={[terminalSettings.timeout]}
                          onValueChange={([v]) => setTerminalSettings({ ...terminalSettings, timeout: v })}
                          min={30}
                          max={600}
                          step={30}
                        />
                        <p className="text-[11px] text-muted-foreground">Maximum seconds before a terminal command is auto-killed</p>
                      </div>

                      <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Note:</span> Terminal settings affect the agent&apos;s <code className="text-[10px] bg-muted px-1 py-0.5 rounded">terminal</code> and <code className="text-[10px] bg-muted px-1 py-0.5 rounded">execute_code</code> tools.
                          Changes apply to new tool invocations.
                        </p>
                      </div>

                      <div className="flex justify-end">
                        <SaveButton section="terminal" />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                {/* ─── Modal Sandbox Config (shown when backend is modal) ─── */}
                {terminalSettings.backend === 'modal' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Cloud className="size-4" /> Modal Sandbox Configuration
                        </CardTitle>
                        <CardDescription>
                          Configure Modal (modal.com) serverless sandbox for isolated command execution in gVisor containers
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Authentication */}
                        <div className="rounded-lg border border-border/50 bg-muted/30 p-3 mb-2">
                          <p className="text-xs text-muted-foreground mb-2">
                            <Lock className="size-3 inline-block mr-1" />
                            <span className="font-medium text-foreground">Authentication</span> — Get your credentials from{' '}
                            <a href="https://modal.com/settings" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">
                              modal.com/settings
                            </a>
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="modal-token-id">MODAL_TOKEN_ID</Label>
                          <Input
                            id="modal-token-id"
                            value={modalSettings.tokenId}
                            onChange={(e) => setModalSettings({ ...modalSettings, tokenId: e.target.value })}
                            placeholder="Your Modal Token ID"
                            className="font-mono text-sm"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="modal-token-secret">MODAL_TOKEN_SECRET</Label>
                          <div className="relative">
                            <Input
                              id="modal-token-secret"
                              type={modalSettings.showTokenSecret ? 'text' : 'password'}
                              value={modalSettings.tokenSecret}
                              onChange={(e) => setModalSettings({ ...modalSettings, tokenSecret: e.target.value })}
                              placeholder="Your Modal Token Secret"
                              className="pr-10 font-mono text-xs"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 size-9"
                              onClick={() => setModalSettings({ ...modalSettings, showTokenSecret: !modalSettings.showTokenSecret })}
                            >
                              {modalSettings.showTokenSecret ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                            </Button>
                          </div>
                        </div>

                        <Separator />

                        {/* App & Image */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>App Name</Label>
                            <Input
                              value={modalSettings.appName}
                              onChange={(e) => setModalSettings({ ...modalSettings, appName: e.target.value })}
                              placeholder="hermes-sandbox"
                              className="font-mono text-sm"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Container Image</Label>
                            <Input
                              value={modalSettings.image}
                              onChange={(e) => setModalSettings({ ...modalSettings, image: e.target.value })}
                              placeholder="ghcr.io/modal-labs/example-image"
                              className="font-mono text-xs"
                            />
                          </div>
                        </div>

                        <Separator />

                        {/* Resources */}
                        <div className="space-y-2">
                          <Label>CPU Cores: {modalSettings.cpu}</Label>
                          <Slider
                            value={[modalSettings.cpu]}
                            onValueChange={([v]) => setModalSettings({ ...modalSettings, cpu: v })}
                            min={0.25}
                            max={8}
                            step={0.25}
                          />
                          <p className="text-[11px] text-muted-foreground">CPU allocation per sandbox container (0.25–8 cores)</p>
                        </div>

                        <div className="space-y-2">
                          <Label>Memory: {modalSettings.memory} MB</Label>
                          <Slider
                            value={[modalSettings.memory]}
                            onValueChange={([v]) => setModalSettings({ ...modalSettings, memory: v })}
                            min={64}
                            max={8192}
                            step={64}
                          />
                          <p className="text-[11px] text-muted-foreground">RAM allocation per sandbox container (64–8192 MB)</p>
                        </div>

                        <div className="space-y-2">
                          <Label>Idle Timeout: {modalSettings.idleTimeout}s</Label>
                          <Slider
                            value={[modalSettings.idleTimeout]}
                            onValueChange={([v]) => setModalSettings({ ...modalSettings, idleTimeout: v })}
                            min={30}
                            max={3600}
                            step={30}
                          />
                          <p className="text-[11px] text-muted-foreground">Sandbox auto-stops after this many seconds of inactivity</p>
                        </div>

                        <Separator />

                        <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">Tip:</span> You can also set <code className="text-[10px] bg-muted px-1 py-0.5 rounded">MODAL_TOKEN_ID</code> and{' '}
                            <code className="text-[10px] bg-muted px-1 py-0.5 rounded">MODAL_TOKEN_SECRET</code> as environment variables{' '}
                            in <code className="text-[10px] bg-muted px-1 py-0.5 rounded">~/.hermes/.env</code>.
                            Environment variables take priority over UI settings.
                          </p>
                        </div>

                        <div className="flex justify-end">
                          <SaveButton section="modal" label="Save Modal Config" />
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </TabsContent>

              {/* ─── Memory Tab ─── */}
              <TabsContent value="memory" className="space-y-6">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Brain className="size-4" /> Memory Configuration
                      </CardTitle>
                      <CardDescription>Configure how the agent stores and retrieves information across conversations</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Persistent Memory</Label>
                          <p className="text-xs text-muted-foreground">Enable agent to store and recall long-term information in MEMORY.md</p>
                        </div>
                        <Switch
                          checked={memorySettings.memoryEnabled}
                          onCheckedChange={(v) => setMemorySettings({ ...memorySettings, memoryEnabled: v })}
                        />
                      </div>

                      <Separator />

                      <div className="flex items-center justify-between">
                        <div>
                          <Label>User Profile Modeling</Label>
                          <p className="text-xs text-muted-foreground">Enable the agent to build a user profile in USER.md across sessions</p>
                        </div>
                        <Switch
                          checked={memorySettings.userProfileEnabled}
                          onCheckedChange={(v) => setMemorySettings({ ...memorySettings, userProfileEnabled: v })}
                        />
                      </div>

                      <Separator />

                      <div className="space-y-2">
                        <Label>Memory Character Limit: {memorySettings.memoryCharLimit.toLocaleString()}</Label>
                        <Slider
                          value={[memorySettings.memoryCharLimit]}
                          onValueChange={([v]) => setMemorySettings({ ...memorySettings, memoryCharLimit: v })}
                          min={500}
                          max={8000}
                          step={100}
                        />
                        <p className="text-[11px] text-muted-foreground">Max characters the agent can store in MEMORY.md. Higher limits use more context window.</p>
                      </div>

                      <div className="space-y-2">
                        <Label>User Profile Character Limit: {memorySettings.userCharLimit.toLocaleString()}</Label>
                        <Slider
                          value={[memorySettings.userCharLimit]}
                          onValueChange={([v]) => setMemorySettings({ ...memorySettings, userCharLimit: v })}
                          min={200}
                          max={5000}
                          step={100}
                        />
                        <p className="text-[11px] text-muted-foreground">Max characters for the user profile in USER.md.</p>
                      </div>

                      <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">How it works:</span> The agent uses the <code className="text-[10px] bg-muted px-1 py-0.5 rounded">memory</code> tool to write key facts to <code className="text-[10px] bg-muted px-1 py-0.5 rounded">~/.hermes/memory/MEMORY.md</code> and <code className="text-[10px] bg-muted px-1 py-0.5 rounded">USER.md</code>. 
                          This context is injected into every new conversation&apos;s system prompt.
                        </p>
                      </div>

                      <div className="flex justify-end">
                        <SaveButton section="memory" />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </TabsContent>

              {/* ─── Advanced Tab ─── */}
              <TabsContent value="advanced" className="space-y-6">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Sliders className="size-4" /> Agent Behavior
                      </CardTitle>
                      <CardDescription>Fine-tune how the agent loop works</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Max Agent Turns: {advancedSettings.maxTurns}</Label>
                        <Slider
                          value={[advancedSettings.maxTurns]}
                          onValueChange={([v]) => setAdvancedSettings({ ...advancedSettings, maxTurns: v })}
                          min={10}
                          max={200}
                          step={10}
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Maximum iterations of the LLM → tool_call → execute → feed-back loop per conversation turn.
                          The agent receives warnings at 70% and 90% of this limit.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label>Gateway Timeout: {Math.round(advancedSettings.gatewayTimeout / 60)} minutes</Label>
                        <Slider
                          value={[advancedSettings.gatewayTimeout]}
                          onValueChange={([v]) => setAdvancedSettings({ ...advancedSettings, gatewayTimeout: v })}
                          min={300}
                          max={7200}
                          step={300}
                        />
                        <p className="text-[11px] text-muted-foreground">Maximum wall-clock time (seconds) for a single agent conversation turn before auto-timeout.</p>
                      </div>

                      <div className="space-y-2">
                        <Label>Tool Use Enforcement</Label>
                        <Select value={advancedSettings.toolUseEnforcement} onValueChange={(v) => setAdvancedSettings({ ...advancedSettings, toolUseEnforcement: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Auto (model-dependent)</SelectItem>
                            <SelectItem value="always">Always (force tool usage)</SelectItem>
                            <SelectItem value="never">Never (text-only responses)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">
                          Controls whether the agent is instructed to always use tools instead of describing actions. 
                          &quot;Auto&quot; enables enforcement only for models that tend to describe instead of act (GPT, Codex, Gemini).
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Zap className="size-4" /> Context Compression
                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">Not Yet Implemented</Badge>
                      </CardTitle>
                      <CardDescription>Control how old messages are compressed to save context window space. <span className="text-amber-600">This feature is planned but not yet implemented.</span></CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Enable Compression</Label>
                          <p className="text-xs text-muted-foreground">Summarize older messages to reduce context usage</p>
                        </div>
                        <Switch
                          checked={advancedSettings.compressionEnabled}
                          onCheckedChange={(v) => setAdvancedSettings({ ...advancedSettings, compressionEnabled: v })}
                        />
                      </div>

                      <AnimatePresence>
                        {advancedSettings.compressionEnabled && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="space-y-4 overflow-hidden"
                          >
                            <div className="space-y-2">
                              <Label>Compression Threshold: {advancedSettings.compressionThreshold}%</Label>
                              <Slider
                                value={[advancedSettings.compressionThreshold]}
                                onValueChange={([v]) => setAdvancedSettings({ ...advancedSettings, compressionThreshold: v })}
                                min={30}
                                max={80}
                                step={5}
                              />
                              <p className="text-[11px] text-muted-foreground">
                                Trigger compression when context usage reaches this percentage of the model&apos;s context window.
                              </p>
                            </div>

                            <div className="space-y-2">
                              <Label>Protect Last N Messages: {advancedSettings.protectLastN}</Label>
                              <Slider
                                value={[advancedSettings.protectLastN]}
                                onValueChange={([v]) => setAdvancedSettings({ ...advancedSettings, protectLastN: v })}
                                min={5}
                                max={50}
                                step={5}
                              />
                              <p className="text-[11px] text-muted-foreground">
                                Most recent N messages are always kept intact (never compressed).
                              </p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </CardContent>
                  </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Settings className="size-4" /> Display Options
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="flex items-center gap-2">Compact Mode
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">Planned</Badge>
                          </Label>
                          <p className="text-xs text-muted-foreground">Use more compact message display</p>
                        </div>
                        <Switch
                          checked={advancedSettings.displayCompact}
                          onCheckedChange={(v) => setAdvancedSettings({ ...advancedSettings, displayCompact: v })}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Show Reasoning</Label>
                          <p className="text-xs text-muted-foreground">Display model reasoning/thinking in responses</p>
                        </div>
                        <Switch
                          checked={advancedSettings.showReasoning}
                          onCheckedChange={(v) => setAdvancedSettings({ ...advancedSettings, showReasoning: v })}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Save + Reset */}
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" className="gap-1.5" onClick={handleResetDefaults} disabled={savingSection !== null}>
                    {savingSection === 'advanced' ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="size-3" />
                    )}
                    Reset All to Defaults
                  </Button>
                  <SaveButton section="advanced" />
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
