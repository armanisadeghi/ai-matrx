"use client";

/**
 * Tool renderer — "in action" demo.
 *
 * A FAITHFUL replica of how a tool call renders inside the real `/chat` stream.
 * Pick a sample, press Play, and watch ONE realistic assistant turn stream out
 * EXACTLY as it would in chat:
 *
 *   intro markdown → thinking trace → "about to act" header → the tool call
 *   (streaming via the canonical simulator) → wrap-up markdown.
 *
 * ─── Two sample sources, real-first ─────────────────────────────────────────
 *
 *   • "Real saved runs" (DEFAULT) — the signed-in user's recent successful
 *     `cx_tool_call` rows (non-null output), listed in a picker. Picking one
 *     drives the tool segment from THAT real row's args + result (via the
 *     canonical `cxToolCallToLifecycleEntry` bridge). The surrounding
 *     intro/thinking/action/outro copy is the curated script if the tool is one
 *     of the eight known tools, else a sensible generic version keyed off the
 *     tool's display name. So a real run plays through the SAME faithful turn,
 *     carrying the "real data" badge.
 *
 *   • "Synthetic scenarios" — the curated eight, with hand-written args/results,
 *     for tools the user hasn't actually run.
 *
 * The render area is the EXACT chat-response column: `<ChatResultColumn>`
 * (`max-w-3xl mx-auto px-2`, the same constraint `AgentConversationColumn`
 * applies to the live transcript), on `bg-background` with NO card / border.
 * The markdown → tool → markdown transitions reuse the SAME components the real
 * transcript uses — `MarkdownStream` (assistant markdown), `ThinkingTrace`
 * (thinking), `ToolCallVisualization` (the tool) — so spacing and width are
 * byte-identical to production.
 *
 * The whole turn streams under ONE clock with a live speed control
 * (0.5× / 1× / 2× / 4×) plus Play / Reset.
 *
 * Route: /demos/tool-viz/in-action   (dev profile only)
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  RotateCcw,
  Loader2,
  Database,
  Gauge,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import MarkdownStream from "@/components/MarkdownStream";
import ThinkingTrace from "@/components/mardown-display/blocks/thinking-reasoning/ThinkingTrace";
import { ToolCallVisualization } from "@/features/tool-call-visualization/components/ToolCallVisualization";
import { ChatResultColumn } from "@/features/tool-call-visualization/components/ChatResultColumn";
import {
  toolRendererRegistry,
  getToolDisplayName,
} from "@/features/tool-call-visualization/registry/registry";
import {
  buildSimpleRecording,
  buildResearchRecording,
  buildSearchRecording,
  buildScrapeRecording,
  type StreamRecording,
} from "@/features/tool-call-visualization/simulator/streamRecording";
import { resolveWebActionKind } from "@/features/tool-call-visualization/renderers/web/webAction";
import { useSimulatedToolEntry } from "@/features/tool-call-visualization/simulator/useSimulatedToolEntry";
import { cxToolCallToLifecycleEntry } from "@/features/tool-call-visualization/utils/cxToolCallToLifecycleEntry";
import type { CxToolCallRecord } from "@/features/agents/redux/execution-system/observability/observability.slice";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

// ─── Curated scenario scripts ───────────────────────────────────────────────
// The surrounding "around" content for a turn — intro markdown the agent
// writes, its thinking trace, the "about to act" header, and the wrap-up. These
// are keyed by canonical tool name; a real run for one of these tools reuses its
// script, and the eight synthetic scenarios are built straight from them.

interface ToolScript {
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
  /** Synthetic args, used for the "Synthetic scenarios" mode. */
  syntheticArgs: Record<string, unknown>;
  /** Synthetic result, used for the "Synthetic scenarios" mode. */
  syntheticResult: unknown;
}

const SCRIPTS: ToolScript[] = [
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
    syntheticArgs: { query: "latest findings" },
    syntheticResult:
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
    syntheticArgs: { query: "comprehensive analysis" },
    syntheticResult:
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
    syntheticArgs: { sql: "select count(*) from cx_tool_call" },
    syntheticResult: { rows: [{ count: 1234 }], rowCount: 1 },
  },
  {
    name: "data",
    label: "Fetch a record",
    intro:
      "Let me pull up that record so we're both looking at the same thing.",
    thinking:
      "The user referenced a specific entity. Rather than describe it from memory, I'll fetch the canonical record so the details (status, name, ids) are exact.",
    actionHeader: "## Fetching the record\n\nLooking it up now.",
    outro:
      "Here's the record. It's currently active — want me to open it, or make a change?",
    workMs: 800,
    syntheticArgs: { action: "get", resource: "project" },
    syntheticResult: {
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
    actionHeader: "## Running the command\n\nExecuting now.",
    outro: "That's the actual output. Want me to act on what it shows?",
    workMs: 1100,
    syntheticArgs: { command: "git log --oneline -3" },
    syntheticResult: {
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
    syntheticArgs: { path: "/home/agent/repos", recursive: false },
    syntheticResult: {
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
    syntheticArgs: { query: "technology" },
    syntheticResult: {
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
    syntheticArgs: { action: "update", label: "Demo Note" },
    syntheticResult: { id: "demo-note", label: "Demo Note" },
  },
];

const SCRIPT_BY_NAME = new Map(SCRIPTS.map((s) => [s.name, s]));

// A generic script for a tool that has NO curated copy — keyed off the tool's
// display name so a real run for, say, `ctx_get` still plays through the full
// intro → thinking → action → outro turn with sensible, on-brand text.
function genericScript(toolName: string): ToolScript {
  const label = getToolDisplayName(toolName);
  const lower = label.toLowerCase();
  return {
    name: toolName,
    label,
    intro: `Let me use ${label} to get this right rather than answer from memory.`,
    thinking: `The most reliable way to handle this is to call ${label} and work from its real output. Let me run it now and report exactly what comes back.`,
    actionHeader: `## Using ${label}\n\nCalling ${lower} now.`,
    outro: `That's the result from ${label}. Want me to act on what it shows, or keep going?`,
    workMs: 1000,
    // Synthetic mode never uses a generic script (it only lists the curated
    // eight), so these are placeholders for type-completeness.
    syntheticArgs: {},
    syntheticResult: null,
  };
}

/** The curated script for a tool, or a generic one keyed off its name. */
function scriptFor(toolName: string): ToolScript {
  return SCRIPT_BY_NAME.get(toolName) ?? genericScript(toolName);
}

// ─── Recording selection ────────────────────────────────────────────────────
// Tools that stream their result in sections (search/research) use the matching
// section-aware recording builder so the stream reveals part-by-part, exactly
// like chat. Everything else uses the simple fire→work→complete recording.
function recordingFor(
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
): StreamRecording {
  const label = getToolDisplayName(toolName);
  const workMs = SCRIPT_BY_NAME.get(toolName)?.workMs;
  if (
    (toolName === "research_web" || toolName === "deep_research") &&
    typeof result === "string"
  ) {
    return buildResearchRecording(result, args);
  }
  // The REAL `web` tool is action-dispatched — so a saved `web` run must build
  // the recording that matches its action, not assume "search". A search action
  // gets the section-by-section search recording; a read action (batch_read /
  // read) gets the page-reading recording off its `{ pages: [...] }` result.
  if (toolName === "web") {
    const kind = resolveWebActionKind(args.action);
    if (kind === "read" && result && typeof result === "object") {
      return buildScrapeRecording(
        result as Record<string, unknown>,
        args,
        { toolName, displayName: label },
      );
    }
    if (kind === "search" && typeof result === "string") {
      return buildSearchRecording(result, args, { toolName, displayName: label });
    }
  }
  if (toolName === "web_search" && typeof result === "string") {
    return buildSearchRecording(result, args, {
      toolName,
      displayName: label,
    });
  }
  return buildSimpleRecording(toolName, args, result, {
    displayName: label,
    workMs,
  });
}

// ─── Sample model ───────────────────────────────────────────────────────────
// A `Sample` is the args + result that drives the tool segment, plus whether it
// came from a real `cx_tool_call` row.

interface Sample {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  isReal: boolean;
}

// ─── Real saved runs ────────────────────────────────────────────────────────
// One picker row = one real `cx_tool_call` row, listed newest-first.

interface RealRun {
  callId: string;
  toolName: string;
  toolNameAsCalled: string | null;
  label: string; // friendly tool display name
  createdAt: string;
  /** A short, human-readable snippet so rows for the same tool are distinct. */
  snippet: string;
  /** The converted sample, ready to drive the turn. */
  sample: Sample;
}

// The columns we read off the row. Kept tight — the converter only consumes the
// lifecycle-relevant subset, so unread fields get harmless defaults below.
interface CxToolCallRow {
  call_id: string | null;
  tool_name: string;
  tool_name_as_called: string | null;
  arguments: unknown;
  output: string | null;
  output_preview: unknown;
  is_error: boolean | null;
  error_type: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  execution_events: unknown;
  status: string | null;
  created_at: string;
}

/** Map a raw row → the camelCase `CxToolCallRecord` the converter expects. */
function rowToRecord(row: CxToolCallRow): CxToolCallRecord {
  return {
    id: row.call_id ?? "db-sample",
    conversationId: "",
    userRequestId: null,
    messageId: null,
    userId: "",
    callId: row.call_id ?? "db-sample",
    toolName: row.tool_name,
    toolNameAsCalled: row.tool_name_as_called ?? null,
    toolType: "",
    iteration: 0,
    status: row.status ?? "completed",
    success: true,
    isError: !!row.is_error,
    errorType: row.error_type ?? null,
    errorMessage: row.error_message ?? null,
    arguments: (row.arguments as CxToolCallRecord["arguments"]) ?? {},
    output:
      typeof row.output === "string"
        ? row.output
        : row.output != null
          ? JSON.stringify(row.output)
          : null,
    outputChars: 0,
    outputPreview:
      (row.output_preview as CxToolCallRecord["outputPreview"]) ?? null,
    outputType: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    costUsd: null,
    durationMs: 0,
    startedAt: row.started_at ?? "",
    completedAt: row.completed_at ?? "",
    parentCallId: null,
    retryCount: null,
    persistKey: null,
    filePath: null,
    executionEvents:
      (row.execution_events as CxToolCallRecord["executionEvents"]) ?? [],
    metadata: {},
    createdAt: row.created_at ?? "",
    deletedAt: null,
  };
}

/** A short, single-line snippet that distinguishes runs of the same tool. */
function snippetFromArgs(args: Record<string, unknown>): string {
  // Prefer the most informative single arg, mirroring the shell's collapsed
  // subtitle priority (query/sql/command/path/key/…).
  const priority = [
    "query",
    "queries",
    "sql",
    "command",
    "path",
    "key",
    "new_str",
    "label",
    "url",
    "action",
    "mode",
    "resource",
  ];
  for (const k of priority) {
    const v = args[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v) && v.length && typeof v[0] === "string")
      return String(v[0]);
  }
  // Fall back to the first stringy value, else a compact JSON of the keys.
  for (const v of Object.values(args)) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const keys = Object.keys(args);
  return keys.length ? `{ ${keys.slice(0, 4).join(", ")} }` : "(no arguments)";
}

/** "3m ago", "2h ago", "5d ago", or a date for older rows. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

const RUNS_PER_PAGE = 5;

/** One row in the tool-picker left panel. */
interface ToolItem {
  toolName: string;
  label: string;
  /** DB run count for the current user (0 = no data yet). */
  count: number;
  hasCustomRenderer: boolean;
  hasCuratedScript: boolean;
}

/**
 * Resolve the current user id WITHOUT a network round-trip. Prefer the Redux
 * id (hydrated at session boot in the core shell), but the `(dev)/demos` layout
 * does not always boot that chain, so fall back to `auth.getSession()` — which
 * reads the persisted session from cookies/storage LOCALLY (unlike
 * `auth.getUser()`, which hits `/auth/v1/user` and can hang outside any
 * timeout). Returns null if there is genuinely no session.
 */
async function resolveUserId(
  reduxUserId: string | null,
): Promise<string | null> {
  if (reduxUserId) return reduxUserId;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/** Race any Supabase query against a 6 s hard timeout. */
async function withTimeout<T extends { data: unknown; error: unknown }>(
  query: PromiseLike<T>,
  label: string,
): Promise<T> {
  return Promise.race([
    query,
    new Promise<T>((resolve) =>
      setTimeout(
        () =>
          resolve({
            data: null,
            error: { message: `${label} timed out` },
          } as T),
        6000,
      ),
    ),
  ]);
}

/**
 * Fetch every tool_name the user has ever run successfully (non-null output),
 * deduplicate on the client, and return a Map<toolName, count>.
 * Fetches up to 1 000 rows (tool_name only — tiny payload) so we get a true
 * distinct catalogue rather than just the last N.
 */
async function fetchToolSummary(
  reduxUserId: string | null,
): Promise<Map<string, number>> {
  const userId = await resolveUserId(reduxUserId);
  if (!userId) return new Map();

  const { data, error } = await withTimeout(
    supabase
      .schema("chat").from("tool_call")
      .select("tool_name")
      .eq("user_id", userId)
      .eq("success", true)
      .not("output", "is", null)
      .is("deleted_at", null)
      .limit(1000),
    "tool-summary fetch",
  );

  if (error || !data) {
    if (error)
      console.warn(
        "[tool-viz/in-action] tool summary fetch failed:",
        (error as { message?: string })?.message ?? error,
      );
    return new Map();
  }

  const counts = new Map<string, number>();
  for (const row of data as { tool_name: string }[]) {
    counts.set(row.tool_name, (counts.get(row.tool_name) ?? 0) + 1);
  }
  return counts;
}

/**
 * Fetch a page of real runs for one specific tool name.
 * Fetches RUNS_PER_PAGE + 1 to detect whether more pages exist.
 */
async function fetchRunsForTool(
  reduxUserId: string | null,
  toolName: string,
  page: number,
): Promise<{ runs: RealRun[]; hasMore: boolean }> {
  const userId = await resolveUserId(reduxUserId);
  if (!userId) return { runs: [], hasMore: false };

  const from = page * RUNS_PER_PAGE;
  const to = from + RUNS_PER_PAGE; // one extra to detect hasMore

  const { data, error } = await withTimeout(
    supabase
      .schema("chat").from("tool_call")
      .select(
        "call_id, tool_name, tool_name_as_called, arguments, output, output_preview, is_error, error_type, error_message, started_at, completed_at, execution_events, status, created_at",
      )
      .eq("user_id", userId)
      .eq("tool_name", toolName)
      .eq("success", true)
      .not("output", "is", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(from, to),
    "tool-runs fetch",
  );

  if (error || !data) {
    if (error)
      console.warn(
        "[tool-viz/in-action] tool runs fetch failed:",
        (error as { message?: string })?.message ?? error,
      );
    return { runs: [], hasMore: false };
  }

  const rows = data as CxToolCallRow[];
  const hasMore = rows.length > RUNS_PER_PAGE;
  const pageRows = rows.slice(0, RUNS_PER_PAGE);

  const runs: RealRun[] = [];
  for (const row of pageRows) {
    const record = rowToRecord(row);
    const entry = cxToolCallToLifecycleEntry(record);
    if (entry.result == null) continue;
    const args =
      entry.arguments && typeof entry.arguments === "object"
        ? entry.arguments
        : {};
    runs.push({
      callId: record.callId,
      toolName: row.tool_name,
      toolNameAsCalled: row.tool_name_as_called,
      label: getToolDisplayName(row.tool_name),
      createdAt: row.created_at,
      snippet: snippetFromArgs(args),
      sample: {
        toolName: row.tool_name,
        args,
        result: entry.result,
        isReal: true,
      },
    });
  }
  return { runs, hasMore };
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
  // NO requestId: this is a simulated stream with no real request in Redux. A
  // fake `requestId="sim"` made `selectIsLatestToolActivity` return false (no
  // matching request record) → renderers that gate "live" on it (search) never
  // showed their live phase and just dumped the final view. Without it,
  // renderers fall back to `entry.status` and stream correctly while the sim is
  // non-terminal. The window-panel handoff also runs in snapshot mode, which is
  // correct here.
  return <ToolCallVisualization entries={[entry]} hasContent />;
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
    <MarkdownStream
      content={content}
      hideCopyButton
      allowFullScreenEditor={false}
    />
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

// ─── Turn segment model ─────────────────────────────────────────────────────

type Segment =
  | { kind: "intro"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "action"; text: string }
  | { kind: "tool"; recording: StreamRecording }
  | { kind: "outro"; text: string };

function buildSegments(
  script: ToolScript,
  recording: StreamRecording,
): Segment[] {
  return [
    { kind: "intro", text: script.intro },
    { kind: "thinking", text: script.thinking },
    { kind: "action", text: script.actionHeader },
    { kind: "tool", recording },
    { kind: "outro", text: script.outro },
  ];
}

// ─── The streamed turn ──────────────────────────────────────────────────────

function StreamedTurn({
  sample,
  speed,
  onSpeedChange,
}: {
  sample: Sample;
  speed: number;
  onSpeedChange: (s: number) => void;
}) {
  const script = useMemo(() => scriptFor(sample.toolName), [sample.toolName]);
  const recording = useMemo(
    () => recordingFor(sample.toolName, sample.args, sample.result),
    [sample],
  );
  const segments = useMemo(
    () => buildSegments(script, recording),
    [script, recording],
  );

  // The page remounts this component (via `key`) whenever the sample changes,
  // so each turn starts from a clean -1 with no extra reset effect.
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

        <div className="ml-1 flex items-center gap-0.5 rounded-md border border-border p-0.5">
          <Gauge className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {[0.5, 1, 1.2, 1.5, 1.75, 2, 2.25, 2.5, 3, 4].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSpeedChange(s)}
              className={
                "rounded px-1.5 py-0.5 text-xs transition-colors " +
                (speed === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {Number.isInteger(s) ? s : s}×
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
              Press <span className="font-medium text-foreground">Play</span> to
              watch the agent write, call{" "}
              <span className="font-medium text-foreground">
                {script.label}
              </span>
              , and continue — exactly as it renders in chat.
            </div>
          ) : (
            <div key={runKey} className="py-2">
              {segments.map((seg, i) => {
                if (i > activeIndex) return null;
                const isActive = i === activeIndex;
                const isPast = i < activeIndex;

                if (seg.kind === "thinking") {
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

// ─── Mode toggle ─────────────────────────────────────────────────────────────

type Mode = "real" | "synthetic";

function ModeToggle({
  mode,
  onChange,
  realCount,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  realCount: number | null;
}) {
  const tab = (m: Mode, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => onChange(m)}
      className={
        "flex items-center gap-1.5 rounded px-3 py-1 text-sm transition-colors " +
        (mode === m
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground")
      }
    >
      {icon}
      {label}
    </button>
  );
  return (
    <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
      {tab(
        "real",
        realCount != null
          ? `Real saved runs (${realCount} tool${realCount === 1 ? "" : "s"})`
          : "Real saved runs",
        <Database className="h-3.5 w-3.5" />,
      )}
      {tab(
        "synthetic",
        "Synthetic scenarios",
        <Sparkles className="h-3.5 w-3.5" />,
      )}
    </div>
  );
}

// ─── Real saved runs panel ───────────────────────────────────────────────────
// Two-column layout:
//   Left  — full catalogue of known tools (registry + scripts + user's DB tools),
//            sorted by run count desc. Tools with no data are greyed out.
//   Right — paginated run list for the selected tool (5 per page).

function RealRunsPanel({
  reduxUserId,
  onSelectSample,
  onToolCountChange,
}: {
  reduxUserId: string | null;
  onSelectSample: (sample: Sample | null) => void;
  onToolCountChange: (count: number) => void;
}) {
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [dbCounts, setDbCounts] = useState<Map<string, number>>(new Map());
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [toolRuns, setToolRuns] = useState<RealRun[]>([]);
  const [runsPage, setRunsPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [runsLoading, setRunsLoading] = useState(false);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

  // Keep the parent callbacks in refs so they never re-trigger the data
  // effects. The parent recreates these on every render; if they sat in the
  // effect dependency arrays the runs effect would fetch → onSelectSample →
  // parent re-render → new callback identity → fetch again, forever.
  const onSelectSampleRef = useRef(onSelectSample);
  const onToolCountChangeRef = useRef(onToolCountChange);
  useEffect(() => {
    onSelectSampleRef.current = onSelectSample;
    onToolCountChangeRef.current = onToolCountChange;
  });

  // One-time summary load — what tools has this user actually run?
  useEffect(() => {
    let cancelled = false;
    setSummaryLoading(true);
    fetchToolSummary(reduxUserId).then((counts) => {
      if (cancelled) return;
      setDbCounts(counts);
      setSummaryLoading(false);
      onToolCountChangeRef.current(counts.size);
      // Auto-select the tool with the most runs.
      const top =
        [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      if (top) setSelectedTool(top);
    });
    return () => {
      cancelled = true;
    };
  }, [reduxUserId]);

  // Fetch (or clear) runs whenever the selected tool or page changes.
  useEffect(() => {
    if (!selectedTool) return;
    const count = dbCounts.get(selectedTool) ?? 0;
    if (count === 0) {
      setToolRuns([]);
      setHasMore(false);
      setRunsLoading(false);
      return;
    }
    let cancelled = false;
    setRunsLoading(true);
    fetchRunsForTool(reduxUserId, selectedTool, runsPage).then(
      ({ runs, hasMore: more }) => {
        if (cancelled) return;
        setToolRuns((prev) => (runsPage === 0 ? runs : [...prev, ...runs]));
        setHasMore(more);
        setRunsLoading(false);
        if (runsPage === 0 && runs.length > 0) {
          setSelectedCallId(runs[0].callId);
          onSelectSampleRef.current(runs[0].sample);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [selectedTool, runsPage, reduxUserId, dbCounts]);

  // Build the full ordered tool list: data tools first (by count), then known
  // tools with no data (registry + scripts), alphabetically within each group.
  const registeredNames = useMemo(
    () => new Set(Object.keys(toolRendererRegistry)),
    [],
  );
  const scriptedNames = useMemo(() => new Set(SCRIPTS.map((s) => s.name)), []);

  const allTools = useMemo((): ToolItem[] => {
    const seen = new Set<string>();
    const items: ToolItem[] = [];
    const add = (toolName: string) => {
      if (seen.has(toolName)) return;
      seen.add(toolName);
      items.push({
        toolName,
        label: getToolDisplayName(toolName),
        count: dbCounts.get(toolName) ?? 0,
        hasCustomRenderer: registeredNames.has(toolName),
        hasCuratedScript: scriptedNames.has(toolName),
      });
    };
    // Group 1: tools with real data, most-used first.
    [...dbCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([name]) => add(name));
    // Group 2: known tools with no data yet, alphabetically.
    [...registeredNames].sort().forEach(add);
    [...scriptedNames].sort().forEach(add);
    return items;
  }, [dbCounts, registeredNames, scriptedNames]);

  const handleToolSelect = (toolName: string) => {
    if (toolName === selectedTool) return;
    setSelectedTool(toolName);
    setRunsPage(0);
    setToolRuns([]);
    setSelectedCallId(null);
    onSelectSample(null);
  };

  const handleRunSelect = (run: RealRun) => {
    setSelectedCallId(run.callId);
    onSelectSample(run.sample);
  };

  if (summaryLoading) {
    return (
      <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading tool catalogue…
      </div>
    );
  }

  const toolsWithData = allTools.filter((t) => t.count > 0).length;

  return (
    <div className="flex gap-3">
      {/* Left panel — full tool catalogue */}
      <div className="flex w-52 shrink-0 flex-col gap-0.5 rounded-md border border-border bg-card p-1.5">
        <p className="px-1.5 pb-0.5 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Tools{toolsWithData > 0 ? ` · ${toolsWithData} with data` : ""}
        </p>
        <div className="max-h-72 overflow-y-auto">
          {allTools.map((tool) => {
            const active = selectedTool === tool.toolName;
            const hasData = tool.count > 0;
            return (
              <button
                key={tool.toolName}
                type="button"
                onClick={() => handleToolSelect(tool.toolName)}
                className={
                  "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs transition-colors " +
                  (active
                    ? "bg-primary text-primary-foreground"
                    : hasData
                      ? "text-foreground hover:bg-muted"
                      : "text-muted-foreground/50 hover:bg-muted/50")
                }
              >
                <span className="flex-1 truncate">{tool.label}</span>
                {hasData && (
                  <span
                    className={
                      "shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium " +
                      (active
                        ? "bg-white/20 text-primary-foreground"
                        : "bg-muted text-muted-foreground")
                    }
                  >
                    {tool.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right panel — runs for the selected tool */}
      <div className="flex flex-1 flex-col gap-1.5">
        {!selectedTool ? (
          <p className="pt-2 text-sm text-muted-foreground">
            Select a tool on the left to see its saved runs.
          </p>
        ) : (dbCounts.get(selectedTool) ?? 0) === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            No saved runs for{" "}
            <strong>{getToolDisplayName(selectedTool)}</strong> yet.
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {getToolDisplayName(selectedTool)}
              </span>{" "}
              — pick a run to replay
            </p>
            <div className="rounded-md border border-border bg-card">
              {runsLoading && toolRuns.length === 0 ? (
                <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading runs…
                </div>
              ) : toolRuns.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">
                  No valid runs found.
                </div>
              ) : (
                toolRuns.map((run) => {
                  const selected = run.callId === selectedCallId;
                  return (
                    <button
                      key={run.callId}
                      type="button"
                      onClick={() => handleRunSelect(run)}
                      className={
                        "flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 transition-colors " +
                        (selected ? "bg-accent" : "hover:bg-muted")
                      }
                    >
                      <span className="flex-1 truncate text-xs text-muted-foreground">
                        {run.snippet}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {relativeTime(run.createdAt)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            {(hasMore || (runsLoading && toolRuns.length > 0)) && (
              <button
                type="button"
                onClick={() => setRunsPage((p) => p + 1)}
                disabled={runsLoading}
                className="flex items-center gap-1.5 self-start rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {runsLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : null}
                Load more runs…
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ToolInActionPage() {
  const [mode, setMode] = useState<Mode>("real");
  const [speed, setSpeed] = useState(1.2);

  // Current user id from Redux (instant when the shell has hydrated it). On the
  // `(dev)/demos` route this may be null — resolveUserId() falls back to a
  // local session read, so the query still scopes correctly.
  const reduxUserId = useAppSelector(selectUserId);

  // ── Real saved runs (managed by RealRunsPanel) ──
  // The panel owns all fetching; it hands us the selected sample + tool count.
  const [realSample, setRealSample] = useState<Sample | null>(null);
  const [realToolCount, setRealToolCount] = useState<number | null>(null);
  // Key used to remount StreamedTurn when the selection changes. We derive it
  // from a running counter inside the panel via a stable ref trick — instead we
  // just track a simple counter here that increments whenever realSample changes.
  const [realSampleKey, setRealSampleKey] = useState(0);

  const handleSelectSample = (s: Sample | null) => {
    setRealSample(s);
    if (s) setRealSampleKey((k) => k + 1);
  };

  // ── Synthetic scenarios ──
  // Tools with a registered inline renderer first (custom UI), then the rest.
  const registeredNames = useMemo(
    () => new Set(Object.keys(toolRendererRegistry)),
    [],
  );
  const syntheticList = useMemo(() => {
    const withRenderer = SCRIPTS.filter((s) => registeredNames.has(s.name));
    const rest = SCRIPTS.filter((s) => !registeredNames.has(s.name));
    return [...withRenderer, ...rest];
  }, [registeredNames]);
  const [syntheticName, setSyntheticName] = useState(
    syntheticList[0]?.name ?? "web_search",
  );
  const syntheticScript =
    syntheticList.find((s) => s.name === syntheticName) ?? syntheticList[0];

  // ── The active sample driving the turn ──
  const sample: Sample | null = useMemo(() => {
    if (mode === "real") return realSample;
    if (!syntheticScript) return null;
    return {
      toolName: syntheticScript.name,
      args: syntheticScript.syntheticArgs,
      result: syntheticScript.syntheticResult,
      isReal: false,
    };
  }, [mode, realSample, syntheticScript]);

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 pr-14">
        <header className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-foreground">
            Tool renderer — in action
          </h1>
          <p className="text-sm text-muted-foreground">
            A faithful replica of a tool call inside the real chat stream — the
            agent writes, thinks, calls the tool (streaming), then wraps up.
            Drive it from your own real saved runs, or a synthetic scenario.
            Rendered in the exact chat response column.
          </p>
        </header>

        {/* Mode toggle — Real saved runs (default) vs Synthetic scenarios. */}
        <ModeToggle mode={mode} onChange={setMode} realCount={realToolCount} />

        {mode === "real" ? (
          <RealRunsPanel
            reduxUserId={reduxUserId}
            onSelectSample={handleSelectSample}
            onToolCountChange={setRealToolCount}
          />
        ) : (
          // Synthetic scenarios — the curated eight.
          <div className="flex flex-wrap items-center gap-2">
            <label
              className="text-sm text-muted-foreground"
              htmlFor="tool-pick"
            >
              Scenario
            </label>
            <select
              id="tool-pick"
              value={syntheticName}
              onChange={(e) => setSyntheticName(e.target.value)}
              className="rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground"
            >
              {syntheticList.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.label}
                  {registeredNames.has(s.name) ? " · custom UI" : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {sample ? (
          <StreamedTurn
            // Remount on sample change so the player resets cleanly.
            key={
              mode === "real"
                ? `real:${realSampleKey}`
                : `synthetic:${syntheticName}`
            }
            sample={sample}
            speed={speed}
            onSpeedChange={setSpeed}
          />
        ) : null}
      </div>
    </div>
  );
}
