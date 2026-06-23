"use client";

/**
 * Tool renderer — "in action" demo.
 *
 * A FAITHFUL replica of how a tool call renders inside the real `/chat` stream.
 * Pick a tool, press Play, and watch ONE realistic assistant turn stream out
 * EXACTLY as it would in chat:
 *
 *   intro markdown → thinking trace → "about to act" header → the tool call
 *   (streaming via the canonical simulator, driven by REAL `cx_tool_call`
 *   data) → wrap-up markdown.
 *
 * The render area is the EXACT chat-response column: `<ChatResultColumn>`
 * (`max-w-3xl mx-auto px-2`, the same constraint `AgentConversationColumn`
 * applies to the live transcript), sitting on `bg-background` with NO card /
 * border, centered on the page and totally independent of the toolbar above
 * it. The markdown → tool → markdown transitions reuse the SAME components the
 * real transcript uses — `MarkdownStream` (assistant markdown), `ThinkingTrace`
 * (thinking), `ToolCallVisualization` (the tool) — so spacing and width are
 * byte-identical to production.
 *
 * The whole turn streams under ONE clock with a live speed control
 * (0.5× / 1× / 2× / 4×) plus Play / Reset.
 *
 * Route: /demos/tool-viz/in-action   (dev profile only)
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Play, RotateCcw, Loader2, Database, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import MarkdownStream from "@/components/MarkdownStream";
import ThinkingTrace from "@/components/mardown-display/blocks/thinking-reasoning/ThinkingTrace";
import { ToolCallVisualization } from "@/features/tool-call-visualization/components/ToolCallVisualization";
import { ChatResultColumn } from "@/features/tool-call-visualization/components/ChatResultColumn";
import { toolRendererRegistry } from "@/features/tool-call-visualization/registry/registry";
import {
  buildSimpleRecording,
  buildResearchRecording,
  buildSearchRecording,
  type StreamRecording,
} from "@/features/tool-call-visualization/simulator/streamRecording";
import { useSimulatedToolEntry } from "@/features/tool-call-visualization/simulator/useSimulatedToolEntry";
import { cxToolCallToLifecycleEntry } from "@/features/tool-call-visualization/utils/cxToolCallToLifecycleEntry";
import type { CxToolCallRecord } from "@/features/agents/redux/execution-system/observability/observability.slice";
import { supabase } from "@/utils/supabase/client";

// ─── Tool list ────────────────────────────────────────────────────────────────
// The picker pulls from the registered inline renderers (the tools that have a
// custom UI) PLUS a curated set of tools that have real `cx_tool_call` samples
// in the DB. Each tool comes with the canned "around" content for its turn so
// the render proves spacing across the whole assistant message, not a lone card.

interface ToolDef {
  /** Canonical tool name (registry key / `cx_tool_call.tool_name`). */
  name: string;
  /** Friendly label for the picker. */
  label: string;
  /** Intro markdown the agent "writes" before acting. */
  intro: string;
  /** The model's thinking trace (rendered via ThinkingTrace). */
  thinking: string;
  /** A `##` header + a sentence that reads like the agent is about to act. */
  actionHeader: string;
  /** Wrap-up markdown after the tool returns. */
  outro: string;
  /** How slow the tool "works" before completing, ms (pre-speed-scale). */
  workMs?: number;
  /** Synthetic fallback args, used only when no real sample exists. */
  fallbackArgs: Record<string, unknown>;
  /** Synthetic fallback result, used only when no real sample exists. */
  fallbackResult: unknown;
}

const TOOLS: ToolDef[] = [
  {
    name: "web_search",
    label: "Web Search",
    intro:
      "Great question. Let me pull the most recent, credible sources on this before I answer — I don't want to give you anything stale.",
    thinking:
      "The user is asking about a fast-moving topic, so my training data is likely out of date. I should run a focused web search across a few angles, then synthesize the strongest sources rather than relying on memory. Let me search now.",
    actionHeader:
      "## Searching the web\n\nRunning a search across the most relevant queries — one moment.",
    outro:
      "Based on those results, here's the picture: the sources broadly agree on the headline finding, with a couple of credible dissents worth noting. Want me to go deeper on any single source, or draft a short summary you can share?",
    workMs: 1600,
    fallbackArgs: { query: "latest findings" },
    fallbackResult:
      'Searched the web.\n\n## "latest findings" (3 results)\n\n1. Example Source — a credible overview of the topic.\n2. Second Source — corroborates the first with additional detail.\n3. Third Source — a useful dissenting view.',
  },
  {
    name: "research_web",
    label: "Deep Research",
    intro:
      "This deserves a proper, multi-angle look rather than a single search. Let me run deep research across several queries and bring back the strongest evidence.",
    thinking:
      "This is a research-grade question. A single query won't cut it — I'll fan out across a few framings (definitions, current state, criticisms) so the synthesis is balanced. Each query's results will come back as its own section; I'll weave them together at the end.",
    actionHeader:
      "## Researching\n\nFanning out across several queries — results will stream in section by section.",
    outro:
      "That's a solid evidence base. The throughline across queries is consistent, and I've flagged where sources disagree. I can now turn this into a cited report, a slide outline, or a short brief — your call.",
    workMs: 2200,
    fallbackArgs: { query: "comprehensive analysis" },
    fallbackResult:
      'All Search Results\n\nSearched: comprehensive analysis\n\n## "comprehensive analysis" (4 results)\n\n1. Primary source with the core finding.\n2. Supporting analysis.\n3. Methodological critique.\n4. Recent update.',
  },
  {
    name: "sql",
    label: "SQL Query",
    intro:
      "Let me check the database directly so I'm giving you the real numbers, not an estimate.",
    thinking:
      "I can answer this precisely by querying the table rather than guessing. I'll write a small read-only query, scoped tightly, and report exactly what comes back.",
    actionHeader:
      "## Querying the database\n\nRunning a focused query against the relevant table.",
    outro:
      "There's the live result straight from the database. If you'd like, I can turn this into a saved view or chart it for you.",
    workMs: 900,
    fallbackArgs: { sql: "select count(*) from cx_tool_call" },
    fallbackResult: { rows: [{ count: 1234 }], rowCount: 1 },
  },
  {
    name: "data",
    label: "Fetch a record",
    intro: "Let me pull up that record so we're both looking at the same thing.",
    thinking:
      "The user referenced a specific entity. Rather than describe it from memory, I'll fetch the canonical record so the details (status, name, ids) are exact.",
    actionHeader:
      "## Fetching the record\n\nLooking it up now.",
    outro:
      "Here's the record. It's currently active — want me to open it, or make a change?",
    workMs: 800,
    fallbackArgs: { action: "get", resource: "project" },
    fallbackResult: {
      resource_type: "project",
      record: {
        id: "2c3d7caf-678a-423a-9c5c-d5b1d19b5934",
        name: "Universal Layout for Org Scope & Context System",
        status: "active",
      },
    },
  },
  {
    name: "shell_execute",
    label: "Run a shell command",
    intro: "Let me check that on the box directly.",
    thinking:
      "The fastest way to answer this is to run the command and read the real output, rather than reason about what it would probably print.",
    actionHeader:
      "## Running the command\n\nExecuting now.",
    outro:
      "That's the actual output. Want me to act on what it shows?",
    workMs: 1100,
    fallbackArgs: { command: "git log --oneline -3" },
    fallbackResult: {
      stdout: "d4bb8f6c1 fix(tool-viz)\n2026bc149 release\n8c11e56c0 cleanup",
      stderr: "",
      exit_code: 0,
    },
  },
  {
    name: "fs_list",
    label: "List a directory",
    intro: "Let me take a look at what's in that directory.",
    thinking:
      "I should list the directory before assuming its contents — directory state changes, and I want to reference real entries.",
    actionHeader: "## Listing the directory\n\nReading its contents now.",
    outro:
      "Those are the entries. Which one would you like me to open or work in?",
    workMs: 700,
    fallbackArgs: { path: "/home/agent/repos", recursive: false },
    fallbackResult: {
      path: "/home/agent/repos",
      entries: [
        { name: "matrx-frontend", is_dir: true },
        { name: "aidream", is_dir: true },
        { name: "README.md", is_dir: false },
      ],
    },
  },
  {
    name: "news_get_headlines",
    label: "News Headlines",
    intro: "Let me grab the latest headlines on that for you.",
    thinking:
      "News is time-sensitive, so I'll fetch current headlines rather than rely on training data, then summarize the themes.",
    actionHeader: "## Fetching headlines\n\nPulling the latest now.",
    outro:
      "Those are the current headlines. Want me to summarize the throughline or dig into one?",
    workMs: 1200,
    fallbackArgs: { query: "technology" },
    fallbackResult: {
      total_results: 3,
      articles: [
        { title: "Example headline one", source: "Wire" },
        { title: "Example headline two", source: "Daily" },
      ],
    },
  },
  {
    name: "note",
    label: "Save a note",
    intro: "Good — I'll capture that as a note so we can build on it later.",
    thinking:
      "This is worth persisting. I'll save it under a clear label so it's easy to find and keep editing.",
    actionHeader: "## Saving the note\n\nWriting it now.",
    outro:
      "Saved. You can open it in Notes or keep editing inline whenever you like.",
    workMs: 800,
    fallbackArgs: { action: "update", label: "Demo Note" },
    fallbackResult: { id: "demo-note", label: "Demo Note" },
  },
];

// Tools that stream their result in sections (search/research) use the matching
// section-aware recording builder so the stream reveals part-by-part, exactly
// like chat. Everything else uses the simple fire→work→complete recording.
function recordingFor(
  tool: ToolDef,
  args: Record<string, unknown>,
  result: unknown,
): StreamRecording {
  const label = tool.label;
  if (tool.name === "research_web" && typeof result === "string") {
    return buildResearchRecording(result, args);
  }
  if (
    (tool.name === "web_search" || tool.name === "web") &&
    typeof result === "string"
  ) {
    return buildSearchRecording(result, args, {
      toolName: tool.name,
      displayName: label,
    });
  }
  return buildSimpleRecording(tool.name, args, result, {
    displayName: label,
    workMs: tool.workMs,
  });
}

// ─── DB sample fetch ────────────────────────────────────────────────────────
// Pull the latest successful row for the tool and convert it with the canonical
// bridge. Returns null on any miss so the caller falls back to synthetic data.

interface SampleEntry {
  args: Record<string, unknown>;
  result: unknown;
  isReal: boolean;
}

async function fetchLatestSample(toolName: string): Promise<SampleEntry | null> {
  // Race the query against a hard timeout so a slow / hung Supabase round-trip
  // can never leave the demo stuck on "Loading…" — it falls back to synthetic
  // data instead. (Loud recovery: a timeout means the DB path is unhealthy.)
  const query = supabase
    .from("cx_tool_call")
    .select(
      "call_id, tool_name, tool_name_as_called, arguments, output, output_preview, is_error, error_type, error_message, started_at, completed_at, execution_events, status",
    )
    .eq("tool_name", toolName)
    .eq("success", true)
    .not("output", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const result = await Promise.race([
    query,
    new Promise<{ data: null; error: { message: string } }>((resolve) =>
      setTimeout(
        () => resolve({ data: null, error: { message: "sample fetch timed out" } }),
        4000,
      ),
    ),
  ]);
  const { data, error } = result;

  if (error || !data) {
    if (error) {
      console.warn(
        "[tool-viz/in-action] cx_tool_call sample fetch fell back to synthetic:",
        error.message,
        "tool:",
        toolName,
      );
    }
    return null;
  }

  // Reuse the canonical converter (observability slice → ToolLifecycleEntry).
  // It expects the camelCase `CxToolCallRecord` shape, so map the snake_case
  // row onto a full record (unread fields get harmless defaults — the
  // converter only consumes the lifecycle-relevant subset).
  const record: CxToolCallRecord = {
    id: data.call_id ?? "db-sample",
    conversationId: "",
    userRequestId: null,
    messageId: null,
    userId: "",
    callId: data.call_id ?? "db-sample",
    toolName: data.tool_name,
    toolNameAsCalled: data.tool_name_as_called ?? null,
    toolType: "",
    iteration: 0,
    status: (data.status as string) ?? "completed",
    success: true,
    isError: !!data.is_error,
    errorType: data.error_type ?? null,
    errorMessage: data.error_message ?? null,
    arguments: (data.arguments as CxToolCallRecord["arguments"]) ?? {},
    output:
      typeof data.output === "string"
        ? data.output
        : data.output != null
          ? JSON.stringify(data.output)
          : null,
    outputChars: 0,
    outputPreview: (data.output_preview as CxToolCallRecord["outputPreview"]) ?? null,
    outputType: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    costUsd: null,
    durationMs: 0,
    startedAt: data.started_at ?? "",
    completedAt: data.completed_at ?? "",
    parentCallId: null,
    retryCount: null,
    persistKey: null,
    filePath: null,
    executionEvents: (data.execution_events as CxToolCallRecord["executionEvents"]) ?? [],
    metadata: {},
    createdAt: "",
    deletedAt: null,
  };

  const entry = cxToolCallToLifecycleEntry(record);
  if (entry.result == null) return null;
  return { args: entry.arguments, result: entry.result, isReal: true };
}

// ─── A single streamed tool call ────────────────────────────────────────────

function StreamedTool({
  recording,
  speed,
  onDone,
}: {
  recording: StreamRecording;
  speed: number;
  onDone: () => void;
}) {
  // Mounted only when it's this segment's turn, so the sim starts on mount.
  const entry = useSimulatedToolEntry(recording, { playKey: 1, speed });
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    if (entry.status === "completed" || entry.status === "error") {
      firedRef.current = true;
      onDone();
    }
  }, [entry.status, onDone]);
  return <ToolCallVisualization entries={[entry]} requestId="sim" hasContent />;
}

// ─── Progressive markdown reveal ────────────────────────────────────────────
// Reveals a markdown string token-by-token, then renders the WHOLE thing
// through MarkdownStream — the exact assistant-markdown component the live
// transcript uses (via AgentAssistantMessage). The reveal clock is scaled by
// the turn speed so the whole turn shares one rate.

const REVEAL_MS_PER_TOKEN = 24; // snappy default; scaled by `speed`

function RevealedMarkdown({
  text,
  active,
  done,
  speed,
  onDone,
}: {
  text: string;
  active: boolean;
  done: boolean;
  speed: number;
  onDone: () => void;
}) {
  const [shown, setShown] = useState("");
  const doneRef = useRef(false);

  useEffect(() => {
    if (done) {
      setShown(text);
      return;
    }
    if (!active) {
      setShown("");
      doneRef.current = false;
      return;
    }
    const tokens = text.split(/(\s+)/); // keep whitespace tokens
    let i = 0;
    setShown("");
    doneRef.current = false;
    const step = Math.max(1, REVEAL_MS_PER_TOKEN / (speed || 1));
    const id = setInterval(() => {
      i += 1;
      setShown(tokens.slice(0, i).join(""));
      if (i >= tokens.length) {
        clearInterval(id);
        if (!doneRef.current) {
          doneRef.current = true;
          onDone();
        }
      }
    }, step);
    return () => clearInterval(id);
  }, [text, active, done, speed, onDone]);

  const content = done ? text : shown;
  if (!content) return null;
  // Same component path as a real assistant turn: AgentAssistantMessage →
  // MarkdownStream → EnhancedChatMarkdown. No requestId/messageId → the static
  // (DB-loaded) markdown path, byte-identical spacing to a committed turn.
  return (
    <MarkdownStream content={content} hideCopyButton allowFullScreenEditor={false} />
  );
}

// ─── Turn segment model ─────────────────────────────────────────────────────

type Segment =
  | { kind: "intro"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "action"; text: string }
  | { kind: "tool"; recording: StreamRecording }
  | { kind: "outro"; text: string };

function buildSegments(tool: ToolDef, recording: StreamRecording): Segment[] {
  return [
    { kind: "intro", text: tool.intro },
    { kind: "thinking", text: tool.thinking },
    { kind: "action", text: tool.actionHeader },
    { kind: "tool", recording },
    { kind: "outro", text: tool.outro },
  ];
}

// ─── The streamed turn ──────────────────────────────────────────────────────

function StreamedTurn({
  tool,
  sample,
  speed,
  onSpeedChange,
}: {
  tool: ToolDef;
  sample: SampleEntry;
  speed: number;
  onSpeedChange: (s: number) => void;
}) {
  const recording = useMemo(
    () => recordingFor(tool, sample.args, sample.result),
    [tool, sample],
  );
  const segments = useMemo(
    () => buildSegments(tool, recording),
    [tool, recording],
  );

  // The page remounts this component (via `key`) whenever the tool / sample
  // changes, so each turn starts from a clean -1 with no extra reset effect.
  const [activeIndex, setActiveIndex] = useState(-1);
  const [runKey, setRunKey] = useState(0);

  const run = () => {
    setRunKey((k) => k + 1);
    setActiveIndex(0);
  };
  const reset = () => setActiveIndex(-1);

  const advance = () =>
    setActiveIndex((i) => (i < segments.length - 1 ? i + 1 : i));

  const started = activeIndex >= 0;
  const finished = started && activeIndex >= segments.length - 1;

  return (
    <div className="flex flex-col gap-4">
      {/* Controls — a SEPARATE toolbar row. It never shares a flex row with the
          render column, so it can't change the column's width or position. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={run} className="gap-1.5">
          {started ? (
            <RotateCcw className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {started ? "Replay" : "Play"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={reset}
          disabled={!started}
          className="gap-1.5"
        >
          Reset
        </Button>

        <div className="ml-1 flex items-center gap-1 rounded-md border border-border p-0.5">
          <Gauge className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
          {[0.5, 1, 2, 4].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSpeedChange(s)}
              className={
                "rounded px-2 py-0.5 text-xs transition-colors " +
                (speed === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {s}×
            </button>
          ))}
        </div>

        {sample.isReal ? (
          <Badge variant="secondary" className="gap-1">
            <Database className="h-3 w-3" />
            real data
          </Badge>
        ) : (
          <Badge variant="outline">synthetic</Badge>
        )}
        {started && !finished ? (
          <Badge variant="secondary" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            streaming
          </Badge>
        ) : null}
        {finished ? <Badge variant="outline">done</Badge> : null}
      </div>

      {/* The render area — a clean, centered, fixed-width column IDENTICAL to
          the real chat response column. `ChatResultColumn` applies the exact
          `max-w-3xl mx-auto px-2` constraint AgentConversationColumn uses, on
          `bg-background` with no card/border, so the turn renders precisely as
          it would in `/chat`. Independent of the toolbar above. */}
      <div className="rounded-lg bg-background">
        <ChatResultColumn>
          {!started ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
              Press{" "}
              <span className="font-medium text-foreground">Play</span> to watch
              the agent write, call{" "}
              <span className="font-medium text-foreground">{tool.label}</span>,
              and continue — exactly as it renders in chat.
            </div>
          ) : (
            <div key={runKey} className="py-2">
              {segments.map((seg, i) => {
                if (i > activeIndex) return null;
                const isActive = i === activeIndex;
                const isPast = i < activeIndex;

                if (seg.kind === "thinking") {
                  // Faithful thinking: the live transcript renders thinking via
                  // ThinkingTrace. Reveal it, then mark the segment done.
                  return (
                    <RevealedThinking
                      key={`${runKey}-think`}
                      text={seg.text}
                      active={isActive}
                      done={isPast}
                      speed={speed}
                      onDone={advance}
                    />
                  );
                }
                if (seg.kind === "tool") {
                  return (
                    <StreamedTool
                      key={`${runKey}-tool`}
                      recording={seg.recording}
                      speed={speed}
                      onDone={advance}
                    />
                  );
                }
                // intro / action / outro markdown
                return (
                  <RevealedMarkdown
                    key={`${runKey}-${seg.kind}`}
                    text={seg.text}
                    active={isActive}
                    done={isPast}
                    speed={speed}
                    onDone={advance}
                  />
                );
              })}
            </div>
          )}
        </ChatResultColumn>
      </div>
    </div>
  );
}

// ThinkingTrace reveal: stream the thought tail in, then render the real
// ThinkingTrace (collapsed, expandable) once revealed — the same primitive the
// live transcript uses for `<thinking>` blocks.
function RevealedThinking({
  text,
  active,
  done,
  speed,
  onDone,
}: {
  text: string;
  active: boolean;
  done: boolean;
  speed: number;
  onDone: () => void;
}) {
  const [shown, setShown] = useState("");
  const doneRef = useRef(false);

  useEffect(() => {
    if (done) {
      setShown(text);
      return;
    }
    if (!active) {
      setShown("");
      doneRef.current = false;
      return;
    }
    const tokens = text.split(/(\s+)/);
    let i = 0;
    setShown("");
    doneRef.current = false;
    const step = Math.max(1, REVEAL_MS_PER_TOKEN / (speed || 1));
    const id = setInterval(() => {
      i += 1;
      setShown(tokens.slice(0, i).join(""));
      if (i >= tokens.length) {
        clearInterval(id);
        if (!doneRef.current) {
          doneRef.current = true;
          onDone();
        }
      }
    }, step);
    return () => clearInterval(id);
  }, [text, active, done, speed, onDone]);

  const streaming = active && !done;
  return (
    <ThinkingTrace
      text={done ? text : shown}
      isStreaming={streaming}
      showThinking
    />
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ToolInActionPage() {
  // Registered inline renderers first (tools with a custom UI), then any
  // curated DB-sample tools not already covered — so the picker surfaces tools
  // that actually have a renderer and/or real samples.
  const registeredNames = useMemo(
    () => new Set(Object.keys(toolRendererRegistry)),
    [],
  );
  const toolList = useMemo(() => {
    const withRenderer = TOOLS.filter((t) => registeredNames.has(t.name));
    const rest = TOOLS.filter((t) => !registeredNames.has(t.name));
    return [...withRenderer, ...rest];
  }, [registeredNames]);

  const [toolName, setToolName] = useState(toolList[0]?.name ?? "web_search");
  const tool = toolList.find((t) => t.name === toolName) ?? toolList[0];
  const [speed, setSpeed] = useState(1);

  // Resolve the sample for the selected tool: real `cx_tool_call` row if one
  // exists, otherwise the synthetic fallback.
  const [sample, setSample] = useState<SampleEntry | null>(null);
  const [loadingSample, setLoadingSample] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingSample(true);
    setSample(null);
    fetchLatestSample(tool.name)
      .then((real) => {
        if (cancelled) return;
        setSample(
          real ?? {
            args: tool.fallbackArgs,
            result: tool.fallbackResult,
            isReal: false,
          },
        );
      })
      .catch(() => {
        if (cancelled) return;
        setSample({
          args: tool.fallbackArgs,
          result: tool.fallbackResult,
          isReal: false,
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingSample(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tool.name, tool.fallbackArgs, tool.fallbackResult]);

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 pr-14">
        <header className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-foreground">
            Tool renderer — in action
          </h1>
          <p className="text-sm text-muted-foreground">
            A faithful replica of a tool call inside the real chat stream — the
            agent writes, thinks, calls the tool (streaming, driven by real
            saved data), then wraps up. Rendered in the exact chat response
            column.
          </p>
        </header>

        {/* Tool picker — part of the top toolbar, NOT the render column. */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-muted-foreground" htmlFor="tool-pick">
            Tool
          </label>
          <select
            id="tool-pick"
            value={toolName}
            onChange={(e) => setToolName(e.target.value)}
            className="rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground"
          >
            {toolList.map((t) => (
              <option key={t.name} value={t.name}>
                {t.label}
                {registeredNames.has(t.name) ? " · custom UI" : ""}
              </option>
            ))}
          </select>
        </div>

        {loadingSample || !sample ? (
          <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading real saved data for{" "}
            <span className="font-medium text-foreground">{tool.label}</span>…
          </div>
        ) : (
          <StreamedTurn
            // Remount on tool/sample change so the player resets cleanly.
            key={`${tool.name}:${sample.isReal}`}
            tool={tool}
            sample={sample}
            speed={speed}
            onSpeedChange={setSpeed}
          />
        )}
      </div>
    </div>
  );
}
