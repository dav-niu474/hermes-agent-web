'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
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
  ChevronRight,
  Cpu,
  Zap,
  Shield,
  RefreshCw,
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

export function SettingsView() {
  const { hermesUrl, setHermesUrl, agentStatus } = useAppStore();
  const [urlInput, setUrlInput] = useState(hermesUrl);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey, setApiKey] = useState('');

  const [generalSettings, setGeneralSettings] = useState({
    sessionResetMode: 'both',
    idleTimeout: 1440,
    personality: 'helpful',
  });

  const [modelSettings, setModelSettings] = useState({
    defaultModel: 'nvidia/llama-3.1-nemotron-70b-instruct',
    smartRouting: true,
    maxSimpleChars: 160,
    cheapModel: 'nvidia/deepseek-llama3.1-8b-instruct',
    compressionModel: 'nvidia/deepseek-llama3.1-8b-instruct',
  });

  const [terminalSettings, setTerminalSettings] = useState({
    backend: 'local',
    sshHost: '',
    sshPort: 22,
    sshUser: '',
    timeout: 180,
    maxLifetime: 300,
  });

  const [memorySettings, setMemorySettings] = useState({
    enabled: true,
    userProfile: true,
    charLimit: 2200,
    nudgeInterval: 10,
    provider: 'honcho',
  });

  const [advancedSettings, setAdvancedSettings] = useState({
    maxTurns: 60,
    reasoningEffort: 'medium',
    compressionEnabled: true,
    compressionThreshold: 50,
    delegationMaxIterations: 50,
  });

  const handleSaveSection = (name: string) => {
    toast.success(`${name} settings saved`);
  };

  const handleTestConnection = async () => {
    toast('Testing connection...');
    setHermesUrl(urlInput);
  };

  return (
    <div className="flex flex-col h-full">
      <header className="shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-sm px-4 sm:px-6 pt-4 pb-4">
        <h1 className="text-xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Configure your Hermes Agent connection and preferences</p>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6 max-w-4xl mx-auto">
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
                    <CardDescription>Configure how to connect to your Hermes Agent instance</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="hermes-url">Agent URL</Label>
                      <div className="flex gap-2">
                        <Input
                          id="hermes-url"
                          value={urlInput}
                          onChange={(e) => setUrlInput(e.target.value)}
                          placeholder="http://localhost:8642"
                          className="flex-1 font-mono text-sm"
                        />
                        <Button variant="outline" size="sm" onClick={handleTestConnection} className="gap-1.5">
                          <Wifi className="size-3" /> Test
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            agentStatus === 'connected' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' :
                            agentStatus === 'error' ? 'border-red-300 bg-red-50 text-red-700' :
                            'text-muted-foreground'
                          )}
                        >
                          <div className={cn('size-1.5 rounded-full mr-1.5', agentStatus === 'connected' ? 'bg-emerald-500' : agentStatus === 'error' ? 'bg-red-500' : 'bg-muted-foreground')} />
                          {agentStatus === 'connected' ? 'Connected' : agentStatus === 'error' ? 'Error' : 'Disconnected'}
                        </Badge>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label htmlFor="nvidia-key" className="flex items-center gap-2">
                        <Zap className="size-3.5 text-amber-500" /> NVIDIA API Key
                      </Label>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        Powered by <span className="font-medium text-foreground">NVIDIA NIM</span> — Enterprise-grade AI inference
                      </p>
                      <div className="relative">
                        <Input
                          id="nvidia-key"
                          type={showApiKey ? 'text' : 'password'}
                          placeholder="nvapi-..."
                          onChange={(e) => setApiKey(e.target.value)}
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

                    <Separator />

                    <div className="space-y-2">
                      <Label htmlFor="api-key">Hermes API Key (optional)</Label>
                      <div className="relative">
                        <Input
                          id="api-key"
                          type={showApiKey ? 'text' : 'password'}
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder="Bearer token for authentication"
                          className="pr-10"
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
                      <Button size="sm" onClick={() => handleSaveSection('General')} className="gap-1.5">
                        <Save className="size-3.5" /> Save
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Session & Personality</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Session Reset Mode</Label>
                      <Select value={generalSettings.sessionResetMode} onValueChange={(v) => setGeneralSettings({ ...generalSettings, sessionResetMode: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto (idle + hourly)</SelectItem>
                          <SelectItem value="manual">Manual only</SelectItem>
                          <SelectItem value="both">Both</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Idle Timeout: {generalSettings.idleTimeout} minutes</Label>
                      <Slider value={[generalSettings.idleTimeout]} onValueChange={([v]) => setGeneralSettings({ ...generalSettings, idleTimeout: v })} min={60} max={4320} step={60} />
                    </div>
                    <div className="space-y-2">
                      <Label>Personality Preset</Label>
                      <Select value={generalSettings.personality} onValueChange={(v) => setGeneralSettings({ ...generalSettings, personality: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="helpful">Helpful Assistant</SelectItem>
                          <SelectItem value="concise">Concise & Direct</SelectItem>
                          <SelectItem value="creative">Creative & Exploratory</SelectItem>
                          <SelectItem value="technical">Technical Expert</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" onClick={() => handleSaveSection('Session')} className="gap-1.5">
                        <Save className="size-3.5" /> Save
                      </Button>
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
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Default Model</Label>
                      <Select value={modelSettings.defaultModel} onValueChange={(v) => setModelSettings({ ...modelSettings, defaultModel: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nvidia/llama-3.1-nemotron-70b-instruct">Nemotron 70B (NVIDIA)</SelectItem>
                          <SelectItem value="nvidia/llama-3.1-nemotron-ultra-253b">Nemotron Ultra 253B (NVIDIA)</SelectItem>
                          <SelectItem value="meta/llama-3.1-405b-instruct">Llama 3.1 405B (Meta)</SelectItem>
                          <SelectItem value="mistralai/mixtral-8x22b-instruct-v0.1">Mixtral 8x22B (Mistral)</SelectItem>
                          <SelectItem value="nvidia/deepseek-llama3.1-8b-instruct">DeepSeek Llama 8B (NVIDIA)</SelectItem>
                          <SelectItem value="nvidia/nemotron-4-340b-instruct">Nemotron 4 340B (NVIDIA)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Smart Model Routing</Label>
                        <p className="text-xs text-muted-foreground">Use cheaper models for simple queries</p>
                      </div>
                      <Switch checked={modelSettings.smartRouting} onCheckedChange={(v) => setModelSettings({ ...modelSettings, smartRouting: v })} />
                    </div>
                    {modelSettings.smartRouting && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3 pl-4 border-l-2 border-border/50">
                        <div className="space-y-2">
                          <Label className="text-xs">Cheap Model</Label>
                          <Select value={modelSettings.cheapModel} onValueChange={(v) => setModelSettings({ ...modelSettings, cheapModel: v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="nvidia/deepseek-llama3.1-8b-instruct">DeepSeek Llama 8B (NVIDIA)</SelectItem>
                              <SelectItem value="mistralai/mixtral-8x22b-instruct-v0.1">Mixtral 8x22B (Mistral)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Max Simple Chars: {modelSettings.maxSimpleChars}</Label>
                          <Slider value={[modelSettings.maxSimpleChars]} onValueChange={([v]) => setModelSettings({ ...modelSettings, maxSimpleChars: v })} min={50} max={500} step={10} />
                        </div>
                      </motion.div>
                    )}
                    <Separator />
                    <div className="space-y-2">
                      <Label>Compression Model (for context summarization)</Label>
                      <Select value={modelSettings.compressionModel} onValueChange={(v) => setModelSettings({ ...modelSettings, compressionModel: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nvidia/deepseek-llama3.1-8b-instruct">DeepSeek Llama 8B (NVIDIA)</SelectItem>
                          <SelectItem value="mistralai/mixtral-8x22b-instruct-v0.1">Mixtral 8x22B (Mistral)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" className="gap-1.5"><RotateCcw className="size-3" /> Reset</Button>
                      <Button size="sm" onClick={() => handleSaveSection('Model')} className="gap-1.5"><Save className="size-3.5" /> Save</Button>
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
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Execution Backend</Label>
                      <Select value={terminalSettings.backend} onValueChange={(v) => setTerminalSettings({ ...terminalSettings, backend: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="local">Local</SelectItem>
                          <SelectItem value="docker">Docker</SelectItem>
                          <SelectItem value="ssh">SSH (Remote)</SelectItem>
                          <SelectItem value="modal">Modal (Serverless)</SelectItem>
                          <SelectItem value="daytona">Daytona</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {terminalSettings.backend === 'ssh' && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="grid grid-cols-3 gap-3 pl-4 border-l-2 border-border/50">
                        <div className="space-y-1">
                          <Label className="text-xs">Host</Label>
                          <Input value={terminalSettings.sshHost} onChange={(e) => setTerminalSettings({ ...terminalSettings, sshHost: e.target.value })} placeholder="192.168.1.100" className="h-8 text-xs font-mono" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Port</Label>
                          <Input type="number" value={terminalSettings.sshPort} onChange={(e) => setTerminalSettings({ ...terminalSettings, sshPort: parseInt(e.target.value) || 22 })} className="h-8 text-xs font-mono" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">User</Label>
                          <Input value={terminalSettings.sshUser} onChange={(e) => setTerminalSettings({ ...terminalSettings, sshUser: e.target.value })} placeholder="ubuntu" className="h-8 text-xs" />
                        </div>
                      </motion.div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Default Timeout: {terminalSettings.timeout}s</Label>
                        <Slider value={[terminalSettings.timeout]} onValueChange={([v]) => setTerminalSettings({ ...terminalSettings, timeout: v })} min={30} max={600} step={30} />
                      </div>
                      <div className="space-y-2">
                        <Label>Max Lifetime: {terminalSettings.maxLifetime}s</Label>
                        <Slider value={[terminalSettings.maxLifetime]} onValueChange={([v]) => setTerminalSettings({ ...terminalSettings, maxLifetime: v })} min={60} max={3600} step={60} />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" onClick={() => handleSaveSection('Terminal')} className="gap-1.5"><Save className="size-3.5" /> Save</Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>

            {/* ─── Memory Tab ─── */}
            <TabsContent value="memory" className="space-y-6">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Brain className="size-4" /> Memory Configuration
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Persistent Memory</Label>
                        <p className="text-xs text-muted-foreground">Enable agent to store and recall information</p>
                      </div>
                      <Switch checked={memorySettings.enabled} onCheckedChange={(v) => setMemorySettings({ ...memorySettings, enabled: v })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>User Profile Modeling</Label>
                        <p className="text-xs text-muted-foreground">Build a user profile across sessions</p>
                      </div>
                      <Switch checked={memorySettings.userProfile} onCheckedChange={(v) => setMemorySettings({ ...memorySettings, userProfile: v })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Memory Character Limit: {memorySettings.charLimit}</Label>
                      <Slider value={[memorySettings.charLimit]} onValueChange={([v]) => setMemorySettings({ ...memorySettings, charLimit: v })} min={500} max={5000} step={100} />
                    </div>
                    <div className="space-y-2">
                      <Label>Nudge Interval: every {memorySettings.nudgeInterval} turns</Label>
                      <Slider value={[memorySettings.nudgeInterval]} onValueChange={([v]) => setMemorySettings({ ...memorySettings, nudgeInterval: v })} min={5} max={30} step={5} />
                    </div>
                    <div className="space-y-2">
                      <Label>Memory Provider</Label>
                      <Select value={memorySettings.provider} onValueChange={(v) => setMemorySettings({ ...memorySettings, provider: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="honcho">Honcho (Dialectic)</SelectItem>
                          <SelectItem value="holographic">Holographic</SelectItem>
                          <SelectItem value="mem0">Mem0</SelectItem>
                          <SelectItem value="retaindb">RetainDB</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" onClick={() => handleSaveSection('Memory')} className="gap-1.5"><Save className="size-3.5" /> Save</Button>
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
                      <Sliders className="size-4" /> Advanced Settings
                    </CardTitle>
                    <CardDescription>Fine-tune agent behavior and performance</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Max Agent Turns: {advancedSettings.maxTurns}</Label>
                      <Slider value={[advancedSettings.maxTurns]} onValueChange={([v]) => setAdvancedSettings({ ...advancedSettings, maxTurns: v })} min={10} max={200} step={10} />
                    </div>
                    <div className="space-y-2">
                      <Label>Reasoning Effort</Label>
                      <Select value={advancedSettings.reasoningEffort} onValueChange={(v) => setAdvancedSettings({ ...advancedSettings, reasoningEffort: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low (faster, cheaper)</SelectItem>
                          <SelectItem value="medium">Medium (balanced)</SelectItem>
                          <SelectItem value="high">High (thorough)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Context Compression</Label>
                        <p className="text-xs text-muted-foreground">Summarize old messages to save context space</p>
                      </div>
                      <Switch checked={advancedSettings.compressionEnabled} onCheckedChange={(v) => setAdvancedSettings({ ...advancedSettings, compressionEnabled: v })} />
                    </div>
                    {advancedSettings.compressionEnabled && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2 pl-4 border-l-2 border-border/50">
                        <Label className="text-xs">Compression Threshold: {advancedSettings.compressionThreshold}%</Label>
                        <Slider value={[advancedSettings.compressionThreshold]} onValueChange={([v]) => setAdvancedSettings({ ...advancedSettings, compressionThreshold: v })} min={30} max={80} step={5} />
                      </motion.div>
                    )}
                    <div className="space-y-2">
                      <Label>Delegation Max Iterations: {advancedSettings.delegationMaxIterations}</Label>
                      <Slider value={[advancedSettings.delegationMaxIterations]} onValueChange={([v]) => setAdvancedSettings({ ...advancedSettings, delegationMaxIterations: v })} min={10} max={100} step={10} />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" className="gap-1.5"><RotateCcw className="size-3" /> Reset Defaults</Button>
                      <Button size="sm" onClick={() => handleSaveSection('Advanced')} className="gap-1.5"><Save className="size-3.5" /> Save</Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
