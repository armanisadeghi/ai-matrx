"use client";

import { useState, useEffect, useRef } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Cable,
  Play,
  Square,
  Zap,
  RotateCcw,
  Plus,
  Trash2,
  Copy,
  Check,
  X,
  Loader2,
  Brain,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { parseNdjsonStream } from "@/lib/api/stream-parser";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { useServerConfig } from "../_shared/useServerConfig";
import { ServerBar } from "../_shared/ServerBar";

// ─── Types ─────────────────────────────────────────────────────────────────

type ExecStatus =
  | "idle"
  | "connecting"
  | "running"
  | "complete"
  | "error"
  | "cancelled";
interface KVPair {
  key: string;
  value: string;
}

interface TokenUsage {
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function statusBadge(status: ExecStatus) {
  const map: Record<
    ExecStatus,
    {
      label: string;
      variant: "default" | "secondary" | "destructive" | "outline";
    }
  > = {
    idle: { label: "Idle", variant: "outline" },
    connecting: { label: "Connecting", variant: "secondary" },
    running: { label: "Running", variant: "default" },
    complete: { label: "Complete", variant: "secondary" },
    error: { label: "Error", variant: "destructive" },
    cancelled: { label: "Cancelled", variant: "outline" },
  };
  const { label, variant } = map[status];
  return (
    <Badge variant={variant} className="text-[10px] h-5 px-1.5">
      {label}
    </Badge>
  );
}

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

function tryParseJson(s: string): { ok: boolean; obj?: unknown } {
  try {
    return { ok: true, obj: JSON.parse(s) };
  } catch {
    return { ok: false };
  }
}

function extractUsage(events: unknown[]): TokenUsage {
  for (const evt of [...events].reverse()) {
    if (!evt || typeof evt !== "object") continue;
    const e = evt as Record<string, unknown>;
    const d = e.data;
    if (!d || typeof d !== "object") continue;
    const data = d as Record<string, unknown>;
    if ("input_tokens" in data) {
      return {
        input_tokens: (data.input_tokens as number) ?? null,
        output_tokens: (data.output_tokens as number) ?? null,
        total_tokens: (data.total_tokens as number) ?? null,
      };
    }
    if ("usage" in data && data.usage && typeof data.usage === "object") {
      const u = data.usage as Record<string, number>;
      return {
        input_tokens: u.input_tokens ?? null,
        output_tokens: u.output_tokens ?? null,
        total_tokens: u.total_tokens ?? null,
      };
    }
  }
  return { input_tokens: null, output_tokens: null, total_tokens: null };
}

// ─── KV Editor ─────────────────────────────────────────────────────────────

function KVEditor({
  label,
  pairs,
  onChange,
}: {
  label: string;
  pairs: KVPair[];
  onChange: (pairs: KVPair[]) => void;
}) {
  const add = () => onChange([...pairs, { key: "", value: "" }]);
  const remove = (i: number) => onChange(pairs.filter((_, idx) => idx !== i));
  const update = (i: number, field: "key" | "value", v: string) => {
    const next = [...pairs];
    next[i] = { ...next[i], [field]: v };
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold">{label}</Label>
        <Button
          size="sm"
          variant="ghost"
          onClick={add}
          className="h-5 text-[10px] px-1.5 gap-1"
        >
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>
      {pairs.length === 0 && (
        <p className="text-[10px] text-muted-foreground italic pl-0.5">
          No entries — click Add
        </p>
      )}
      {pairs.map((pair, i) => (
        <div key={i} className="flex gap-1 items-center">
          <Input
            value={pair.key}
            onChange={(e) => update(i, "key", e.target.value)}
            placeholder="key"
            className="h-6 text-xs font-mono flex-1 min-w-0"
          />
          <span className="text-muted-foreground text-xs flex-shrink-0">:</span>
          <Input
            value={pair.value}
            onChange={(e) => update(i, "value", e.target.value)}
            placeholder="value"
            className="h-6 text-xs font-mono flex-1 min-w-0"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => remove(i)}
            className="h-6 w-6 p-0 flex-shrink-0"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function AgentDemoClient() {
  const config = useServerConfig();

  // Agent config
  const [agentId, setAgentId] = useState("");
  const [userInput, setUserInput] = useState(
    "Hello! Can you help me with something?",
  );
  const [variables, setVariables] = useState<KVPair[]>([]);

  // Overrides — dedicated fields
  const [temperature, setTemperature] = useState("");
  const [maxOutputTokens, setMaxOutputTokens] = useState("");
  const [reasoningEffort, setReasoningEffort] = useState("");
  const [modelOverride, setModelOverride] = useState("");

  // Extra overrides as raw JSON
  const [extraOverridesRaw, setExtraOverridesRaw] = useState("{}");

  // Toggles
  const [streamEnabled, setStreamEnabled] = useState(true);
  const [debugMode, setDebugMode] = useState(false);

  // Section state
  const [overridesOpen, setOverridesOpen] = useState(false);

  // Execution state
  const [execStatus, setExecStatus] = useState<ExecStatus>("idle");
  const [textOutput, setTextOutput] = useState("");
  const [rawEvents, setRawEvents] = useState("");
  const [eventsLog, setEventsLog] = useState<unknown[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [stats, setStats] = useState({
    events: 0,
    bytes: 0,
    ms: 0,
    startTime: 0,
  });
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isRunning = execStatus === "connecting" || execStatus === "running";
  const canExecute = agentId.trim().length > 0 && !isRunning;
  const extraParsed = tryParseJson(extraOverridesRaw);
  const tokenUsage = extractUsage(eventsLog);

  const clearResults = () => {
    setTextOutput("");
    setRawEvents("");
    setEventsLog([]);
    setErrorMessage(null);
    setRequestId(null);
    setStats({ events: 0, bytes: 0, ms: 0, startTime: 0 });
    setExecStatus("idle");
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };
  const startTimer = (start: number) => {
    stopTimer();
    timerRef.current = setInterval(
      () => setStats((s) => ({ ...s, ms: Date.now() - start })),
      100,
    );
  };

  useEffect(() => () => stopTimer(), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (canExecute) handleExecute();
      }
      if (e.key === "Escape" && isRunning) handleCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canExecute, isRunning]);

  const buildConfigOverrides = (): Record<string, unknown> | undefined => {
    const overrides: Record<string, unknown> = {};
    const temp = parseFloat(temperature);
    if (!isNaN(temp)) overrides.temperature = temp;
    const mtok = parseInt(maxOutputTokens, 10);
    if (!isNaN(mtok)) overrides.max_output_tokens = mtok;
    if (reasoningEffort) overrides.reasoning_effort = reasoningEffort;
    if (modelOverride.trim()) overrides.ai_model_id = modelOverride.trim();
    if (
      extraParsed.ok &&
      extraParsed.obj &&
      typeof extraParsed.obj === "object"
    ) {
      Object.assign(overrides, extraParsed.obj);
    }
    return Object.keys(overrides).length > 0 ? overrides : undefined;
  };

  const handleExecute = async () => {
    if (!canExecute) return;
    clearResults();
    const start = Date.now();
    setStats({ events: 0, bytes: 0, ms: 0, startTime: start });
    setExecStatus("connecting");
    startTimer(start);

    const controller = new AbortController();
    abortRef.current = controller;

    const variablesObj = variables.reduce<Record<string, string>>(
      (acc, { key, value }) => {
        if (key.trim()) acc[key.trim()] = value;
        return acc;
      },
      {},
    );

    const body = {
      user_input: userInput || null,
      variables:
        Object.keys(variablesObj).length > 0 ? variablesObj : undefined,
      config_overrides: buildConfigOverrides(),
      stream: streamEnabled,
      debug: debugMode,
    };

    try {
      const res = await fetch(
        `${config.serverUrl}/ai/agents/${agentId.trim()}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...config.authHeaders,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );

      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const d = await res.json();
          msg = d?.detail || d?.error?.message || d?.message || msg;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }

      const { events, requestId: rid } = parseNdjsonStream(
        res,
        controller.signal,
      );
      if (rid) setRequestId(rid);
      setExecStatus("running");

      let eventCount = 0,
        byteCount = 0;
      for await (const evt of events) {
        eventCount++;
        const line = JSON.stringify(evt, null, 2) + "\n\n";
        byteCount += line.length;
        setRawEvents((prev) => prev + line);
        setEventsLog((prev) => [...prev, evt]);
        setStats((s) => ({
          ...s,
          events: eventCount,
          bytes: byteCount,
          ms: Date.now() - start,
        }));
        if (
          evt.event === "chunk" &&
          evt.data &&
          typeof evt.data === "object" &&
          "text" in evt.data
        ) {
          setTextOutput((prev) => prev + (evt.data as { text: string }).text);
        }
        if (evt.event === "error") {
          const d = evt.data;
          setErrorMessage(
            d?.user_message ||
              d?.message ||
              JSON.stringify(d) ||
              "Stream error",
          );
        }
      }
      setExecStatus((prev) =>
        prev === "running" || prev === "connecting" ? "complete" : prev,
      );
    } catch (err) {
      if (controller.signal.aborted) {
        setExecStatus("cancelled");
        toast.info("Cancelled");
      } else {
        const msg = err instanceof Error ? err.message : "Execution failed";
        setErrorMessage(msg);
        setExecStatus("error");
        toast.error(msg);
      }
    } finally {
      stopTimer();
      setStats((s) => ({ ...s, ms: Date.now() - s.startTime }));
    }
  };

  const handleCancel = async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setExecStatus("cancelled");
    stopTimer();
    if (requestId && config.serverUrl) {
      try {
        await fetch(`${config.serverUrl}/ai/cancel/${requestId}`, {
          method: "POST",
          headers: config.authHeaders,
        });
        toast.info("Cancellation sent to server");
      } catch {
        /* ignore */
      }
    }
  };

  const handleWarm = async () => {
    if (!agentId.trim()) {
      toast.warning("Enter an Agent ID first");
      return;
    }
    try {
      const res = await fetch(
        `${config.serverUrl}/ai/agents/${agentId.trim()}/warm`,
        {
          method: "POST",
          headers: config.authHeaders,
        },
      );
      const data = await res.json();
      toast.success(`Warm: ${data.status}`, {
        description: `agent_id: ${data.agent_id}`,
      });
    } catch (err) {
      toast.error("Warm failed", {
        description: extractErrorMessage(err),
      });
    }
  };

  const requestBody = JSON.stringify(
    {
      user_input: userInput || null,
      variables: variables.reduce<Record<string, string>>(
        (a, { key, value }) => {
          if (key) a[key] = value;
          return a;
        },
        {},
      ),
      config_overrides: buildConfigOverrides(),
      stream: streamEnabled,
      debug: debugMode,
    },
    null,
    2,
  );

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col overflow-hidden bg-background">
        <div className="flex-shrink-0 px-3 pt-2 pb-0">
          <ServerBar
            config={config}
            title={
              <div className="flex items-center gap-2 flex-shrink-0">
                <Cable className="h-4 w-4 text-primary" />
                <h1 className="text-base font-bold">Agent Demo</h1>
                <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                  POST {ENDPOINTS.ai.agentStart("{id}")}
                </Badge>
              </div>
            }
            actions={
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleWarm}
                    disabled={!agentId.trim() || isRunning}
                    className="h-7 text-xs px-2.5 gap-1.5"
                  >
                    <Zap className="h-3 w-3" /> Warm
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">
                  POST {ENDPOINTS.ai.agentWarm("{id}")} — pre-load agent into
                  cache
                </TooltipContent>
              </Tooltip>
            }
          />
        </div>

        <div className="flex-1 min-h-0 px-3 py-2">
          <div className="grid grid-cols-12 gap-2 h-full">
            {/* Left: Config */}
            <Card className="col-span-4 h-full flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
                {/* Agent ID */}
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">
                    Agent ID <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                    placeholder="UUID or slug (e.g. my-research-agent)"
                    className="h-8 text-xs font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Sent as:{" "}
                    <code className="font-mono">
                      POST{" "}
                      {ENDPOINTS.ai.agentStart(agentId.trim() || "{agent_id}")}
                    </code>
                  </p>
                </div>

                {/* User Input */}
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">User Input</Label>
                  <Textarea
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    placeholder="Message sent to the agent (optional)"
                    className="min-h-[100px] text-xs font-mono resize-y"
                  />
                </div>

                {/* Core toggles */}
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 p-2.5 bg-muted/30 rounded-md border">
                  {(
                    [
                      [
                        "stream",
                        "Stream response",
                        streamEnabled,
                        setStreamEnabled,
                      ],
                      ["debug", "Debug mode", debugMode, setDebugMode],
                    ] as [string, string, boolean, (v: boolean) => void][]
                  ).map(([id, label, checked, setter]) => (
                    <div key={id} className="flex items-center gap-1.5">
                      <Checkbox
                        id={id}
                        checked={checked}
                        onCheckedChange={(v) => setter(v as boolean)}
                      />
                      <Label htmlFor={id} className="text-xs cursor-pointer">
                        {label}
                      </Label>
                    </div>
                  ))}
                </div>

                {/* Variables */}
                <KVEditor
                  label="Variables"
                  pairs={variables}
                  onChange={setVariables}
                />

                {/* Config Overrides */}
                <Collapsible
                  open={overridesOpen}
                  onOpenChange={setOverridesOpen}
                >
                  <CollapsibleTrigger className="flex items-center gap-2 w-full py-1 text-left hover:text-foreground/80">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs font-semibold flex-1">
                      Config Overrides
                    </span>
                    {overridesOpen ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    )}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-3 pt-2">
                      <p className="text-[10px] text-muted-foreground">
                        These override the agent's default model settings for
                        this run.
                      </p>

                      {/* Dedicated shortcut fields */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">
                            Temperature
                          </Label>
                          <Input
                            value={temperature}
                            onChange={(e) => setTemperature(e.target.value)}
                            placeholder="0.0–2.0"
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">
                            Max Output Tokens
                          </Label>
                          <Input
                            value={maxOutputTokens}
                            onChange={(e) => setMaxOutputTokens(e.target.value)}
                            placeholder="e.g. 4096"
                            className="h-7 text-xs"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Brain className="h-3 w-3" /> Reasoning Effort
                        </Label>
                        <Select
                          value={reasoningEffort || "__none__"}
                          onValueChange={(v) =>
                            setReasoningEffort(v === "__none__" ? "" : v)
                          }
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__" className="text-xs">
                              None (use agent default)
                            </SelectItem>
                            <SelectItem value="low" className="text-xs">
                              Low
                            </SelectItem>
                            <SelectItem value="medium" className="text-xs">
                              Medium
                            </SelectItem>
                            <SelectItem value="high" className="text-xs">
                              High
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">
                          Model Override (ai_model_id)
                        </Label>
                        <Input
                          value={modelOverride}
                          onChange={(e) => setModelOverride(e.target.value)}
                          placeholder="e.g. gpt-4o (overrides agent default)"
                          className="h-7 text-xs font-mono"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] text-muted-foreground">
                            Additional overrides (JSON)
                          </Label>
                          {!extraParsed.ok && (
                            <Badge
                              variant="destructive"
                              className="text-[9px] h-4 px-1"
                            >
                              Invalid JSON
                            </Badge>
                          )}
                        </div>
                        <Textarea
                          value={extraOverridesRaw}
                          onChange={(e) => setExtraOverridesRaw(e.target.value)}
                          placeholder='{"top_p": 0.9, "stop_sequences": ["END"]}'
                          className="min-h-[60px] text-xs font-mono resize-y"
                        />
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              {/* Execute / Cancel */}
              <div className="flex-shrink-0 p-3 border-t flex flex-col gap-2">
                <div className="flex gap-2">
                  {!isRunning ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={handleExecute}
                          disabled={!canExecute}
                          className="flex-1 h-8 text-sm gap-2"
                        >
                          <Play className="h-3.5 w-3.5" /> Execute
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">
                        Ctrl/Cmd + Enter
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Button
                      onClick={handleCancel}
                      variant="destructive"
                      className="flex-1 h-8 text-sm gap-2"
                    >
                      <Square className="h-3.5 w-3.5" /> Cancel
                    </Button>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={clearResults}
                        disabled={isRunning}
                        className="h-8 w-8 p-0"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      Clear results
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </Card>

            {/* Right: Results */}
            <Card className="col-span-8 h-full flex flex-col overflow-hidden p-3">
              <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">Results</span>
                  {statusBadge(execStatus)}
                  {requestId && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="outline"
                          className="text-[10px] h-5 px-1.5 font-mono cursor-default"
                        >
                          req: {requestId.slice(0, 8)}…
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent className="font-mono text-xs">
                        {requestId}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
                  {(stats.events > 0 || isRunning) && (
                    <>
                      <span>{stats.events} evt</span>
                      <span>{(stats.bytes / 1024).toFixed(1)} KB</span>
                      <span>{(stats.ms / 1000).toFixed(1)}s</span>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={clearResults}
                    disabled={isRunning}
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {errorMessage && (
                <div className="flex-shrink-0 mb-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive font-mono">
                  ❌ {errorMessage}
                </div>
              )}

              <Tabs
                defaultValue="text"
                className="flex-1 flex flex-col overflow-hidden min-h-0"
              >
                <TabsList className="grid grid-cols-4 h-8 flex-shrink-0">
                  <TabsTrigger value="text" className="text-xs">
                    Text Output
                  </TabsTrigger>
                  <TabsTrigger value="events" className="text-xs">
                    Stream Events
                  </TabsTrigger>
                  <TabsTrigger value="usage" className="text-xs">
                    Token Usage
                  </TabsTrigger>
                  <TabsTrigger value="request" className="text-xs">
                    Request
                  </TabsTrigger>
                </TabsList>

                <TabsContent
                  value="text"
                  className="flex-1 flex flex-col overflow-hidden mt-2 p-3 bg-muted/30 rounded border min-h-0"
                >
                  <div className="flex justify-end flex-shrink-0 mb-1">
                    <CopyButton text={textOutput} />
                  </div>
                  <div className="flex-1 overflow-y-auto min-h-0">
                    {isRunning && !textOutput && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting
                        for response…
                      </div>
                    )}
                    {textOutput ? (
                      <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed">
                        {textOutput}
                      </pre>
                    ) : !isRunning ? (
                      <p className="text-xs text-muted-foreground">
                        No text output yet. Execute an agent above.
                      </p>
                    ) : null}
                  </div>
                </TabsContent>

                <TabsContent
                  value="events"
                  className="flex-1 flex flex-col overflow-hidden mt-2 p-3 bg-muted rounded border min-h-0"
                >
                  <div className="flex justify-end flex-shrink-0 mb-1">
                    <CopyButton text={rawEvents} />
                  </div>
                  <div className="flex-1 overflow-y-auto min-h-0">
                    {isRunning && !rawEvents && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />{" "}
                        Streaming…
                      </div>
                    )}
                    <pre className="text-[11px] font-mono whitespace-pre-wrap text-foreground/80">
                      {rawEvents || (!isRunning ? "No events yet." : "")}
                    </pre>
                  </div>
                </TabsContent>

                <TabsContent
                  value="usage"
                  className="flex-1 overflow-y-auto mt-2 p-3 bg-muted/30 rounded border min-h-0"
                >
                  {tokenUsage.input_tokens !== null ||
                  tokenUsage.output_tokens !== null ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          {
                            label: "Input Tokens",
                            value: tokenUsage.input_tokens,
                          },
                          {
                            label: "Output Tokens",
                            value: tokenUsage.output_tokens,
                          },
                          tokenUsage.total_tokens !== null
                            ? {
                                label: "Total Tokens",
                                value: tokenUsage.total_tokens,
                              }
                            : null,
                        ]
                          .filter(Boolean)
                          .map(
                            (item) =>
                              item && (
                                <div
                                  key={item.label}
                                  className="p-3 bg-background rounded border"
                                >
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                                    {item.label}
                                  </p>
                                  <p className="text-2xl font-bold font-mono">
                                    {item.value?.toLocaleString() ?? "—"}
                                  </p>
                                </div>
                              ),
                          )}
                      </div>
                      <div className="p-2 bg-muted rounded text-[11px] text-muted-foreground font-mono">
                        {(stats.ms / 1000).toFixed(2)}s · {stats.events} events
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-sm text-muted-foreground">
                        {execStatus === "complete"
                          ? "No token usage in stream events."
                          : "Execute an agent to see token usage."}
                      </p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent
                  value="request"
                  className="flex-1 flex flex-col overflow-hidden mt-2 p-3 bg-muted rounded border min-h-0"
                >
                  <div className="flex justify-end flex-shrink-0 mb-1">
                    <CopyButton
                      text={`POST ${config.serverUrl}${ENDPOINTS.ai.agentStart(agentId || "{agent_id}")}\n\n${requestBody}`}
                    />
                  </div>
                  <div className="flex-1 overflow-y-auto min-h-0">
                    <pre className="text-[11px] font-mono whitespace-pre-wrap text-foreground/80">
                      {`POST ${config.serverUrl}${ENDPOINTS.ai.agentStart(agentId || "{agent_id}")}\n`}
                      {`Authorization: Bearer ${config.authToken || "<token>"}\n`}
                      {`Content-Type: application/json\n\n`}
                      {requestBody}
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
