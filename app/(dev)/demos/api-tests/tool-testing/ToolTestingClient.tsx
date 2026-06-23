"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  RefreshCw,
  User,
  Monitor,
  Globe,
  Loader2,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { useSelector, useDispatch } from "react-redux";
import {
  selectActiveServer,
  selectResolvedBaseUrl,
  switchServer,
} from "@/lib/redux/slices/apiConfigSlice";
import { BACKEND_URLS, ENDPOINTS } from "@/lib/api/endpoints";
import type { AppDispatch } from "@/lib/redux/store";
import { ToolListSidebar } from "./components/ToolListSidebar";
import { ToolConfigPanel } from "./components/ToolConfigPanel";
import { buildDefaults } from "./components/ArgumentForm";
import { ResultsPanel } from "./components/ResultsPanel";
import { ConversationSelector } from "./components/ConversationSelector";
import { ContextScopeModal } from "./components/ContextScopeModal";
import { fetchToolsFromDatabase, executeToolTest } from "./streaming-client";
import { useToolTestContext } from "./hooks/useToolTestContext";
import type { TypedStreamEvent } from "@/types/python-generated/stream-events";
import type {
  ToolDefinition,
  ToolStreamEvent,
  FinalPayload,
  ExecutionStatus,
} from "@/features/tool-call-visualization/testing/types";

export default function ToolTestingClient() {
  // ─── Server selection (local vs production) ─────────────────────────────
  const dispatch = useDispatch<AppDispatch>();
  const activeServer = useSelector(selectActiveServer);
  const resolvedUrl = useSelector(selectResolvedBaseUrl);
  const [isCheckingServer, setIsCheckingServer] = useState(false);

  const backendUrl = resolvedUrl ?? "";
  const isLocalhost = activeServer === "localhost";
  const serverType = isLocalhost ? "local" : "production";

  const handleSetServer = useCallback(
    async (type: "local" | "production") => {
      if (type === "local") {
        const localhostUrl = BACKEND_URLS["localhost"];
        if (!localhostUrl) {
          toast.error("Localhost unavailable", {
            description: "NEXT_PUBLIC_BACKEND_URL_LOCAL is not configured.",
          });
          return;
        }
        setIsCheckingServer(true);
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const response = await fetch(
            `${localhostUrl}${ENDPOINTS.health.check}`,
            {
              signal: controller.signal,
            },
          );
          clearTimeout(timeoutId);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          dispatch(switchServer({ env: "localhost" }));
        } catch {
          toast.error("Localhost unavailable", {
            description: "Start the local server first.",
          });
        } finally {
          setIsCheckingServer(false);
        }
      } else {
        dispatch(switchServer({ env: "production" }));
      }
    },
    [dispatch],
  );

  // ─── Real user context — JWT + user ID + conversation + scope ───────────
  const {
    userId,
    authToken,
    tokenReady,
    conversationId,
    conversationReady,
    scopeOverride,
    setConversationId,
    createConversation,
    isCreatingConversation,
    setScopeOverride,
    buildTestContext,
  } = useToolTestContext();

  // ─── Tool list state ─────────────────────────────────────────────────────
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null);

  // ─── Argument form state ─────────────────────────────────────────────────
  const [argValues, setArgValues] = useState<Record<string, unknown>>({});

  // ─── Execution state ─────────────────────────────────────────────────────
  const [executionStatus, setExecutionStatus] =
    useState<ExecutionStatus>("idle");
  const [toolEvents, setToolEvents] = useState<ToolStreamEvent[]>([]);
  const [rawLines, setRawLines] = useState<TypedStreamEvent[]>([]);
  const [rawJsonLog, setRawJsonLog] = useState("");
  const [finalPayload, setFinalPayload] = useState<FinalPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ─── Derived ─────────────────────────────────────────────────────────────
  const selectedTool = tools.find((t) => t.name === selectedToolName) ?? null;
  const canExecute = !!authToken && conversationReady;

  // ─── Load tools ──────────────────────────────────────────────────────────
  const loadTools = useCallback(async () => {
    setLoadingTools(true);
    try {
      const data = await fetchToolsFromDatabase();
      setTools(data);
      toast.success(`Loaded ${data.length} tools`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load tools");
    } finally {
      setLoadingTools(false);
    }
  }, []);

  useEffect(() => {
    loadTools();
  }, [loadTools]);

  // ─── Tool selection ───────────────────────────────────────────────────────
  const handleSelectTool = (toolName: string) => {
    setSelectedToolName(toolName);
    const tool = tools.find((t) => t.name === toolName);
    if (tool) setArgValues(buildDefaults(tool.parameters));
    clearResults();
  };

  // ─── Clear / reset ────────────────────────────────────────────────────────
  const clearResults = () => {
    setToolEvents([]);
    setRawLines([]);
    setRawJsonLog("");
    setFinalPayload(null);
    setErrorMessage(null);
    setExecutionStatus("idle");
  };

  const handleReset = () => {
    if (selectedTool) setArgValues(buildDefaults(selectedTool.parameters));
    clearResults();
  };

  // ─── Execute ──────────────────────────────────────────────────────────────
  const handleExecute = async () => {
    if (!selectedTool || !authToken || !conversationReady) return;

    clearResults();
    setExecutionStatus("connecting");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const cleanedArgs: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(argValues)) {
      if (val === "" || val === undefined) continue;
      cleanedArgs[key] = val;
    }

    const context = buildTestContext();
    if (!context) {
      toast.error("No conversation set", {
        description: "Create or paste a real conversation ID before executing.",
      });
      setExecutionStatus("idle");
      return;
    }

    console.log(
      `[ToolTest] Executing "${selectedTool.name}" → ${backendUrl}${ENDPOINTS.tools.testExecute}`,
      "\n  user:",
      userId,
      "\n  context:",
      context,
    );

    try {
      await executeToolTest(
        backendUrl,
        authToken,
        selectedTool.name,
        cleanedArgs,
        {
          onPhase: (data) => {
            if (data.phase === "complete") {
              setExecutionStatus("complete");
            } else {
              setExecutionStatus("running");
            }
          },
          onToolEvent: (event) => {
            setExecutionStatus("running");
            setToolEvents((prev) => [...prev, event]);
            if (event.event === "tool_error") {
              setErrorMessage(event.message ?? "Tool execution failed");
            }
          },
          onFinalResult: (payload) => {
            setFinalPayload(payload);
            if (payload.output?.full_result?.success === false) {
              setErrorMessage(
                payload.output.full_result.error?.message ??
                  "Tool returned error",
              );
              setExecutionStatus("error");
            } else {
              setExecutionStatus("complete");
            }
          },
          onError: (error) => {
            setErrorMessage(
              error.user_message ?? error.message ?? "Stream error",
            );
            setExecutionStatus("error");
          },
          onEnd: () => {
            setExecutionStatus((prev) =>
              prev === "running" || prev === "connecting" ? "complete" : prev,
            );
          },
          onRawEvent: (event) => {
            setRawLines((prev) => [...prev, event]);
            setRawJsonLog(
              (prev) => prev + JSON.stringify(event, null, 2) + "\n\n",
            );
          },
        },
        controller.signal,
        context,
      );
    } catch (err) {
      if (controller.signal.aborted) {
        setExecutionStatus("cancelled");
        toast.info("Execution cancelled");
      } else {
        setErrorMessage(
          err instanceof Error ? err.message : "Execution failed",
        );
        setExecutionStatus("error");
      }
    } finally {
      // Safety net: if the stream ended without an explicit complete/error signal,
      // mark as complete so the UI never stays permanently in loading state.
      setExecutionStatus((prev) =>
        prev === "running" || prev === "connecting" ? "complete" : prev,
      );
    }
  };

  // ─── Cancel ───────────────────────────────────────────────────────────────
  const handleCancel = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  };

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (
          selectedTool &&
          canExecute &&
          executionStatus !== "running" &&
          executionStatus !== "connecting"
        ) {
          handleExecute();
        }
      }
      if (
        e.key === "Escape" &&
        (executionStatus === "running" || executionStatus === "connecting")
      ) {
        handleCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedTool, canExecute, executionStatus, argValues]);

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col overflow-hidden bg-background">
        {/* ── Header ── */}
        <div className="flex-shrink-0 px-3 py-1">
          {/* Top row: title + server toggle + reload */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1 border-b">
            <h1 className="text-lg font-bold flex-shrink-0">
              Tool Testing Dashboard
            </h1>

            {/* Server toggle */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <ToggleGroup
                type="single"
                value={serverType}
                onValueChange={(v) =>
                  v && handleSetServer(v as "local" | "production")
                }
                className="gap-0"
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ToggleGroupItem
                      value="local"
                      aria-label="Localhost"
                      disabled={isCheckingServer}
                      className="h-6 w-6 p-0 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground disabled:opacity-40"
                    >
                      {isCheckingServer ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Monitor className="h-3 w-3" />
                      )}
                    </ToggleGroupItem>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">Localhost</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ToggleGroupItem
                      value="production"
                      aria-label="Production"
                      disabled={isCheckingServer}
                      className="h-6 w-6 p-0 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                    >
                      <Globe className="h-3 w-3" />
                    </ToggleGroupItem>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">
                    Production
                  </TooltipContent>
                </Tooltip>
              </ToggleGroup>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[160px] cursor-default">
                    {backendUrl}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="font-mono text-xs break-all max-w-xs">
                  {backendUrl}
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={loadTools}
                    disabled={loadingTools}
                    className="h-6 text-xs px-2 gap-1"
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${loadingTools ? "animate-spin" : ""}`}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">
                  Reload active tools from database
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Context row: session status + user ID + conversation + scope */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1 border-b">
            {/* Session / JWT status */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 flex-shrink-0 cursor-default">
                  {!tokenReady ? (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  ) : authToken ? (
                    <ShieldCheck className="h-3 w-3 text-success" />
                  ) : (
                    <ShieldAlert className="h-3 w-3 text-destructive" />
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {!tokenReady
                      ? "Loading…"
                      : authToken
                        ? "Session active"
                        : "Not signed in"}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent className="text-xs max-w-[260px]">
                {authToken
                  ? "Your real Supabase JWT is being sent with every request."
                  : "No active session — sign in to test tools."}
              </TooltipContent>
            </Tooltip>

            <div className="h-4 w-px bg-border flex-shrink-0" />

            {/* Real user ID badge */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <User className="h-3 w-3 text-muted-foreground" />
              {userId ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="h-5 text-[10px] font-mono px-1.5 cursor-default"
                    >
                      {userId.slice(0, 8)}…
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="font-mono text-xs break-all max-w-xs">
                    {userId}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Badge variant="destructive" className="h-5 text-[10px] px-1.5">
                  No user
                </Badge>
              )}
            </div>

            <div className="h-4 w-px bg-border flex-shrink-0" />

            {/* Conversation selector */}
            <ConversationSelector
              conversationId={conversationId}
              isCreating={isCreatingConversation}
              onCreateNew={createConversation}
              onSetExisting={setConversationId}
            />

            <div className="h-4 w-px bg-border flex-shrink-0" />

            {/* Scope modal */}
            <ContextScopeModal
              scopeOverride={scopeOverride}
              onScopeChange={setScopeOverride}
            />

            {/* Active scope preview badges */}
            {scopeOverride.organization_id && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="secondary"
                    className="h-5 text-[10px] px-1.5 font-mono cursor-default"
                  >
                    org: {scopeOverride.organization_id.slice(0, 8)}…
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="font-mono text-xs break-all">
                  organization_id: {scopeOverride.organization_id}
                </TooltipContent>
              </Tooltip>
            )}
            {scopeOverride.project_id && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="secondary"
                    className="h-5 text-[10px] px-1.5 font-mono cursor-default"
                  >
                    proj: {scopeOverride.project_id.slice(0, 8)}…
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="font-mono text-xs break-all">
                  project_id: {scopeOverride.project_id}
                </TooltipContent>
              </Tooltip>
            )}
            {scopeOverride.task_id && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="secondary"
                    className="h-5 text-[10px] px-1.5 font-mono cursor-default"
                  >
                    task: {scopeOverride.task_id.slice(0, 8)}…
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="font-mono text-xs break-all">
                  task_id: {scopeOverride.task_id}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* ── Three-panel layout ── */}
        <div className="flex-1 min-h-0 px-3 py-1">
          <div className="grid grid-cols-12 gap-2 h-full">
            <Card className="col-span-2 h-full overflow-hidden">
              <ToolListSidebar
                tools={tools}
                loading={loadingTools}
                selectedTool={selectedToolName}
                onSelectTool={handleSelectTool}
              />
            </Card>

            <Card className="col-span-4 h-full overflow-hidden">
              <ToolConfigPanel
                tool={selectedTool}
                argValues={argValues}
                onArgValuesChange={setArgValues}
                executionStatus={executionStatus}
                onExecute={handleExecute}
                onCancel={handleCancel}
                onReset={handleReset}
                serverInfo={{ type: serverType, baseUrl: backendUrl }}
                conversationReady={conversationReady}
              />
            </Card>

            <Card className="col-span-6 h-full overflow-hidden">
              <ResultsPanel
                toolName={selectedToolName ?? ""}
                toolId={selectedTool?.id ?? null}
                toolSchema={selectedTool?.output_schema ?? null}
                args={argValues}
                toolEvents={toolEvents}
                rawLines={rawLines}
                finalPayload={finalPayload}
                rawJsonLog={rawJsonLog}
                executionStatus={executionStatus}
                errorMessage={errorMessage}
                onClear={clearResults}
                authToken={authToken}
              />
            </Card>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
