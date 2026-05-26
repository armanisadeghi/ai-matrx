"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { parseNdjsonStream } from "@/lib/api/stream-parser";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { extractErrorMessage } from "@/utils/errors";
import {
  Network,
  Loader2,
  Send,
  Zap,
  Square,
  RefreshCw,
  MessageSquarePlus,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Trash2,
  Key,
  Flame,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ApiTestConfigPanel } from "@/components/api-test-config/ApiTestConfigPanel";
import { useApiTestConfig } from "@/components/api-test-config/useApiTestConfig";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
// Legacy agent demo — stubbed during Redux unification. Demo still renders
// but chatConversations sync is inert (chat slice removed).
import { createAsyncThunk } from "@reduxjs/toolkit";
const chatConversationsActions = {
  startSession: (_payload: unknown) => ({ type: "noop" as const, payload: _payload }),
  addMessage: (_payload: unknown) => ({ type: "noop" as const, payload: _payload }),
  updateMessage: (_payload: unknown) => ({ type: "noop" as const, payload: _payload }),
  setSessionStatus: (_payload: unknown) => ({ type: "noop" as const, payload: _payload }),
  clearProtocolDbSnapshot: (_payload: unknown) => ({ type: "noop" as const, payload: _payload }),
};
const loadConversationHistory = createAsyncThunk(
  "legacy/loadConversationHistory",
  async (_payload: unknown) => undefined,
);
import { AgentWireFoldComparison } from "./AgentWireFoldComparison";
import { AgentCanonicalDbPanel } from "./AgentCanonicalDbPanel";

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────
interface AgentStreamEvent {
  event: string;
  data: any;
}

type TestMode = "warm" | "new" | "continue" | "cancel";

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface RunLog {
  id: string;
  mode: TestMode;
  promptId?: string;
  conversationId?: string;
  userInput?: string;
  events: AgentStreamEvent[];
  textOutput: string;
  error: string | null;
  status: "running" | "success" | "error" | "cancelled";
  startedAt: Date;
  endedAt?: Date;
  requestId?: string;
}

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────
const SAMPLE_PROMPT_ID = "a6617ebd-1114-4cc0-84b7-6b0c9ee235c8";

/** Stable session for `chatConversations` on this demo route only. */
const AGENT_API_TEST_SESSION_ID = "a0000000-0000-4000-8000-000000000001";

function shortId() {
  return Math.random().toString(36).substring(2, 8);
}

function timeAgo(date: Date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

// ─────────────────────────────────────────────────────
// Section header
// ─────────────────────────────────────────────────────
function SectionHeader({
  icon,
  title,
  sub,
}: {
  icon: React.ReactNode;
  title: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <div className="text-primary">{icon}</div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// RunLog card
// ─────────────────────────────────────────────────────
function RunLogCard({
  log,
  onCopy,
}: {
  log: RunLog;
  onCopy: (text: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const statusColor =
    log.status === "success"
      ? "text-green-500"
      : log.status === "error"
        ? "text-destructive"
        : log.status === "cancelled"
          ? "text-yellow-500"
          : "text-blue-500";

  const statusIcon =
    log.status === "running" ? (
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
    ) : log.status === "success" ? (
      <CheckCircle2 className="w-3.5 h-3.5" />
    ) : (
      <AlertCircle className="w-3.5 h-3.5" />
    );

  const modeLabel: Record<TestMode, string> = {
    warm: "Warm Up",
    new: "New Conversation",
    continue: "Continue",
    cancel: "Cancel",
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 bg-card cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className={cn("flex items-center gap-1", statusColor)}>
          {statusIcon}
        </span>
        <Badge
          variant="secondary"
          className="text-[10px] px-1.5 py-0 h-4 font-mono"
        >
          {modeLabel[log.mode]}
        </Badge>
        {log.conversationId && (
          <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[120px]">
            {log.conversationId}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">
          {timeAgo(log.startedAt)}
        </span>
        {expanded ? (
          <ChevronUp className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        )}
      </div>

      {expanded && (
        <div className="border-t border-border bg-muted/20 p-3 space-y-2">
          {log.error && (
            <div className="p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
              {log.error}
            </div>
          )}
          {log.textOutput && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Text Output
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 p-0"
                  onClick={() => onCopy(log.textOutput)}
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
              <pre className="text-[11px] leading-relaxed text-foreground/80 bg-background border border-border rounded p-2 whitespace-pre-wrap max-h-48 overflow-y-auto">
                {log.textOutput}
              </pre>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Stream Events ({log.events.length})
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 w-5 p-0"
                onClick={() => onCopy(JSON.stringify(log.events, null, 2))}
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
            <pre className="text-[10px] font-mono leading-relaxed text-foreground/70 bg-background border border-border rounded p-2 whitespace-pre-wrap max-h-40 overflow-y-auto">
              {log.events.map((e) => JSON.stringify(e)).join("\n")}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Main client
// ─────────────────────────────────────────────────────
export default function AgentTestClient() {
  const dispatch = useAppDispatch();
  const apiConfig = useApiTestConfig({ defaultServerType: "local" });

  // Auth token is now auto-loaded from the Supabase session inside useApiTestConfig.

  // ── Test state ──
  const [promptId, setPromptId] = useState(SAMPLE_PROMPT_ID);
  const [userInput, setUserInput] = useState(
    "Hello! Can you help me test the agent?",
  );
  const [activeConversationId, setActiveConversationId] = useState("");
  const [continueInput, setContinueInput] = useState(
    "And what else can you tell me?",
  );

  const [runLogs, setRunLogs] = useState<RunLog[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [liveText, setLiveText] = useState("");
  const [liveEvents, setLiveEvents] = useState<AgentStreamEvent[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const isRunning = activeRunId !== null;

  useEffect(() => {
    dispatch(
      chatConversationsActions.startSession({
        sessionId: AGENT_API_TEST_SESSION_ID,
        agentId: promptId.trim() || SAMPLE_PROMPT_ID,
      }),
    );
  }, [dispatch, promptId]);

  useEffect(() => {
    const cid = activeConversationId.trim();
    if (!cid) {
      dispatch(
        chatConversationsActions.clearProtocolDbSnapshot(
          AGENT_API_TEST_SESSION_ID,
        ),
      );
      return;
    }
    if (isRunning) return;

    void dispatch(
      loadConversationHistory({
        sessionId: AGENT_API_TEST_SESSION_ID,
        conversationId: cid,
        agentId: promptId.trim() || SAMPLE_PROMPT_ID,
      }),
    );
  }, [activeConversationId, dispatch, isRunning, promptId]);

  const addLog = useCallback((log: RunLog) => {
    setRunLogs((prev) => [log, ...prev].slice(0, 20));
    return log;
  }, []);

  const updateLog = useCallback((id: string, updates: Partial<RunLog>) => {
    setRunLogs((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...updates } : l)),
    );
  }, []);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  }, []);

  // ── 1. Warm Up Agent ──────────────────────────────
  const handleWarmUp = useCallback(async () => {
    if (!promptId.trim()) return;
    const log: RunLog = {
      id: shortId(),
      mode: "warm",
      promptId,
      events: [],
      textOutput: "",
      error: null,
      status: "running",
      startedAt: new Date(),
    };
    setActiveRunId(log.id);
    addLog(log);
    setLiveText("");
    setLiveEvents([]);

    try {
      const res = await fetch(
        `${apiConfig.baseUrl}${ENDPOINTS.ai.agentWarm(promptId)}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiConfig.authToken}` },
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      updateLog(log.id, {
        status: "success",
        textOutput: "Agent warmed successfully.",
        endedAt: new Date(),
      });
      setLiveText("✅ Agent warmed successfully.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Warm-up failed";
      updateLog(log.id, { status: "error", error: msg, endedAt: new Date() });
      setLiveText(`❌ ${msg}`);
    } finally {
      setActiveRunId(null);
    }
  }, [apiConfig.authToken, apiConfig.baseUrl, promptId, addLog, updateLog]);

  // ── Shared streaming executor ─────────────────────
  const runStream = useCallback(
    async (log: RunLog, url: string, body: Record<string, unknown>) => {
      dispatch(
        chatConversationsActions.clearProtocolDbSnapshot(
          AGENT_API_TEST_SESSION_ID,
        ),
      );
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiConfig.authToken}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          let msg = `HTTP ${res.status}`;
          try {
            const d = await res.json();
            msg =
              d?.error?.user_message ||
              d?.error?.message ||
              d?.error ||
              d?.detail ||
              msg;
          } catch {
            /* noop */
          }
          throw new Error(extractErrorMessage(msg));
        }

        if (!res.body) throw new Error("No response body");

        const { events } = parseNdjsonStream(res);
        const accumulated: AgentStreamEvent[] = [];
        let text = "";
        let convId: string | undefined;
        let reqId: string | undefined;

        for await (const ev of events) {
          if (controller.signal.aborted) break;
          accumulated.push(ev as unknown as AgentStreamEvent);
          setLiveEvents([...accumulated]);

          const d = ev.data as Record<string, unknown>;
          if (ev.event === "chunk" && typeof d.text === "string") {
            text += d.text;
            setLiveText(text);
          }
          if (typeof d.conversation_id === "string") {
            convId = d.conversation_id;
            setActiveConversationId(convId);
          }
          if (typeof d.request_id === "string") reqId = d.request_id;
          if (ev.event === "error") {
            const msg =
              typeof d.user_message === "string"
                ? d.user_message
                : typeof d.message === "string"
                  ? d.message
                  : JSON.stringify(d);
            throw new Error(msg);
          }
        }

        updateLog(log.id, {
          status: "success",
          events: accumulated,
          textOutput: text,
          conversationId: convId || log.conversationId,
          requestId: reqId,
          endedAt: new Date(),
        });
      } catch (err: any) {
        if (err?.name === "AbortError" || controller.signal.aborted) {
          updateLog(log.id, { status: "cancelled", endedAt: new Date() });
        } else {
          const msg = err instanceof Error ? err.message : "An error occurred";
          updateLog(log.id, {
            status: "error",
            error: msg,
            endedAt: new Date(),
          });
          setLiveText(`❌ ${msg}`);
        }
      } finally {
        abortControllerRef.current = null;
        setActiveRunId(null);
      }
    },
    [apiConfig.authToken, apiConfig.baseUrl, dispatch, updateLog],
  );

  // ── 2. New Conversation ───────────────────────────
  const handleNewConversation = useCallback(async () => {
    if (!promptId.trim() || !userInput.trim()) return;
    const log: RunLog = {
      id: shortId(),
      mode: "new",
      promptId,
      userInput,
      events: [],
      textOutput: "",
      error: null,
      status: "running",
      startedAt: new Date(),
    };
    setActiveRunId(log.id);
    addLog(log);
    setLiveText("");
    setLiveEvents([]);

    await runStream(
      log,
      `${apiConfig.baseUrl}${ENDPOINTS.ai.agentStart(promptId)}`,
      {
        user_input: userInput,
        stream: true,
        debug: true,
      },
    );
  }, [promptId, userInput, apiConfig.baseUrl, addLog, runStream]);

  // ── 3. Continue Conversation ──────────────────────
  const handleContinue = useCallback(async () => {
    const convId = activeConversationId.trim();
    if (!convId || !continueInput.trim()) return;
    const log: RunLog = {
      id: shortId(),
      mode: "continue",
      conversationId: convId,
      userInput: continueInput,
      events: [],
      textOutput: "",
      error: null,
      status: "running",
      startedAt: new Date(),
    };
    setActiveRunId(log.id);
    addLog(log);
    setLiveText("");
    setLiveEvents([]);

    await runStream(
      log,
      `${apiConfig.baseUrl}${ENDPOINTS.ai.conversationContinue(convId)}`,
      {
        user_input: continueInput,
        stream: true,
        debug: true,
      },
    );
  }, [
    activeConversationId,
    continueInput,
    apiConfig.baseUrl,
    addLog,
    runStream,
  ]);

  // ── 4. Cancel Stream ──────────────────────────────
  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background text-sm">
      {/* ── Header + Config ── */}
      <div className="flex-shrink-0 border-b border-border bg-card">
        <div className="flex items-center gap-2 px-4 pt-3 pb-1">
          <Network className="w-5 h-5 text-primary" />
          <h1 className="text-base font-bold">Agent Testing Playground</h1>
          <Badge
            variant={isRunning ? "default" : "secondary"}
            className="ml-auto text-[10px]"
          >
            {isRunning ? "Running..." : "Ready"}
          </Badge>
        </div>
        <div className="px-4 pb-2">
          <ApiTestConfigPanel config={apiConfig} />
        </div>
        {/* Session token notice */}
        {!apiConfig.hasToken && (
          <div className="mx-4 mb-2 flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded text-[11px] text-amber-600 dark:text-amber-400">
            <Key className="w-3 h-3 flex-shrink-0" />
            No auth token — session JWT will be auto-loaded if you&apos;re
            logged in. Set manually above if needed.
          </div>
        )}
      </div>

      {/* ── Two-column body ── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* ── LEFT: Controls ── */}
        <div className="w-[200px] flex-shrink-0 border-r border-border overflow-y-auto px-4 py-4 space-y-5">
          {/* 1. Warm Up */}
          <section>
            <SectionHeader
              icon={<Flame className="w-4 h-4" />}
              title="1. Warm Up Agent"
              sub="Preheat server cache — no auth needed"
            />
            <div className="space-y-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">
                  Prompt / Agent ID
                </Label>
                <Input
                  value={promptId}
                  onChange={(e) => setPromptId(e.target.value)}
                  placeholder="UUID of prompt/agent"
                  className="h-7 text-[10px] font-mono mt-0.5"
                  disabled={isRunning}
                />
              </div>
              <Button
                onClick={handleWarmUp}
                disabled={!promptId.trim() || isRunning}
                size="sm"
                variant="outline"
                className="w-full h-7 text-xs"
              >
                {isRunning && runLogs[0]?.mode === "warm" ? (
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                ) : (
                  <Zap className="w-3 h-3 mr-1" />
                )}
                Warm Up
              </Button>
            </div>
          </section>

          {/* 2. New Conversation */}
          <section className="border-t border-border pt-4">
            <SectionHeader
              icon={<MessageSquarePlus className="w-4 h-4" />}
              title="2. New Conversation"
              sub="Start a fresh agent session"
            />
            <div className="space-y-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">
                  User Input
                </Label>
                <textarea
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  rows={3}
                  placeholder="Your message to the agent..."
                  disabled={isRunning}
                  className="mt-0.5 w-full text-xs resize-none rounded-md border border-input bg-background px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                />
              </div>
              <Button
                onClick={handleNewConversation}
                disabled={!promptId.trim() || !userInput.trim() || isRunning}
                size="sm"
                className="w-full h-7 text-xs"
              >
                {isRunning && runLogs[0]?.mode === "new" ? (
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                ) : (
                  <Send className="w-3 h-3 mr-1" />
                )}
                Start Conversation
              </Button>
            </div>
          </section>

          {/* 3. Continue Conversation */}
          <section className="border-t border-border pt-4">
            <SectionHeader
              icon={<MessageSquare className="w-4 h-4" />}
              title="3. Continue Conversation"
              sub="Continue an existing conversation by ID"
            />
            <div className="space-y-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">
                  Conversation ID
                  {activeConversationId && (
                    <span className="ml-1 text-green-500">
                      (auto-filled from last run)
                    </span>
                  )}
                </Label>
                <Input
                  value={activeConversationId}
                  onChange={(e) => setActiveConversationId(e.target.value)}
                  placeholder="conversation UUID"
                  className="h-7 text-[10px] font-mono mt-0.5"
                  disabled={isRunning}
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">
                  Follow-up Message
                </Label>
                <textarea
                  value={continueInput}
                  onChange={(e) => setContinueInput(e.target.value)}
                  rows={2}
                  placeholder="Continue the conversation..."
                  disabled={isRunning}
                  className="mt-0.5 w-full text-xs resize-none rounded-md border border-input bg-background px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                />
              </div>
              <Button
                onClick={handleContinue}
                disabled={
                  !activeConversationId.trim() ||
                  !continueInput.trim() ||
                  isRunning
                }
                size="sm"
                variant="secondary"
                className="w-full h-7 text-xs"
              >
                {isRunning && runLogs[0]?.mode === "continue" ? (
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="w-3 h-3 mr-1" />
                )}
                Continue
              </Button>
            </div>
          </section>

          {/* 4. Cancel */}
          <section className="border-t border-border pt-4">
            <SectionHeader
              icon={<Square className="w-4 h-4" />}
              title="4. Cancel Mid-Stream"
              sub="Abort the currently running request"
            />
            <Button
              onClick={handleCancel}
              disabled={!isRunning}
              size="sm"
              variant="destructive"
              className="w-full h-7 text-xs"
            >
              <Square className="w-3 h-3 mr-1" />
              Cancel Stream
            </Button>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Uses AbortController to cancel the in-flight fetch. The backend
              stream will stop when the connection drops.
            </p>
          </section>
        </div>

        {/* ── RIGHT: Live output + run history ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Live output */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col border-b border-border">
            <div className="flex items-center justify-between px-4 py-1.5 border-b border-border bg-card flex-shrink-0">
              <span className="text-xs font-semibold">Live Output</span>
              <div className="flex items-center gap-2">
                {isRunning && (
                  <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 p-0"
                  onClick={() => {
                    setLiveText("");
                    setLiveEvents([]);
                  }}
                  disabled={isRunning}
                >
                  <Trash2 className="w-3 h-3 text-muted-foreground" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 p-0"
                  onClick={() => copyToClipboard(liveText)}
                  disabled={!liveText}
                >
                  <Copy className="w-3 h-3 text-muted-foreground" />
                </Button>
              </div>
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_minmax(0,2.5fr)_minmax(0,2.5fr)] gap-0 divide-x divide-border overflow-hidden">
              {/* Text — ~half the relative width of the old 1fr-in-(1fr+2fr) column */}
              <div className="overflow-y-auto p-3">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  Text
                </p>
                {liveText ? (
                  <pre className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">
                    {liveText}
                  </pre>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    Waiting for output...
                  </p>
                )}
              </div>
              {/* Wire ↔ fold: same row = same arrival index */}
              <AgentWireFoldComparison events={liveEvents} />
              <div className="min-h-0 h-full overflow-hidden">
                <AgentCanonicalDbPanel sessionId={AGENT_API_TEST_SESSION_ID} />
              </div>
            </div>
          </div>

          {/* Run history */}
          <div className="flex-shrink-0 h-[220px] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-1.5 border-b border-border flex-shrink-0 bg-card">
              <span className="text-xs font-semibold">Run History</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 text-[10px] px-2"
                onClick={() => setRunLogs([])}
                disabled={runLogs.length === 0}
              >
                Clear
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
              {runLogs.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  No runs yet
                </p>
              ) : (
                runLogs.map((log) => (
                  <RunLogCard key={log.id} log={log} onCopy={copyToClipboard} />
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
