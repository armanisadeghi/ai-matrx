"use client";

import { useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { extractErrorMessage } from "@/utils/errors";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Wrench,
  Play,
  RefreshCw,
  Copy,
  Check,
  X,
  Loader2,
  ChevronRight,
  RotateCcw,
  AlertTriangle,
  Key,
} from "lucide-react";
import { toast } from "sonner";
import { useServerConfig } from "../_shared/useServerConfig";
import { ServerBar } from "../_shared/ServerBar";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default?: unknown;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
}

type ExecStatus = "idle" | "running" | "complete" | "error";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 text-xs px-2 gap-1"
      disabled={!text}
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => null);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function buildDefaults(params: ToolParameter[]): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const p of params) {
    if (p.default !== undefined && p.default !== null) {
      defaults[p.name] = p.default;
    } else if (p.type === "boolean") {
      defaults[p.name] = false;
    } else if (p.type === "integer" || p.type === "number") {
      defaults[p.name] = "";
    } else if (p.type === "array" || p.type === "object") {
      defaults[p.name] = p.type === "array" ? "[]" : "{}";
    } else {
      defaults[p.name] = "";
    }
  }
  return defaults;
}

// ─── Param Field ──────────────────────────────────────────────────────────────

function ParamField({
  param,
  value,
  onChange,
}: {
  param: ToolParameter;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = (
    <div className="flex items-center gap-1.5">
      <Label className="text-xs font-mono font-semibold">{param.name}</Label>
      <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">
        {param.type}
      </Badge>
      {param.required && (
        <span className="text-destructive text-[10px]">*</span>
      )}
    </div>
  );

  if (param.type === "boolean") {
    return (
      <div className="space-y-1">
        {label}
        <div className="flex items-center gap-2">
          <Checkbox
            id={`param-${param.name}`}
            checked={Boolean(value)}
            onCheckedChange={(v) => onChange(v as boolean)}
          />
          <Label
            htmlFor={`param-${param.name}`}
            className="text-xs cursor-pointer text-muted-foreground"
          >
            {param.description}
          </Label>
        </div>
      </div>
    );
  }

  if (param.type === "array" || param.type === "object") {
    return (
      <div className="space-y-1">
        {label}
        <Textarea
          value={String(value ?? (param.type === "array" ? "[]" : "{}"))}
          onChange={(e) => onChange(e.target.value)}
          placeholder={param.description}
          className="min-h-[60px] text-xs font-mono resize-y"
        />
      </div>
    );
  }

  if (param.type === "integer" || param.type === "number") {
    return (
      <div className="space-y-1">
        {label}
        <Input
          type="number"
          value={String(value ?? "")}
          onChange={(e) =>
            onChange(e.target.value === "" ? "" : Number(e.target.value))
          }
          placeholder={`${param.description}${param.default !== undefined ? ` (default: ${param.default})` : ""}`}
          className="h-7 text-xs"
        />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {label}
      <Input
        type="text"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`${param.description}${param.default !== undefined ? ` (default: ${param.default})` : ""}`}
        className="h-7 text-xs font-mono"
      />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ToolsDemoClient() {
  const config = useServerConfig();

  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<ToolDefinition | null>(null);
  const [argValues, setArgValues] = useState<Record<string, unknown>>({});

  const [execStatus, setExecStatus] = useState<ExecStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [callId, setCallId] = useState<string | null>(null);

  const hasToken = Boolean(config.authToken);

  const loadTools = useCallback(async () => {
    setLoadingTools(true);
    setLoadError(null);
    try {
      const res = await fetch(`${config.serverUrl}/tools/test/list`, {
        headers: config.authHeaders,
      });

      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `Authentication required (HTTP ${res.status}). Set your Bearer token in the server bar above.`,
        );
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);

      const data: ToolDefinition[] = await res.json();
      setTools(data);
      toast.success(
        `Loaded ${data.length} tool${data.length === 1 ? "" : "s"}`,
      );
    } catch (err) {
      const msg = extractErrorMessage(err);
      setLoadError(msg);
      toast.error("Failed to load tools", { description: msg });
    } finally {
      setLoadingTools(false);
    }
  }, [config.serverUrl, config.authHeaders]);

  const handleSelectTool = (tool: ToolDefinition) => {
    setSelectedTool(tool);
    setArgValues(buildDefaults(tool.parameters));
    setResult(null);
    setErrorMessage(null);
    setElapsedMs(null);
    setCallId(null);
    setExecStatus("idle");
  };

  const handleExecute = async () => {
    if (!selectedTool) return;
    setExecStatus("running");
    setResult(null);
    setErrorMessage(null);
    setElapsedMs(null);

    const args: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(argValues)) {
      if (v === "" || v === undefined) continue;
      const param = selectedTool.parameters.find((p) => p.name === k);
      if (param?.type === "array" || param?.type === "object") {
        try {
          args[k] = JSON.parse(String(v));
        } catch {
          args[k] = v;
        }
      } else {
        args[k] = v;
      }
    }

    try {
      const res = await fetch(`${config.serverUrl}/tools/test/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...config.authHeaders },
        body: JSON.stringify({ tool_name: selectedTool.name, arguments: args }),
      });

      const data = await res.json();

      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `Authentication required (HTTP ${res.status}). Set your Bearer token in the server bar.`,
        );
      }
      if (!res.ok) {
        throw new Error(data?.detail || data?.message || `HTTP ${res.status}`);
      }

      setResult(data);
      setElapsedMs(data?.elapsed_ms ?? null);
      setCallId(data?.call_id ?? null);
      setExecStatus("complete");
      toast.success("Tool executed successfully");
    } catch (err) {
      const msg = extractErrorMessage(err);
      setErrorMessage(msg);
      setExecStatus("error");
      toast.error("Execution failed", { description: msg });
    }
  };

  const requestBodyStr = selectedTool
    ? JSON.stringify(
        { tool_name: selectedTool.name, arguments: argValues },
        null,
        2,
      )
    : "";

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col overflow-hidden bg-background">
        {/* Header */}
        <div className="flex-shrink-0 px-3 pt-2 pb-0">
          <ServerBar
            config={config}
            showAuth
            title={
              <div className="flex items-center gap-2 flex-shrink-0">
                <Wrench className="h-4 w-4 text-primary" />
                <h1 className="text-base font-bold">Tools Demo</h1>
                <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                  GET /api/tools/test/list
                </Badge>
              </div>
            }
            actions={
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={hasToken ? "outline" : "secondary"}
                    onClick={loadTools}
                    disabled={loadingTools}
                    className="h-7 text-xs px-2.5 gap-1.5"
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${loadingTools ? "animate-spin" : ""}`}
                    />
                    {tools.length > 0 ? "Reload Tools" : "Load Tools"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">
                  GET /api/tools/test/list — requires auth token
                </TooltipContent>
              </Tooltip>
            }
          />
        </div>

        {/* Auth warning banner */}
        {!hasToken && (
          <div className="flex-shrink-0 mx-3 mt-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-md">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Auth Token Required
                </p>
                <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-0.5">
                  The tools API (
                  <code className="font-mono">/api/tools/test/*</code>) requires
                  a valid Bearer token. Click the{" "}
                  <Key className="h-3 w-3 inline" /> icon in the server bar
                  above to set your token.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Load error */}
        {loadError && (
          <div className="flex-shrink-0 mx-3 mt-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <div className="flex items-start gap-2">
              <X className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-destructive">
                  Failed to load tools
                </p>
                <p className="text-[11px] text-destructive/80 mt-0.5 break-words">
                  {loadError}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setLoadError(null)}
                className="h-5 w-5 p-0 flex-shrink-0"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {/* Body: 3 panels */}
        <div className="flex-1 min-h-0 px-3 py-2">
          <div className="grid grid-cols-12 gap-2 h-full">
            {/* Left: Tool List */}
            <Card className="col-span-2 h-full flex flex-col overflow-hidden">
              <div className="flex-shrink-0 px-3 py-2 border-b flex items-center justify-between">
                <span className="text-xs font-semibold">Tools</span>
                <Badge
                  variant={tools.length > 0 ? "secondary" : "outline"}
                  className="text-[10px] h-5 px-1.5"
                >
                  {tools.length}
                </Badge>
              </div>

              {tools.length === 0 && !loadingTools ? (
                <div className="flex-1 flex items-center justify-center p-3">
                  <div className="text-center space-y-3">
                    <Wrench className="h-10 w-10 mx-auto opacity-20" />
                    <p className="text-[11px] text-muted-foreground">
                      No tools loaded yet
                    </p>
                    <Button
                      size="sm"
                      onClick={loadTools}
                      disabled={loadingTools}
                      variant={hasToken ? "default" : "outline"}
                      className="h-7 text-xs gap-1.5"
                    >
                      <RefreshCw className="h-3 w-3" /> Load Tools
                    </Button>
                    {!hasToken && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-500">
                        Set auth token first
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <ScrollArea className="flex-1">
                  {loadingTools ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="p-1 space-y-0.5">
                      {tools.map((tool) => (
                        <button
                          key={tool.name}
                          onClick={() => handleSelectTool(tool)}
                          className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-1.5 transition-colors ${
                            selectedTool?.name === tool.name
                              ? "bg-primary/10 text-primary font-medium"
                              : "hover:bg-muted/80"
                          }`}
                        >
                          <ChevronRight
                            className={`h-3 w-3 flex-shrink-0 ${selectedTool?.name === tool.name ? "opacity-100" : "opacity-0"}`}
                          />
                          <span className="font-mono truncate">
                            {tool.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              )}
            </Card>

            {/* Middle: Tool Config */}
            <Card className="col-span-4 h-full flex flex-col overflow-hidden">
              {!selectedTool ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground p-4">
                  <div className="text-center">
                    <Wrench className="h-10 w-10 mx-auto mb-2 opacity-20" />
                    <p className="text-xs">
                      {tools.length > 0
                        ? "Select a tool from the list"
                        : "Load tools first, then select one"}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-shrink-0 px-3 py-2.5 border-b space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold font-mono">
                        {selectedTool.name}
                      </span>
                      <Badge
                        variant="secondary"
                        className="text-[10px] h-5 px-1.5"
                      >
                        {selectedTool.parameters.length} param
                        {selectedTool.parameters.length !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {selectedTool.description}
                    </p>
                  </div>

                  <ScrollArea className="flex-1 p-3">
                    <div className="space-y-3">
                      {selectedTool.parameters.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">
                          No parameters required
                        </p>
                      ) : (
                        selectedTool.parameters.map((param) => (
                          <div key={param.name}>
                            <ParamField
                              param={param}
                              value={argValues[param.name]}
                              onChange={(v) =>
                                setArgValues((prev) => ({
                                  ...prev,
                                  [param.name]: v,
                                }))
                              }
                            />
                            {param.type !== "boolean" && (
                              <p className="text-[10px] text-muted-foreground mt-0.5 pl-0.5">
                                {param.description}
                              </p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>

                  <div className="flex-shrink-0 p-3 border-t flex gap-2">
                    <Button
                      onClick={handleExecute}
                      disabled={execStatus === "running"}
                      className="flex-1 h-8 gap-2 text-sm"
                    >
                      {execStatus === "running" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                      {execStatus === "running" ? "Running…" : "Execute"}
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setArgValues(buildDefaults(selectedTool.parameters))
                          }
                          className="h-8 w-8 p-0"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">
                        Reset to defaults
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </>
              )}
            </Card>

            {/* Right: Results */}
            <Card className="col-span-6 h-full flex flex-col overflow-hidden p-3">
              <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">Result</span>
                  {execStatus !== "idle" && (
                    <Badge
                      variant={
                        execStatus === "complete"
                          ? "secondary"
                          : execStatus === "error"
                            ? "destructive"
                            : "default"
                      }
                      className="text-[10px] h-5 px-1.5"
                    >
                      {execStatus === "running"
                        ? "Running"
                        : execStatus === "complete"
                          ? "Complete"
                          : "Error"}
                    </Badge>
                  )}
                  {elapsedMs !== null && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {elapsedMs.toFixed(1)}ms
                    </span>
                  )}
                </div>
                {callId && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className="text-[10px] h-5 px-1.5 font-mono cursor-default"
                      >
                        {callId.slice(0, 8)}…
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="font-mono text-xs">
                      {callId}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>

              {errorMessage && (
                <div className="flex-shrink-0 mb-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive font-mono">
                  ❌ {errorMessage}
                </div>
              )}

              <Tabs
                defaultValue="result"
                className="flex-1 flex flex-col overflow-hidden min-h-0"
              >
                <TabsList className="grid grid-cols-2 h-8 flex-shrink-0">
                  <TabsTrigger value="result" className="text-xs">
                    Result JSON
                  </TabsTrigger>
                  <TabsTrigger value="request" className="text-xs">
                    Request
                  </TabsTrigger>
                </TabsList>

                <TabsContent
                  value="result"
                  className="flex-1 flex flex-col overflow-hidden mt-2 p-3 bg-muted rounded border min-h-0"
                >
                  <div className="flex justify-end flex-shrink-0 mb-1">
                    <CopyButton
                      text={result ? JSON.stringify(result, null, 2) : ""}
                    />
                  </div>
                  <div className="flex-1 overflow-y-auto min-h-0">
                    {execStatus === "running" ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />{" "}
                        Executing…
                      </div>
                    ) : result ? (
                      <pre className="text-[11px] font-mono whitespace-pre-wrap">
                        {JSON.stringify(result, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {selectedTool
                          ? "Execute the tool to see results."
                          : "Select a tool and execute it."}
                      </p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent
                  value="request"
                  className="flex-1 flex flex-col overflow-hidden mt-2 p-3 bg-muted rounded border min-h-0"
                >
                  <div className="flex justify-end flex-shrink-0 mb-1">
                    <CopyButton
                      text={`POST ${config.serverUrl}/api/tools/test/execute\n\n${requestBodyStr}`}
                    />
                  </div>
                  <div className="flex-1 overflow-y-auto min-h-0">
                    <pre className="text-[11px] font-mono whitespace-pre-wrap text-foreground/80">
                      {selectedTool
                        ? `POST ${config.serverUrl}/api/tools/test/execute\nAuthorization: Bearer ${config.authToken || "<required>"}\nContent-Type: application/json\n\n${requestBodyStr}`
                        : "Select a tool first."}
                    </pre>
                  </div>
                </TabsContent>
              </Tabs>
            </Card>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
