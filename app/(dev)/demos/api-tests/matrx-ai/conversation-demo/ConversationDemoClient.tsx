"use client";

import { useState, useRef, useEffect } from "react";
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
  MessagesSquare,
  Play,
  Square,
  Zap,
  RotateCcw,
  Copy,
  Check,
  X,
  Loader2,
  Shuffle,
  User,
  SquareStack,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { parseNdjsonStream } from "@/lib/api/stream-parser";
import { useServerConfig } from "../_shared/useServerConfig";
import { ServerBar } from "../_shared/ServerBar";

// ─── Types ───────────────────────────────────────────────────────────────────

type ExecStatus = "idle" | "connecting" | "running" | "complete" | "error";

interface ConvTurn {
  role: "user" | "assistant" | "error";
  content: string;
  timestamp: string;
  turnId: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateUUID() {
  return (
    crypto.randomUUID?.() ??
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    })
  );
}

function ConvIdCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-7 p-0 flex-shrink-0"
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
        </Button>
      </TooltipTrigger>
      <TooltipContent className="text-xs">
        {copied ? "Copied!" : "Copy conversation ID"}
      </TooltipContent>
    </Tooltip>
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
  };
  const { label, variant } = map[status];
  return (
    <Badge variant={variant} className="text-[10px] h-5 px-1.5">
      {label}
    </Badge>
  );
}

// ─── Turn bubble ──────────────────────────────────────────────────────────────

function TurnBubble({ turn }: { turn: ConvTurn }) {
  if (turn.role === "error") {
    return (
      <div className="flex gap-2 items-start">
        <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-muted-foreground mb-1">
            {turn.timestamp}
          </p>
          <div className="bg-destructive/10 border border-destructive/20 rounded p-2 text-xs text-destructive font-mono">
            {turn.content}
          </div>
        </div>
      </div>
    );
  }

  const isUser = turn.role === "user";
  return (
    <div
      className={`flex gap-2 items-start ${isUser ? "flex-row-reverse" : ""}`}
    >
      <div
        className={`h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${isUser ? "bg-primary text-primary-foreground" : "bg-muted"}`}
      >
        {isUser ? <User className="h-3 w-3" /> : <SquareStack className="h-3 w-3" />}
      </div>
      <div
        className={`flex-1 min-w-0 ${isUser ? "items-end flex flex-col" : ""}`}
      >
        <p className="text-[10px] text-muted-foreground mb-1">
          {turn.role} · {turn.timestamp}
        </p>
        <div
          className={`rounded p-2.5 text-xs max-w-[85%] whitespace-pre-wrap ${isUser ? "bg-primary/10 border border-primary/20" : "bg-muted border"}`}
        >
          {turn.content}
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ConversationDemoClient() {
  const config = useServerConfig();

  // Conversation config
  const [conversationId, setConversationId] = useState("");
  const [userInput, setUserInput] = useState(
    "Hello! Can you continue our conversation?",
  );
  const [configOverridesRaw, setConfigOverridesRaw] = useState("{}");
  const [debugMode, setDebugMode] = useState(false);

  // History & execution
  const [history, setHistory] = useState<ConvTurn[]>([]);
  const [currentStream, setCurrentStream] = useState("");
  const [rawEvents, setRawEvents] = useState("");
  const [execStatus, setExecStatus] = useState<ExecStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stats, setStats] = useState({ events: 0, bytes: 0, ms: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);

  const isRunning = execStatus === "connecting" || execStatus === "running";
  const canContinue =
    conversationId.trim().length > 0 &&
    userInput.trim().length > 0 &&
    !isRunning;

  const configOverridesParsed = (() => {
    try {
      return JSON.parse(configOverridesRaw);
    } catch {
      return null;
    }
  })();

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

  // Auto-scroll history
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, currentStream]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (canContinue) handleContinue();
      }
      if (e.key === "Escape" && isRunning) handleCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canContinue, isRunning]);

  const handleContinue = async () => {
    if (!canContinue) return;

    const inputText = userInput.trim();
    const turnId = generateUUID();
    const timestamp = new Date().toLocaleTimeString();

    // Add user turn to history
    setHistory((prev) => [
      ...prev,
      { role: "user", content: inputText, timestamp, turnId },
    ]);
    setCurrentStream("");
    setErrorMessage(null);
    setRawEvents("");

    const start = Date.now();
    setStats({ events: 0, bytes: 0, ms: 0 });
    setExecStatus("connecting");
    startTimer(start);

    const controller = new AbortController();
    abortRef.current = controller;

    const body = {
      user_input: inputText,
      config_overrides: configOverridesParsed || undefined,
      stream: true,
      debug: debugMode,
    };

    let accumulated = "";

    try {
      const res = await fetch(
        `${config.serverUrl}/ai/conversations/${conversationId.trim()}`,
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

      const { events } = parseNdjsonStream(res, controller.signal);
      setExecStatus("running");

      let eventCount = 0,
        byteCount = 0;
      for await (const evt of events) {
        eventCount++;
        const line = JSON.stringify(evt, null, 2) + "\n\n";
        byteCount += line.length;
        setRawEvents((prev) => prev + line);
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
          const text = (evt.data as { text: string }).text;
          accumulated += text;
          setCurrentStream(accumulated);
        }
        if (evt.event === "error") {
          const d = evt.data as unknown as Record<string, string> | null;
          setErrorMessage(d?.user_message || d?.message || "Stream error");
        }
      }

      // Finalize: commit stream to history
      if (accumulated) {
        setHistory((prev) => [
          ...prev,
          {
            role: "assistant",
            content: accumulated,
            timestamp: new Date().toLocaleTimeString(),
            turnId: generateUUID(),
          },
        ]);
      }
      setCurrentStream("");
      setExecStatus("complete");
    } catch (err) {
      if (controller.signal.aborted) {
        if (accumulated) {
          setHistory((prev) => [
            ...prev,
            {
              role: "assistant",
              content: accumulated + " [cancelled]",
              timestamp: new Date().toLocaleTimeString(),
              turnId: generateUUID(),
            },
          ]);
          setCurrentStream("");
        }
        setExecStatus("idle");
        toast.info("Cancelled");
      } else {
        const msg = err instanceof Error ? err.message : "Request failed";
        setErrorMessage(msg);
        setHistory((prev) => [
          ...prev,
          {
            role: "error",
            content: msg,
            timestamp: new Date().toLocaleTimeString(),
            turnId: generateUUID(),
          },
        ]);
        setExecStatus("error");
        toast.error(msg);
      }
    } finally {
      stopTimer();
      setStats((s) => ({ ...s, ms: Date.now() - start }));
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  const handleWarm = async () => {
    if (!conversationId.trim()) {
      toast.warning("Enter a Conversation ID first");
      return;
    }
    try {
      const res = await fetch(
        `${config.serverUrl}/ai/conversations/${conversationId.trim()}/warm`,
        {
          method: "POST",
        },
      );
      const data = await res.json();
      toast.success(`Warm: ${data.status}`, {
        description: `conversation_id: ${data.conversation_id}`,
      });
    } catch (err) {
      toast.error("Warm failed", {
        description: extractErrorMessage(err),
      });
    }
  };

  const clearAll = (keepConvId = true) => {
    setHistory([]);
    setCurrentStream("");
    setRawEvents("");
    setErrorMessage(null);
    setStats({ events: 0, bytes: 0, ms: 0 });
    setExecStatus("idle");
    if (!keepConvId) setConversationId("");
  };

  const requestBodyStr = JSON.stringify(
    {
      user_input: userInput,
      config_overrides: configOverridesParsed || {},
      stream: true,
      debug: debugMode,
    },
    null,
    2,
  );

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col overflow-hidden bg-background">
        {/* Header */}
        <div className="flex-shrink-0 px-3 pt-2 pb-0">
          <ServerBar
            config={config}
            title={
              <div className="flex items-center gap-2 flex-shrink-0">
                <MessagesSquare className="h-4 w-4 text-primary" />
                <h1 className="text-base font-bold">Conversation Demo</h1>
              </div>
            }
            actions={
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleWarm}
                    disabled={!conversationId.trim() || isRunning}
                    className="h-7 text-xs px-2.5 gap-1.5"
                  >
                    <Zap className="h-3 w-3" /> Warm
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">
                  POST /api/ai/conversations/&#123;id&#125;/warm
                </TooltipContent>
              </Tooltip>
            }
          />
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 px-3 py-2">
          <div className="grid grid-cols-12 gap-2 h-full">
            {/* Left: Config + Input */}
            <Card className="col-span-4 h-full flex flex-col overflow-hidden">
              <div className="flex-shrink-0 p-3 space-y-3 border-b">
                {/* Conversation ID */}
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">
                    Conversation ID <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex gap-1">
                    <Input
                      value={conversationId}
                      onChange={(e) => setConversationId(e.target.value)}
                      placeholder="UUID of existing conversation"
                      className="h-7 text-xs font-mono flex-1 min-w-0"
                    />
                    <ConvIdCopyButton text={conversationId} />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConversationId(generateUUID())}
                          className="h-7 w-7 p-0 flex-shrink-0"
                        >
                          <Shuffle className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">
                        Generate new UUID
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                {/* Config overrides */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs font-semibold">
                      Config Overrides
                    </Label>
                    {configOverridesParsed === null && (
                      <Badge
                        variant="destructive"
                        className="text-[10px] h-4 px-1"
                      >
                        Invalid JSON
                      </Badge>
                    )}
                  </div>
                  <Textarea
                    value={configOverridesRaw}
                    onChange={(e) => setConfigOverridesRaw(e.target.value)}
                    placeholder='{"temperature": 0.7}'
                    className="min-h-[55px] text-xs font-mono resize-y"
                  />
                </div>

                {/* Debug toggle */}
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="debug-conv"
                    checked={debugMode}
                    onCheckedChange={(v) => setDebugMode(v as boolean)}
                  />
                  <Label
                    htmlFor="debug-conv"
                    className="text-xs cursor-pointer"
                  >
                    Debug mode
                  </Label>
                </div>
              </div>

              {/* User input */}
              <div className="flex-1 min-h-0 p-3 flex flex-col gap-2">
                <Label className="text-xs font-semibold flex-shrink-0">
                  User Input
                </Label>
                <Textarea
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder="Your message to continue the conversation…"
                  className="flex-1 min-h-0 text-xs font-mono resize-none"
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                      e.preventDefault();
                      if (canContinue) handleContinue();
                    }
                  }}
                />
              </div>

              {/* Actions */}
              <div className="flex-shrink-0 p-3 border-t flex flex-col gap-2">
                <div className="flex gap-2">
                  {!isRunning ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={handleContinue}
                          disabled={!canContinue}
                          className="flex-1 h-8 gap-2 text-sm"
                        >
                          <Play className="h-3.5 w-3.5" /> Continue
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
                      className="flex-1 h-8 gap-2 text-sm"
                    >
                      <Square className="h-3.5 w-3.5" /> Cancel
                    </Button>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => clearAll()}
                        disabled={isRunning}
                        className="h-8 w-8 p-0"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      Clear history + results (keeps conversation ID)
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-[10px] text-muted-foreground text-center">
                  POST /api/ai/conversations/
                  <span className="font-mono">{conversationId || "{id}"}</span>
                </p>
              </div>
            </Card>

            {/* Right: History + Events */}
            <Card className="col-span-8 h-full flex flex-col overflow-hidden">
              <div className="flex items-center justify-between flex-shrink-0 px-3 pt-2 pb-1.5 border-b">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">
                    Conversation History
                  </span>
                  {statusBadge(execStatus)}
                  {history.length > 0 && (
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                      {history.length} turns
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
                  {(stats.events > 0 || isRunning) && (
                    <>
                      <span>{stats.events} evt</span>
                      <span>{(stats.ms / 1000).toFixed(1)}s</span>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => clearAll()}
                    disabled={isRunning}
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <Tabs
                defaultValue="history"
                className="flex-1 flex flex-col overflow-hidden min-h-0"
              >
                <TabsList className="grid grid-cols-3 h-8 mx-3 mt-2 flex-shrink-0">
                  <TabsTrigger value="history" className="text-xs">
                    Conversation
                  </TabsTrigger>
                  <TabsTrigger value="events" className="text-xs">
                    Stream Events
                  </TabsTrigger>
                  <TabsTrigger value="request" className="text-xs">
                    Request
                  </TabsTrigger>
                </TabsList>

                {/* Conversation history */}
                <TabsContent
                  value="history"
                  className="flex-1 overflow-y-auto mt-2 px-3 pb-3 space-y-3 min-h-0"
                >
                  {history.length === 0 && !currentStream ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <MessagesSquare className="h-10 w-10 opacity-20 mb-2" />
                      <p className="text-xs">
                        Enter a conversation ID and send a message to start
                      </p>
                    </div>
                  ) : (
                    <>
                      {history.map((turn) => (
                        <TurnBubble key={turn.turnId} turn={turn} />
                      ))}
                      {/* Live streaming assistant turn */}
                      {currentStream && (
                        <div className="flex gap-2 items-start">
                          <div className="h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-muted">
                            <SquareStack className="h-3 w-3" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] text-muted-foreground mb-1">
                              assistant · streaming…
                            </p>
                            <div className="bg-muted border rounded p-2.5 text-xs whitespace-pre-wrap">
                              {currentStream}
                              <span className="inline-block w-0.5 h-3 bg-foreground animate-pulse ml-0.5 align-text-bottom" />
                            </div>
                          </div>
                        </div>
                      )}
                      {isRunning && !currentStream && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground pl-8">
                          <Loader2 className="h-3 w-3 animate-spin" />{" "}
                          Connecting…
                        </div>
                      )}
                      <div ref={historyEndRef} />
                    </>
                  )}
                </TabsContent>

                {/* Raw stream events */}
                <TabsContent
                  value="events"
                  className="flex-1 flex flex-col overflow-hidden mt-2 px-3 pb-3 min-h-0"
                >
                  <div className="flex justify-end flex-shrink-0 mb-1">
                    <CopyButton text={rawEvents} />
                  </div>
                  <div className="flex-1 overflow-y-auto bg-muted rounded border p-3 min-h-0">
                    {isRunning && !rawEvents && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />{" "}
                        Streaming…
                      </div>
                    )}
                    <pre className="text-[11px] font-mono whitespace-pre-wrap">
                      {rawEvents || (!isRunning ? "No events yet." : "")}
                    </pre>
                  </div>
                </TabsContent>

                {/* Request body */}
                <TabsContent
                  value="request"
                  className="flex-1 flex flex-col overflow-hidden mt-2 px-3 pb-3 min-h-0"
                >
                  <div className="flex justify-end flex-shrink-0 mb-1">
                    <CopyButton
                      text={`POST ${config.serverUrl}/api/ai/conversations/${conversationId}\n\n${requestBodyStr}`}
                    />
                  </div>
                  <div className="flex-1 overflow-y-auto bg-muted rounded border p-3 min-h-0">
                    <pre className="text-[11px] font-mono whitespace-pre-wrap text-foreground/80">
                      {`POST ${config.serverUrl}/api/ai/conversations/${conversationId || "{id}"}\n`}
                      {`Authorization: Bearer ${config.authToken || "<token>"}\n`}
                      {`Content-Type: application/json\n\n`}
                      {requestBodyStr}
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
