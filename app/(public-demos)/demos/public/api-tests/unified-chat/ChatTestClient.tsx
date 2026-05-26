// @ts-nocheck

"use client";

import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchablePromptSelect } from "@/features/prompt-apps/components/SearchablePromptSelect";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Plus,
  Trash2,
  X,
  Play,
  FileText,
  FileJson,
  BarChart3,
  FlaskConical,
  Copy,
  Check,
  PanelRightClose,
  PanelRightOpen,
  Key,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
// Removed hardcoded TEST_ADMIN_TOKEN - now using cookie-based storage
import MarkdownStream from "@/components/MarkdownStream";
import { ApiTestConfigPanel } from "@/components/api-test-config/ApiTestConfigPanel";
import { useApiTestConfig } from "@/components/api-test-config/useApiTestConfig";
import type {
  TypedStreamEvent,
  ChunkPayload,
  ErrorPayload,
  CompletionPayload,
} from "@/types/python-generated/stream-events";
import { parseNdjsonStream } from "@/lib/api/stream-parser";
import { ENDPOINTS } from "@/lib/api/endpoints";
import {
  useModelControls,
  getModelDefaults,
} from "@/features/prompts/hooks/useModelControls";
import { PromptMessage, PromptSettings } from "@/features/prompts/types/core";
import { ModelSettings } from "@/features/prompts/components/configuration/ModelSettings";
import { SettingsJsonEditor } from "@/features/prompts/components/configuration/SettingsJsonEditor";
import { removeNullSettings } from "@/features/prompts/utils/settings-filter";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import { UsageStatsModal } from "@/components/chat/UsageStatsModal";
import { supabase } from "@/utils/supabase/client";
import { useModels } from "@/features/ai-models/hooks/useModels";

const StreamAnalyzer = lazy(() => import("./StreamAnalyzer"));

function TabCopyButton({
  content,
  label = "Copy",
  disabled,
}: {
  content: string;
  label?: string;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (!content || disabled) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 text-xs px-2 gap-1"
      onClick={handleCopy}
      disabled={disabled || !content}
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-600" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      {copied ? "Copied" : label}
    </Button>
  );
}

interface Prompt {
  id: string;
  name: string;
  description: string | null;
  messages: PromptMessage[];
  variable_defaults?: unknown[];
  settings?: PromptSettings;
}

interface Tool {
  name: string;
  description: string;
  category?: string;
}

export default function ChatTestClient() {
  const apiConfig = useApiTestConfig({
    defaultServerType: "local",
    requireToken: true,
  });

  const { models, isLoading: modelsLoading } = useModels();

  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [availableTools, setAvailableTools] = useState<Tool[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Configuration states
  const [selectedPromptId, setSelectedPromptId] = useState<string>("");
  const [selectedModelId, setSelectedModelId] = useState<string>(
    "e407ba1d-34b4-4a2d-bdca-0566d3171d58",
  );
  const [modelConfig, setModelConfig] = useState<PromptSettings>({});
  const [messages, setMessages] = useState<PromptMessage[]>([
    {
      role: "system",
      content:
        "You're a helpful assistant. Today's date is " +
        new Date().toLocaleDateString() +
        ". Ensure you always include recent and relevant facts in your response.",
    },
    // { role: 'user', content: 'Hello! Can you help me? What is the latest us news?' }
    {
      role: "user",
      content:
        "Hello! Can you tell me the biggest AI LLM advancements of 2025 and an outlook for 2026?",
    },
  ]);
  const [debugMode, setDebugMode] = useState(true);
  const [streamEnabled, setStreamEnabled] = useState(true);

  // Test execution states
  const [isRunning, setIsRunning] = useState(false);
  const [streamOutput, setStreamOutput] = useState<string>("");
  const [streamText, setStreamText] = useState<string>("");
  const [streamEvents, setStreamEvents] = useState<TypedStreamEvent[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [debugInfo, setDebugInfo] = useState<{
    chunkCount: number;
    totalBytes: number;
    eventCount: number;
    startTime: number | null;
    endTime: number | null;
  }>({
    chunkCount: 0,
    totalBytes: 0,
    eventCount: 0,
    startTime: null,
    endTime: null,
  });

  // Stream Analyzer state (raw JSON objects for event classification)
  const rawEventsRef = useRef<Array<Record<string, unknown>>>([]);
  const [rawEventsVersion, setRawEventsVersion] = useState(0);
  const [analyzerStartTime, setAnalyzerStartTime] = useState<number | null>(
    null,
  );
  const [analyzerTabActive, setAnalyzerTabActive] = useState(false);
  const analyzerFlushRef = useRef<ReturnType<typeof setInterval>>(null);

  // Settings panel state
  const [showSettings, setShowSettings] = useState(true);
  const [showJsonEditor, setShowJsonEditor] = useState(false);

  // Usage stats modal state
  const [usageStatsData, setUsageStatsData] = useState<any>(null);
  const [showUsageStats, setShowUsageStats] = useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Enter to run test
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (
          !isRunning &&
          selectedModelId &&
          messages.length > 0 &&
          apiConfig.hasToken
        ) {
          runTest();
        }
      }
      // Escape to stop test (if running)
      if (e.key === "Escape" && isRunning) {
        // Note: Can't actually stop the stream, but this is a placeholder
        // for future implementation if needed
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRunning, selectedModelId, messages.length, apiConfig.hasToken]);

  // Load all data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoadingData(true);

        const toolsRes = await fetch("/api/tools")
          .then((r) => r.json())
          .catch(() => ({ tools: [] }));
        setAvailableTools(toolsRes?.tools || []);

        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            const { data: userPrompts, error } = await supabase
              .from("prompts")
              .select(
                "id, name, messages, settings, variable_defaults, description",
              )
              .eq("user_id", user.id)
              .order("updated_at", { ascending: false });

            if (!error && userPrompts) {
              setPrompts(userPrompts);
            }
          }
        } catch (e) {
          console.error("Error loading prompts:", e);
        }
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoadingData(false);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    if (models.length > 0 && !selectedModelId) {
      setSelectedModelId(models[0].id);
      setModelConfig(getModelDefaults(models[0]));
    }
  }, [models, selectedModelId]);

  const { normalizedControls } = useModelControls(models, selectedModelId);

  // Handle model change - when a prompt is selected, do NOT overwrite config (prompt config is source of truth)
  const handleModelChange = (newModelId: string) => {
    setSelectedModelId(newModelId);
    if (selectedPromptId) return; // Prompt config stays as-is; only model ID changes for API
    const newModel = models.find((m) => m.id === newModelId);
    if (newModel) {
      const defaults = getModelDefaults(newModel);
      setModelConfig((prev) => ({
        ...defaults,
        tools: prev.tools || [],
      }));
    }
  };

  // Handle prompt selection - apply full prompt data from already-loaded prompts
  const handlePromptSelect = (promptId: string) => {
    if (!promptId) {
      setSelectedPromptId("");
      return;
    }

    setSelectedPromptId(promptId);

    const prompt = prompts.find((p) => p.id === promptId);
    if (!prompt) return;

    // Apply prompt messages
    if (prompt.messages && Array.isArray(prompt.messages)) {
      setMessages(prompt.messages);
    }

    // Apply prompt settings - use ONLY prompt config (no model defaults overlay)
    if (prompt.settings) {
      const { model_id, stream, ...restSettings } = prompt.settings;

      // Config is exactly what the prompt provides - never merge with model defaults
      setModelConfig(restSettings);

      // Set the model from prompt settings (for API call)
      if (model_id) {
        const matchedModel = models.find((m) => m.id === model_id);
        if (matchedModel) {
          setSelectedModelId(model_id);
        } else {
          console.warn(
            `Model ${model_id} from prompt not found in available models`,
          );
        }
      }

      // Sync stream toggle with prompt settings
      if (typeof stream === "boolean") {
        setStreamEnabled(stream);
      }
    }
  };

  // Message handlers
  const addMessage = () => {
    const lastRole =
      messages.length > 0 ? messages[messages.length - 1].role : "user";
    const nextRole = lastRole === "user" ? "assistant" : "user";
    setMessages([...messages, { role: nextRole, content: "" }]);
  };

  const updateMessage = (
    index: number,
    field: "role" | "content",
    value: string,
  ) => {
    const updated = [...messages];
    updated[index] = { ...updated[index], [field]: value };
    setMessages(updated);
  };

  const deleteMessage = (index: number) => {
    setMessages(messages.filter((_, i) => i !== index));
  };

  // Test execution
  const runTest = async () => {
    if (isRunning) return;

    // Auth token is required for this page - show specific message before making request
    if (!apiConfig.hasToken) {
      setErrorMessage(
        "Auth token is required. Please configure an auth token in the API config panel above.",
      );
      return;
    }

    setIsRunning(true);
    setStreamOutput("");
    setStreamText("");
    setStreamEvents([]);
    setErrorMessage("");
    setUsageStatsData(null);
    rawEventsRef.current = [];
    setRawEventsVersion(0);
    const startNow = Date.now();
    setAnalyzerStartTime(startNow);
    setDebugInfo({
      chunkCount: 0,
      totalBytes: 0,
      eventCount: 0,
      startTime: startNow,
      endTime: null,
    });

    // Start a throttled flush for the analyzer (every 250ms during streaming)
    if (analyzerFlushRef.current) clearInterval(analyzerFlushRef.current);
    analyzerFlushRef.current = setInterval(() => {
      setRawEventsVersion(rawEventsRef.current.length);
    }, 250);

    try {
      // For test runs, omit conversation_id to let the server generate one (new conversation per run)
      const url = `${apiConfig.baseUrl}${ENDPOINTS.ai.chat}`;

      // Build request body - flatten settings into root level
      // Filter out null/undefined values before sending
      const cleanedConfig = removeNullSettings(modelConfig);
      const requestBody = {
        messages: messages,
        ai_model_id: selectedModelId,
        ...cleanedConfig,
        stream: streamEnabled,
        debug: debugMode,
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiConfig.authToken}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        // 401: auth required - show specific message for this page
        if (response.status === 401) {
          const msg = !apiConfig.authToken?.trim()
            ? "Auth token is required. Please configure an auth token in the API config panel above."
            : "Unauthorized. Your auth token may be invalid or expired. Please check your token in the API config panel.";
          throw new Error(msg);
        }
        // Try to parse error response for other status codes
        let errorMsg = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          // Handle nested error objects
          if (typeof errorData.error === "object" && errorData.error !== null) {
            errorMsg =
              errorData.error.user_message ||
              errorData.error.user_visible_message ||
              errorData.error.message ||
              JSON.stringify(errorData.error);
          } else if (
            typeof errorData.message === "object" &&
            errorData.message !== null
          ) {
            errorMsg =
              errorData.message.user_message ||
              errorData.message.user_visible_message ||
              errorData.message.message ||
              JSON.stringify(errorData.message);
          } else {
            errorMsg =
              errorData.error ||
              errorData.message ||
              errorData.details ||
              errorMsg;
          }
        } catch (e) {
          // If can't parse JSON, try to get text
          try {
            const errorText = await response.text();
            if (errorText) errorMsg = errorText;
          } catch (e2) {
            // Use default error
          }
        }
        throw new Error(errorMsg);
      }
      if (!response.body) throw new Error("No response body");

      let chunkCount = 0;
      let totalBytes = 0;
      let eventCount = 0;

      const { events } = parseNdjsonStream(response);

      for await (const json of events) {
        eventCount++;
        totalBytes += JSON.stringify(json).length;
        chunkCount++;

        setStreamOutput(
          (prev) => prev + JSON.stringify(json, null, 2) + "\n\n",
        );
        setStreamEvents((prev) => [...prev, json as TypedStreamEvent]);
        rawEventsRef.current.push(json as unknown as Record<string, unknown>);

        if (
          json.event === "chunk" &&
          json.data &&
          typeof json.data === "object" &&
          "text" in json.data
        ) {
          setStreamText((prev) => prev + (json.data as ChunkPayload).text);
        }
        if (json.event === "error") {
          const errData = json.data as ErrorPayload;
          if (typeof errData === "object" && errData !== null) {
            setErrorMessage(
              errData.user_message ||
                errData.message ||
                JSON.stringify(errData),
            );
          } else {
            setErrorMessage("Unknown error from stream");
          }
        }
        if (json.event === "completion") {
          setUsageStatsData(json.data as CompletionPayload);
        }

        setDebugInfo((prev) => ({
          ...prev,
          chunkCount,
          totalBytes,
          eventCount,
        }));
      }

      setDebugInfo((prev) => ({ ...prev, endTime: Date.now() }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      setErrorMessage(errorMsg);
      setStreamOutput((prev) => prev + `\n\n❌ Error: ${errorMsg}`);
    } finally {
      // Stop analyzer flush interval and do a final flush
      if (analyzerFlushRef.current) {
        clearInterval(analyzerFlushRef.current);
        analyzerFlushRef.current = null;
      }
      setRawEventsVersion(rawEventsRef.current.length);
      setIsRunning(false);
    }
  };

  // Clear all
  const clearAll = () => {
    setStreamOutput("");
    setStreamText("");
    setStreamEvents([]);
    setErrorMessage("");
    setDebugInfo({
      chunkCount: 0,
      totalBytes: 0,
      eventCount: 0,
      startTime: null,
      endTime: null,
    });
    rawEventsRef.current = [];
    setRawEventsVersion(0);
    setAnalyzerStartTime(null);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Fixed header: title + API config + actions in one row */}
      <div className="flex-shrink-0 px-3 py-1">
        <ApiTestConfigPanel
          config={apiConfig}
          title={<h1 className="text-lg font-bold">Chat API Test</h1>}
          actions={
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowSettings(!showSettings)}
                  className="h-6 w-6 p-0"
                  aria-label={showSettings ? "Hide settings" : "Show settings"}
                >
                  {showSettings ? (
                    <PanelRightClose className="h-3.5 w-3.5" />
                  ) : (
                    <PanelRightOpen className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {showSettings ? "Hide settings" : "Show settings"}
              </TooltipContent>
            </Tooltip>
          }
        />
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 min-h-0 px-3 py-1">
        <div className="grid grid-cols-12 gap-2 h-full">
          {/* Left: Configuration Panel - always visible */}
          <Card className="col-span-3 h-full flex flex-col overflow-hidden">
            {/* Sticky top: Prompt + Model */}
            <div className="flex-shrink-0 p-3 space-y-2 border-b">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-semibold whitespace-nowrap flex-shrink-0">
                  Prompt
                </Label>
                <div className="flex-1 min-w-0">
                  <SearchablePromptSelect
                    prompts={prompts}
                    value={selectedPromptId}
                    onChange={(id) => handlePromptSelect(id)}
                    placeholder={
                      prompts.length > 0
                        ? "Select a prompt..."
                        : "No prompts available"
                    }
                    compact
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs font-semibold whitespace-nowrap flex-shrink-0">
                  Model
                </Label>
                <Select
                  value={selectedModelId}
                  onValueChange={handleModelChange}
                >
                  <SelectTrigger className="h-7 text-xs flex-1">
                    <SelectValue placeholder="Select model..." />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((model) => (
                      <SelectItem
                        key={model.id}
                        value={model.id}
                        className="text-xs"
                      >
                        {model.common_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Collapsible Settings (Stream Response, Debug, Model Settings, Config Summary) */}
            <Collapsible
              open={showSettings}
              onOpenChange={setShowSettings}
              className="flex-shrink-0"
            >
              <CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-2 border-b hover:bg-muted/50 transition-colors text-left">
                <span className="text-xs font-semibold">Settings</span>
                {showSettings ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="max-h-[min(40vh,280px)] overflow-y-auto data-[state=closed]:hidden">
                <div className="p-3 space-y-3">
                  {/* Stream & Debug Mode Toggles */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="stream-mode"
                        checked={streamEnabled}
                        onCheckedChange={(checked) =>
                          setStreamEnabled(checked as boolean)
                        }
                      />
                      <Label
                        htmlFor="stream-mode"
                        className="text-xs font-medium cursor-pointer"
                      >
                        Stream Response
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="debug-mode"
                        checked={debugMode}
                        onCheckedChange={(checked) =>
                          setDebugMode(checked as boolean)
                        }
                      />
                      <Label
                        htmlFor="debug-mode"
                        className="text-xs font-medium cursor-pointer"
                      >
                        Debug Mode
                      </Label>
                    </div>
                  </div>

                  {/* Model Settings */}
                  <div className="space-y-1.5 pt-1">
                    <ModelSettings
                      modelId={selectedModelId}
                      models={models}
                      settings={modelConfig}
                      onSettingsChange={setModelConfig}
                      availableTools={availableTools}
                    />
                  </div>

                  {/* Configuration Summary */}
                  <div className="space-y-1.5 border-t pt-3">
                    <Label className="text-xs font-semibold">
                      Configuration Summary
                    </Label>
                    <div className="space-y-1 text-xs text-muted-foreground font-mono">
                      <div className="flex justify-between">
                        <span>Model:</span>
                        <span className="text-foreground">
                          {models.find((m) => m.id === selectedModelId)
                            ?.common_name || "None"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Messages:</span>
                        <span className="text-foreground">
                          {messages.length}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Streaming:</span>
                        <span
                          className={
                            streamEnabled
                              ? "text-green-600 dark:text-green-400"
                              : "text-foreground"
                          }
                        >
                          {streamEnabled ? "Enabled" : "Disabled"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Debug Mode:</span>
                        <span
                          className={
                            debugMode
                              ? "text-green-600 dark:text-green-400"
                              : "text-foreground"
                          }
                        >
                          {debugMode ? "Enabled" : "Disabled"}
                        </span>
                      </div>
                      {typeof modelConfig.temperature === "number" && (
                        <div className="flex justify-between">
                          <span>Temperature:</span>
                          <span className="text-foreground">
                            {modelConfig.temperature.toFixed(2)}
                          </span>
                        </div>
                      )}
                      {typeof modelConfig.max_output_tokens === "number" && (
                        <div className="flex justify-between">
                          <span>Max Tokens:</span>
                          <span className="text-foreground">
                            {modelConfig.max_output_tokens}
                          </span>
                        </div>
                      )}
                      {modelConfig.tools && modelConfig.tools.length > 0 && (
                        <div className="flex justify-between">
                          <span>Tools:</span>
                          <span className="text-foreground">
                            {modelConfig.tools.length}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Messages Configuration - always visible (focus area when settings collapsed) */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 border-t">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Messages</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addMessage}
                  className="h-6 text-xs px-2"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Message
                </Button>
              </div>
              <div className="space-y-2">
                {messages.map((message, index) => (
                  <Card key={index} className="p-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Select
                        value={message.role}
                        onValueChange={(value) =>
                          updateMessage(index, "role", value)
                        }
                      >
                        <SelectTrigger className="h-7 text-xs flex-shrink-0 w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="system" className="text-xs">
                            System
                          </SelectItem>
                          <SelectItem value="user" className="text-xs">
                            User
                          </SelectItem>
                          <SelectItem value="assistant" className="text-xs">
                            Assistant
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0"
                      >
                        {index + 1}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteMessage(index)}
                        className="h-6 w-6 p-0 ml-auto"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <Textarea
                      value={message.content}
                      onChange={(e) =>
                        updateMessage(index, "content", e.target.value)
                      }
                      placeholder={`Enter ${message.role} message...`}
                      className="min-h-[120px] text-xs font-mono"
                    />
                  </Card>
                ))}
              </div>
            </div>

            {/* Sticky bottom: Run + Edit Config buttons side by side */}
            <div className="flex-shrink-0 p-3 border-t flex flex-col gap-2">
              {!apiConfig.hasToken && (
                <p className="text-xs text-warning-foreground flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5 flex-shrink-0" />
                  Auth token required — configure in the API config panel above
                  to run the test
                </p>
              )}
              <div className="flex gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={runTest}
                        disabled={
                          isRunning ||
                          !selectedModelId ||
                          messages.length === 0 ||
                          !apiConfig.hasToken
                        }
                        className="flex-1"
                        size="sm"
                      >
                        {isRunning && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        <Play className="mr-2 h-4 w-4" />
                        {isRunning ? "Running..." : "Run Test"}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {!apiConfig.hasToken
                        ? "Auth token required — configure in the panel above"
                        : "Ctrl/Cmd + Enter"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowJsonEditor(true)}
                  className="flex-1"
                >
                  <FileJson className="mr-2 h-4 w-4" />
                  Edit Config
                </Button>
              </div>
            </div>
          </Card>

          {/* JSON Editor Modal */}
          <SettingsJsonEditor
            isOpen={showJsonEditor}
            onClose={() => setShowJsonEditor(false)}
            settings={modelConfig}
            onSave={setModelConfig}
          />

          {/* Usage Stats Modal */}
          <UsageStatsModal
            isOpen={showUsageStats}
            onClose={() => setShowUsageStats(false)}
            data={usageStatsData}
          />

          {/* Right: Results Panel */}
          <Card className="col-span-9 p-3 h-full overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-semibold">Results</Label>
                {errorMessage && (
                  <Badge
                    variant="destructive"
                    className="text-[10px] px-1.5 py-0"
                  >
                    Error
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Debug Info */}
                {(isRunning || debugInfo.chunkCount > 0) && (
                  <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
                    <span>Chunks: {debugInfo.chunkCount}</span>
                    <span>Bytes: {debugInfo.totalBytes.toLocaleString()}</span>
                    <span>Events: {debugInfo.eventCount}</span>
                    {debugInfo.startTime && (
                      <span>
                        Time:{" "}
                        {debugInfo.endTime
                          ? `${((debugInfo.endTime - debugInfo.startTime) / 1000).toFixed(2)}s`
                          : `${((Date.now() - debugInfo.startTime) / 1000).toFixed(2)}s`}
                      </span>
                    )}
                  </div>
                )}
                {usageStatsData && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowUsageStats(true)}
                    className="h-7 text-xs px-2"
                  >
                    <BarChart3 className="h-3 w-3 mr-1" />
                    Usage Stats
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={clearAll}
                  className="h-7 text-xs px-2"
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              </div>
            </div>

            <Tabs
              defaultValue="rendered"
              className="flex-1 flex flex-col overflow-hidden"
              onValueChange={(val) => setAnalyzerTabActive(val === "analyzer")}
            >
              <TabsList className="grid w-full grid-cols-4 h-8">
                <TabsTrigger value="rendered" className="text-xs">
                  Rendered
                </TabsTrigger>
                <TabsTrigger value="request" className="text-xs">
                  Request Body
                </TabsTrigger>
                <TabsTrigger value="analyzer" className="text-xs gap-1">
                  <FlaskConical className="h-3 w-3" />
                  Stream Analyzer
                </TabsTrigger>
                <TabsTrigger value="json" className="text-xs">
                  JSON Stream
                </TabsTrigger>
              </TabsList>

              <TabsContent
                value="rendered"
                className="flex-1 flex flex-col overflow-hidden mt-2 p-3 bg-textured rounded border"
              >
                <div className="flex justify-end mb-2 flex-shrink-0">
                  <TabCopyButton
                    content={streamText}
                    label="Copy Rendered"
                    disabled={!streamText}
                  />
                </div>
                <div className="flex-1 overflow-y-auto min-h-0">
                  {errorMessage && (
                    <div className="mb-3 p-3 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
                      <div className="font-semibold mb-1">❌ Error</div>
                      <div className="font-mono">{errorMessage}</div>
                    </div>
                  )}
                  {streamEvents.length > 0 ? (
                    <MarkdownStream
                      events={streamEvents}
                      isStreamActive={isRunning}
                      className="text-sm"
                      onError={(error) => setErrorMessage(error)}
                      hideCopyButton={false}
                    />
                  ) : !errorMessage ? (
                    <div className="text-xs text-muted-foreground">
                      No response yet...
                    </div>
                  ) : null}
                </div>
              </TabsContent>

              <TabsContent
                value="analyzer"
                className="flex-1 overflow-hidden mt-2 p-3 bg-muted/20 rounded border"
              >
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
                      Loading analyzer...
                    </div>
                  }
                >
                  <StreamAnalyzer
                    rawEvents={rawEventsRef.current}
                    isStreaming={isRunning}
                    streamStartTime={analyzerStartTime}
                    isActive={analyzerTabActive}
                    eventVersion={rawEventsVersion}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent
                value="json"
                className="flex-1 flex flex-col overflow-hidden mt-2 p-3 bg-muted rounded border"
              >
                <div className="flex justify-end mb-2 flex-shrink-0">
                  <TabCopyButton
                    content={streamOutput}
                    label="Copy JSON"
                    disabled={!streamOutput}
                  />
                </div>
                <div className="flex-1 overflow-y-auto min-h-0">
                  <pre className="text-xs font-mono whitespace-pre-wrap">
                    {streamOutput || "No JSON data yet..."}
                  </pre>
                </div>
              </TabsContent>

              <TabsContent
                value="request"
                className="flex-1 flex flex-col overflow-hidden mt-2 p-3 bg-muted rounded border"
              >
                <div className="flex justify-end mb-2 flex-shrink-0">
                  <TabCopyButton
                    content={JSON.stringify(
                      {
                        messages: messages,
                        ai_model_id: selectedModelId,
                        ...modelConfig,
                        stream: streamEnabled,
                        debug: debugMode,
                      },
                      null,
                      2,
                    )}
                    label="Copy Request"
                  />
                </div>
                <div className="flex-1 overflow-y-auto min-h-0">
                  <pre className="text-xs font-mono whitespace-pre-wrap">
                    {`POST /api/ai/conversations/chat\n\n` +
                      JSON.stringify(
                        {
                          messages: messages,
                          ai_model_id: selectedModelId,
                          ...modelConfig,
                          stream: streamEnabled,
                          debug: debugMode,
                        },
                        null,
                        2,
                      )}
                  </pre>
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>
    </div>
  );
}
