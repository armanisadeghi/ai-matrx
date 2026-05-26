"use client";

import { useState, useEffect } from "react";
import { parseNdjsonStream } from "@/lib/api/stream-parser";
import { ENDPOINTS } from "@/lib/api/endpoints";
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
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Plus,
  Trash2,
  X,
  Play,
  Settings2,
  FileText,
  FileJson,
} from "lucide-react";
import { TEST_ADMIN_TOKEN } from "../sample-prompt";
import MarkdownStream from "@/components/MarkdownStream";
import { ApiTestConfigPanel } from "@/components/api-test-config/ApiTestConfigPanel";
import { useApiTestConfig } from "@/components/api-test-config/useApiTestConfig";
import { supabase } from "@/utils/supabase/client";
import { useModels } from "@/features/ai-models/hooks/useModels";
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

interface Prompt {
  id: string;
  name: string;
  messages: PromptMessage[];
  variable_defaults?: any[];
  settings?: PromptSettings;
}

interface Tool {
  name: string;
  description: string;
  category?: string;
}

export default function ChatDemoClient() {
  const apiConfig = useApiTestConfig({
    defaultServerType: "local",
    defaultAuthToken: TEST_ADMIN_TOKEN,
  });

  const { models, isLoading: modelsLoading } = useModels();

  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [availableTools, setAvailableTools] = useState<Tool[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Configuration states
  const [selectedPromptId, setSelectedPromptId] = useState<string>("");
  const [selectedModelId, setSelectedModelId] = useState<string>(
    "2d637e2d-4e9f-4490-bae2-5bbdf5eb0ef4",
  );
  const [modelConfig, setModelConfig] = useState<PromptSettings>({});
  const [messages, setMessages] = useState<PromptMessage[]>([
    {
      role: "system",
      content:
        "You're a helpful assistant. Always search the web to ensure you include recent and relevant facts in your response.",
    },
    {
      role: "user",
      content: "Hello! Can you help me? What is the latest us news?",
    },
  ]);
  const [debugMode, setDebugMode] = useState(true);

  // Test execution states
  const [isRunning, setIsRunning] = useState(false);
  const [streamOutput, setStreamOutput] = useState<string>("");
  const [streamText, setStreamText] = useState<string>("");
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

  // Settings panel state
  const [showSettings, setShowSettings] = useState(true);
  const [showJsonEditor, setShowJsonEditor] = useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Enter to run test
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (!isRunning && selectedModelId && messages.length > 0) {
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
  }, [isRunning, selectedModelId, messages]);

  // Load all data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoadingData(true);

        const {
          data: { session },
        } = await supabase.auth.getSession();
        const authHeaders: Record<string, string> = {};
        if (session?.access_token) {
          authHeaders["Authorization"] = `Bearer ${session.access_token}`;
        }

        const [promptsRes, toolsRes] = await Promise.all([
          fetch("/api/admin/prompt-builtins/user-prompts", {
            headers: authHeaders,
          })
            .then((r) => r.json())
            .catch(() => ({ prompts: [] })),
          fetch("/api/tools")
            .then((r) => r.json())
            .catch(() => ({ tools: [] })),
        ]);

        setPrompts(promptsRes?.prompts || []);
        setAvailableTools(toolsRes?.tools || []);
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

  // Handle model change
  const handleModelChange = (newModelId: string) => {
    setSelectedModelId(newModelId);
    const newModel = models.find((m) => m.id === newModelId);
    if (newModel) {
      const defaults = getModelDefaults(newModel);
      setModelConfig((prev) => ({
        ...defaults,
        tools: prev.tools || [],
      }));
    }
  };

  // Handle prompt selection - fetch full prompt data
  const handlePromptSelect = async (promptId: string) => {
    if (!promptId) {
      setSelectedPromptId("");
      return;
    }

    setSelectedPromptId(promptId);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const authHeaders: Record<string, string> = {};
      if (session?.access_token) {
        authHeaders["Authorization"] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`/api/prompts/${promptId}`, {
        headers: authHeaders,
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch prompt: ${response.status}`);
      }

      const data = await response.json();
      const prompt = data.prompt;

      if (prompt) {
        // Load prompt messages
        if (prompt.messages && Array.isArray(prompt.messages)) {
          setMessages(prompt.messages);
        }
        // Load prompt settings
        if (prompt.settings) {
          const { model_id, ...config } = prompt.settings;
          if (model_id) {
            setSelectedModelId(model_id);
          }
          setModelConfig((prev) => ({ ...prev, ...config }));
        }
      }
    } catch (error) {
      console.error("Error loading prompt:", error);
      setErrorMessage(
        `Failed to load prompt: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
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

    setIsRunning(true);
    setStreamOutput("");
    setStreamText("");
    setErrorMessage("");
    setDebugInfo({
      chunkCount: 0,
      totalBytes: 0,
      eventCount: 0,
      startTime: Date.now(),
      endTime: null,
    });

    try {
      // For demo runs, omit conversation_id to let the server generate one (new conversation per run)
      const url = `${apiConfig.baseUrl}${ENDPOINTS.ai.chat}`;

      // Build request body - flatten settings into root level
      // Filter out null/undefined values before sending
      const cleanedConfig = removeNullSettings(modelConfig);
      const requestBody = {
        messages: messages,
        ai_model_id: selectedModelId,
        ...cleanedConfig,
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
        // Try to parse error response
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
        // Approximate byte tracking — actual bytes no longer easily available per-event
        const rawSize = JSON.stringify(json).length;
        totalBytes += rawSize;
        chunkCount++;

        setStreamOutput(
          (prev) => prev + JSON.stringify(json, null, 2) + "\n\n",
        );

        if (
          json.event === "chunk" &&
          json.data &&
          typeof json.data === "object" &&
          "text" in json.data
        ) {
          setStreamText((prev) => prev + (json.data as { text: string }).text);
        }
        if (json.event === "error") {
          const errData = json.data;
          if (typeof errData === "object" && errData !== null) {
            const d = errData as unknown as Record<string, unknown>;
            setErrorMessage(
              (d.user_message ||
                d.message ||
                JSON.stringify(errData)) as string,
            );
          } else {
            setErrorMessage("Unknown error from stream");
          }
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
      setIsRunning(false);
    }
  };

  // Clear all
  const clearAll = () => {
    setStreamOutput("");
    setStreamText("");
    setErrorMessage("");
    setDebugInfo({
      chunkCount: 0,
      totalBytes: 0,
      eventCount: 0,
      startTime: null,
      endTime: null,
    });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Fixed header section */}
      <div className="flex-shrink-0 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Chat API Test</h1>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings2 className="h-4 w-4 mr-1" />
            {showSettings ? "Hide" : "Show"} Settings
          </Button>
        </div>

        {/* API Configuration */}
        <ApiTestConfigPanel config={apiConfig} />
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 min-h-0 p-3">
        <div className="grid grid-cols-12 gap-3 h-full">
          {/* Left: Configuration Panel */}
          {showSettings && (
            <Card className="col-span-3 p-3 h-full overflow-y-auto space-y-3">
              <div className="space-y-2">
                {/* Prompt Selection */}
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-semibold whitespace-nowrap flex-shrink-0">
                    Load Prompt
                  </Label>
                  <Select
                    value={selectedPromptId}
                    onValueChange={handlePromptSelect}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue
                        placeholder={
                          prompts.length > 0
                            ? "Select a prompt..."
                            : "No prompts available"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {prompts.length > 0 ? (
                        prompts.map((prompt) => (
                          <SelectItem
                            key={prompt.id}
                            value={prompt.id}
                            className="text-xs"
                          >
                            {prompt.name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem
                          value="_none"
                          disabled
                          className="text-xs text-muted-foreground"
                        >
                          No prompts found
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {selectedPromptId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handlePromptSelect("")}
                      className="h-7 text-xs px-2 flex-shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                {/* Model Selection */}
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-semibold whitespace-nowrap flex-shrink-0">
                    Model
                  </Label>
                  <Select
                    value={selectedModelId}
                    onValueChange={handleModelChange}
                  >
                    <SelectTrigger className="h-7 text-xs">
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

                {/* Debug Mode Toggle */}
                <div className="flex items-center gap-2 border-t pt-2">
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

                {/* Messages Configuration */}
                <div className="space-y-1.5 border-t pt-3">
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
                          className="min-h-[60px] text-xs font-mono"
                        />
                      </Card>
                    ))}
                  </div>
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
                      <span className="text-foreground">{messages.length}</span>
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

                {/* Run Button */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={runTest}
                        disabled={
                          isRunning || !selectedModelId || messages.length === 0
                        }
                        className="w-full"
                        size="sm"
                      >
                        {isRunning && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        <Play className="mr-2 h-4 w-4" />
                        {isRunning ? "Running..." : "Run Test"}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Ctrl/Cmd + Enter</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* JSON Editor Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowJsonEditor(true)}
                  className="w-full mt-2"
                >
                  <FileJson className="mr-2 h-4 w-4" />
                  Edit Config as JSON
                </Button>
              </div>
            </Card>
          )}

          {/* JSON Editor Modal */}
          <SettingsJsonEditor
            isOpen={showJsonEditor}
            onClose={() => setShowJsonEditor(false)}
            settings={modelConfig}
            onSave={setModelConfig}
          />

          {/* Right: Results Panel */}
          <Card
            className={`${showSettings ? "col-span-9" : "col-span-12"} p-3 h-full overflow-hidden flex flex-col`}
          >
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
            >
              <TabsList className="grid w-full grid-cols-3 h-8">
                <TabsTrigger value="rendered" className="text-xs">
                  Rendered
                </TabsTrigger>
                <TabsTrigger value="json" className="text-xs">
                  JSON Stream
                </TabsTrigger>
                <TabsTrigger value="request" className="text-xs">
                  Request Body
                </TabsTrigger>
              </TabsList>

              <TabsContent
                value="rendered"
                className="flex-1 overflow-y-auto mt-2 p-3 bg-textured rounded border"
              >
                {errorMessage && (
                  <div className="mb-3 p-3 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
                    <div className="font-semibold mb-1">❌ Error</div>
                    <div className="font-mono">{errorMessage}</div>
                  </div>
                )}
                {streamText ? (
                  <MarkdownStream
                    content={streamText}
                    isStreamActive={isRunning}
                    className="text-sm"
                  />
                ) : !errorMessage ? (
                  <div className="text-xs text-muted-foreground">
                    No response yet...
                  </div>
                ) : null}
              </TabsContent>

              <TabsContent
                value="json"
                className="flex-1 overflow-y-auto mt-2 p-3 bg-muted rounded border"
              >
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {streamOutput || "No JSON data yet..."}
                </pre>
              </TabsContent>

              <TabsContent
                value="request"
                className="flex-1 overflow-y-auto mt-2 p-3 bg-muted rounded border"
              >
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {JSON.stringify(
                    {
                      messages: messages,
                      ai_model_id: selectedModelId,
                      ...modelConfig,
                      debug: debugMode,
                    },
                    null,
                    2,
                  )}
                </pre>
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>
    </div>
  );
}
