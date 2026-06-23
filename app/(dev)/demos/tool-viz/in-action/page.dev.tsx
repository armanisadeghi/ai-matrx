"use client";

/**
 * Tool renderer — "in action" demo. Two modes:
 *
 *  • Simulated turn — pick ONE tool (or a chain), press Run, and watch a
 *    realistic assistant turn play out: the agent writes a line, fires the
 *    tool call (streaming via the canonical simulator), then writes again.
 *    Chains play each call in sequence with the agent narrating between them.
 *    This is the closest thing to "what it looks like in a real chat" without
 *    a backend.
 *
 *  • Real saved run — pick a tool and load its ACTUAL persisted `cx_tool_call`
 *    rows (real args + real output) for the signed-in user, rendered exactly
 *    as they appear on reload. As close to the real thing as it gets.
 *
 * Route: /demos/tool-viz/in-action   (dev profile only)
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Play, RotateCcw, Sparkles, Database, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToolCallVisualization } from "@/features/tool-call-visualization/components/ToolCallVisualization";
import {
  buildSimpleRecording,
  type StreamRecording,
} from "@/features/tool-call-visualization/simulator/streamRecording";
import { useSimulatedToolEntry } from "@/features/tool-call-visualization/simulator/useSimulatedToolEntry";
import BasicMarkdownContent from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { formatRelativeTime } from "@/utils/datetime";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

// ─── Scenario data (Simulated mode) ─────────────────────────────────────────

interface ScenarioCall {
  toolName: string;
  displayName?: string;
  args: Record<string, unknown>;
  result: unknown;
  workMs?: number;
  /** Agent line shown AFTER this call (before the next). Markdown. */
  after?: string;
}
interface Scenario {
  id: string;
  label: string;
  intro: string;
  calls: ScenarioCall[];
  outro: string;
}

const SCENARIOS: Scenario[] = [
  {
    id: "weather",
    label: "Weather (single call)",
    intro: "Sure — let me check the current conditions in **Miami** for you.",
    calls: [
      {
        toolName: "travel_get_weather",
        args: { city: "Miami" },
        result: { city: "Miami", condition: "windy", temperature: 83, unit: "fahrenheit" },
      },
    ],
    outro: "It's **83°F and windy** in Miami right now — warm, but hold onto your hat. A great day for the beach if you don't mind a breeze.",
  },
  {
    id: "fs_list",
    label: "List directory (single call)",
    intro: "Let me take a look at what's in the repos directory.",
    calls: [
      {
        toolName: "fs_list",
        args: { path: "/home/agent/repos", recursive: false },
        result: {
          path: "/home/agent/repos",
          entries: [
            { name: "matrx-frontend", path: "/home/agent/repos/matrx-frontend", is_dir: true, size: 4096 },
            { name: "aidream", path: "/home/agent/repos/aidream", is_dir: true, size: 4096 },
            { name: "matrx-extend", path: "/home/agent/repos/matrx-extend", is_dir: true, size: 4096 },
            { name: "README.md", path: "/home/agent/repos/README.md", is_dir: false, size: 2048 },
          ],
        },
      },
    ],
    outro: "There are **three repos** here — `matrx-frontend`, `aidream`, and `matrx-extend` — plus a README. Which one would you like to work in?",
  },
  {
    id: "memory",
    label: "Save to memory (single call)",
    intro: "Good insight — I'll commit that to long-term memory so I remember it next time.",
    calls: [
      {
        toolName: "memory",
        args: { key: "omega3_findings", action: "store", content: "Algae-derived omega-3 leads on sustainability + bioavailability.", importance: 0.8 },
        result: { stored: true, key: "omega3_findings", type: "long" },
      },
    ],
    outro: "Saved. I'll keep that omega-3 finding on hand for future questions.",
  },
  {
    id: "shell",
    label: "Run a shell command (single call)",
    intro: "Let me check the most recent commits on this branch.",
    calls: [
      {
        toolName: "shell_execute",
        args: { command: "git log --oneline -3" },
        result: {
          stdout: "9472f447c feat(tool-viz): page-reading DB renderers (wave 4)\n8897cc962 feat(tool-viz): expand DB-loaded renderer set to eight (wave 2)\nc36d91c16 bookmark additions",
          stderr: "",
          exit_code: 0,
          cwd: "/home/agent/repos/matrx-frontend",
        },
      },
    ],
    outro: "The last three commits are all the tool-viz work — looks like the renderer set is up to date.",
  },
  {
    id: "browser-chain",
    label: "Browser automation (chain of calls)",
    intro: "I'll open the docs and find the search box for you. First, navigating to the page.",
    calls: [
      {
        toolName: "navigate_active_tab",
        args: { url: "https://platform.claude.com/docs" },
        result: { url: "https://platform.claude.com/docs/en/api/messages", title: "Messages — Claude API", status: "complete" },
        after: "Page loaded. Now reading the page structure to see what's interactive.",
      },
      {
        toolName: "read_page",
        args: { max_elements: 200 },
        result: {
          count: 42,
          elements: [
            { name: "Search the docs", ref: "ref:5", role: "searchbox" },
            { name: "API Reference", href: "https://platform.claude.com/docs/api", ref: "ref:8", role: "link" },
            { name: "Get started", ref: "ref:12", role: "button" },
          ],
        },
        after: "Found the elements — there's a search box. Let me locate it precisely.",
      },
      {
        toolName: "find",
        args: { query: "search" },
        result: { ok: true, mode: "ai", matches: [{ ref: "5", score: 1, reason: "Directly matches the docs search box." }] },
        after: "Got it — ref 5 is the search box. Clicking it now.",
      },
      {
        toolName: "click_element",
        args: { ref: "5" },
        result: { ok: true, tag: "input", text: "Search the docs" },
      },
    ],
    outro: "Done — the docs search box is focused and ready. What would you like me to search for?",
  },
  {
    id: "note",
    label: "Save a note (single call)",
    intro: "Good — I'll capture that as a note so we can build on it later.",
    calls: [
      {
        toolName: "note",
        args: {
          action: "update",
          label: "CX Table Relationships",
          note_id: "898a62fa-5ae6-4146-af3c-65f3f8ee312e",
        },
        // The `note` tool returns only identifiers — the renderer hydrates the
        // live note (a real note id, so its content/stats load for its owner).
        result: {
          id: "898a62fa-5ae6-4146-af3c-65f3f8ee312e",
          label: "CX Table Relationships",
          updated_at: "2026-06-22 19:46:27.435041+00:00",
        },
      },
    ],
    outro:
      "Saved to **CX Table Relationships**. You can open it in Notes or keep editing inline.",
  },
  {
    id: "data-record",
    label: "Fetch a record (single call)",
    intro: "Let me pull up that project record.",
    calls: [
      {
        toolName: "data",
        args: { action: "get", resource: "project" },
        result: {
          resource_type: "project",
          record: {
            id: "2c3d7caf-678a-423a-9c5c-d5b1d19b5934",
            name: "Universal Layout for Org Scope & Context System",
            slug: "universal-layout-org-scope-context",
            status: "active",
          },
        },
      },
    ],
    outro: "Here's the **Universal Layout** project — it's currently active. Want me to open it?",
  },
];

// ─── Word-by-word reveal (the "agent writing" effect) ────────────────────────

function useReveal(
  text: string,
  active: boolean,
  onDone: () => void,
): string {
  const [shown, setShown] = useState("");
  const doneRef = useRef(false);
  useEffect(() => {
    if (!active) {
      setShown("");
      doneRef.current = false;
      return;
    }
    const words = text.split(/(\s+)/); // keep whitespace tokens
    let i = 0;
    setShown("");
    doneRef.current = false;
    const id = setInterval(() => {
      i += 1;
      setShown(words.slice(0, i).join(""));
      if (i >= words.length) {
        clearInterval(id);
        if (!doneRef.current) {
          doneRef.current = true;
          onDone();
        }
      }
    }, 45);
    return () => clearInterval(id);
    // onDone is stable per segment instance; text/active drive the run.
  }, [text, active, onDone]);
  return active ? shown : "";
}

function AgentTextSegment({
  text,
  active,
  done,
  onDone,
}: {
  text: string;
  active: boolean;
  done: boolean;
  onDone: () => void;
}) {
  const revealed = useReveal(text, active && !done, onDone);
  // Once past, show the full text; while active, show the revealing slice.
  const content = done ? text : revealed;
  return (
    <div className="text-sm leading-relaxed text-foreground">
      <BasicMarkdownContent content={content} />
      {active && !done ? (
        <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-foreground/60 align-middle" />
      ) : null}
    </div>
  );
}

// ─── A single streamed tool call ─────────────────────────────────────────────

function SimulatedCallSegment({
  recording,
  active,
  onDone,
}: {
  recording: StreamRecording;
  active: boolean;
  onDone: () => void;
}) {
  // Mounted only once it's this segment's turn (parent renders 0..activeIndex),
  // so the sim starts on mount. playKey 1 = run once on mount.
  const entry = useSimulatedToolEntry(recording, { playKey: 1 });
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    if (entry.status === "completed" || entry.status === "error") {
      firedRef.current = true;
      onDone();
    }
  }, [entry.status, onDone]);
  void active;
  return <ToolCallVisualization entries={[entry]} requestId="sim" hasContent />;
}

// ─── Flat segment model for the turn ─────────────────────────────────────────

type Segment =
  | { kind: "text"; text: string }
  | { kind: "call"; recording: StreamRecording };

function buildSegments(scenario: Scenario): Segment[] {
  const out: Segment[] = [{ kind: "text", text: scenario.intro }];
  scenario.calls.forEach((c) => {
    out.push({
      kind: "call",
      recording: buildSimpleRecording(c.toolName, c.args, c.result, {
        displayName: c.displayName,
        workMs: c.workMs,
      }),
    });
    if (c.after) out.push({ kind: "text", text: c.after });
  });
  out.push({ kind: "text", text: scenario.outro });
  return out;
}

// ─── Simulated turn player ───────────────────────────────────────────────────

function SimulatedTurn({ scenario }: { scenario: Scenario }) {
  const segments = useMemo(() => buildSegments(scenario), [scenario]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [runKey, setRunKey] = useState(0);

  const run = () => {
    setRunKey((k) => k + 1);
    setActiveIndex(0);
  };

  const advance = useMemo(
    () => () => setActiveIndex((i) => (i < segments.length - 1 ? i + 1 : i)),
    [segments.length],
  );

  const started = activeIndex >= 0;
  const finished = started && activeIndex >= segments.length - 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={run} className="gap-1.5">
          {started ? <RotateCcw className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {started ? "Replay" : "Run"}
        </Button>
        {started && !finished ? (
          <Badge variant="secondary" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            playing
          </Badge>
        ) : null}
        {finished ? <Badge variant="outline">done</Badge> : null}
      </div>

      {!started ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Press <span className="font-medium text-foreground">Run</span> to watch the agent write, call the tool, and continue.
        </div>
      ) : (
        // A single assistant turn — the exact width of a real chat message.
        <div
          key={runKey}
          className="mx-auto w-full max-w-3xl space-y-2 rounded-lg border border-border bg-card p-4"
        >
          {segments.map((seg, i) => {
            if (i > activeIndex) return null;
            const isActive = i === activeIndex;
            if (seg.kind === "text") {
              return (
                <AgentTextSegment
                  key={`${runKey}-seg-${i}`}
                  text={seg.text}
                  active={isActive}
                  done={i < activeIndex}
                  onDone={advance}
                />
              );
            }
            return (
              <SimulatedCallSegment
                key={`${runKey}-seg-${i}`}
                recording={seg.recording}
                active={isActive}
                onDone={advance}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Real saved runs ─────────────────────────────────────────────────────────

interface CxToolCallRow {
  id: string;
  call_id: string | null;
  tool_name: string;
  tool_name_as_called: string | null;
  arguments: Record<string, unknown> | null;
  output: unknown;
  is_error: boolean | null;
  error_type: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  execution_events: unknown;
  created_at: string;
  user_id?: string | null;
  conversation_id?: string | null;
}

function rowToEntry(row: CxToolCallRow): ToolLifecycleEntry {
  return {
    callId: row.call_id || row.id,
    toolName: row.tool_name,
    displayName: row.tool_name_as_called || row.tool_name,
    status: row.is_error ? "error" : "completed",
    arguments: (row.arguments as Record<string, unknown>) ?? {},
    startedAt: row.started_at,
    completedAt: row.completed_at,
    latestMessage: null,
    latestData: null,
    result: row.output,
    resultPreview: null,
    errorType: row.error_type,
    errorMessage: row.error_message,
    isDelegated: false,
    events: Array.isArray(row.execution_events)
      ? (row.execution_events as ToolLifecycleEntry["events"])
      : [],
  };
}

// Fallback tool list for NON-super-admins (per-user search). Super-admins get a
// live list discovered from the DB (every tool that has real usage).
const FALLBACK_REAL_RUN_TOOLS = [
  "note",
  "memory",
  "fs_list",
  "fs_read",
  "shell_execute",
  "data",
  "read_page",
  "navigate_active_tab",
  "find",
  "tabs",
  "ctx_get",
  "sql",
];

interface ToolUsage {
  tool_name: string;
  count: number;
  errors: number;
  last_used: string;
}

// Most informative arg/output value to label a usage row in the picker.
const INFORMATIVE_KEYS = [
  "label",
  "path",
  "command",
  "city",
  "key",
  "query",
  "url",
  "action",
  "resource",
  "ref",
];

function summarizeRow(row: CxToolCallRow): string {
  const args = (row.arguments ?? {}) as Record<string, unknown>;
  for (const k of INFORMATIVE_KEYS) {
    const v = args[k];
    if (typeof v === "string" && v.trim()) return `${k}: ${v.slice(0, 90)}`;
  }
  try {
    const out =
      typeof row.output === "string" ? JSON.parse(row.output) : row.output;
    if (out && typeof out === "object") {
      const label = (out as Record<string, unknown>).label;
      if (typeof label === "string" && label) return label;
    }
  } catch {
    /* ignore */
  }
  return row.tool_name_as_called || row.tool_name;
}

/**
 * Real saved runs. Super-admins search ACROSS ALL users via the admin route
 * (`/api/admin/tool-call-samples`, RLS-bypassing but hard super-admin gated);
 * everyone else searches their own calls directly. Either way: pick a tool →
 * see the most recent usages → select one → render it exactly as on reload.
 */
function RealRuns({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [tool, setTool] = useState("note");
  const [tools, setTools] = useState<ToolUsage[] | null>(null);
  const [rows, setRows] = useState<CxToolCallRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Super-admin: discover every tool that has real usage (recency-ranked).
  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    fetch("/api/admin/tool-call-samples?mode=tools")
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && Array.isArray(j.tools)) setTools(j.tools as ToolUsage[]);
      })
      .catch(() => {
        /* discovery is best-effort; the input still accepts free text */
      });
    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin]);

  const load = async () => {
    const name = tool.trim();
    if (!name) return;
    setLoading(true);
    setError(null);
    setRows(null);
    setSelectedId(null);
    try {
      let data: CxToolCallRow[] = [];
      if (isSuperAdmin) {
        const res = await fetch(
          `/api/admin/tool-call-samples?tool=${encodeURIComponent(name)}&limit=10`,
        );
        const j = await res.json();
        if (!res.ok) throw new Error(j.details || j.error || "Request failed");
        data = (j.rows as CxToolCallRow[]) ?? [];
      } else {
        const { data: d, error: err } = await supabase
          .from("cx_tool_call")
          .select(
            "id, call_id, tool_name, tool_name_as_called, arguments, output, is_error, error_type, error_message, started_at, completed_at, execution_events, created_at",
          )
          .eq("tool_name", name)
          .not("output", "is", null)
          .order("created_at", { ascending: false })
          .limit(10);
        if (err) throw err;
        data = (d as CxToolCallRow[]) ?? [];
      }
      setRows(data);
      setSelectedId(data[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const selected = rows?.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isSuperAdmin ? "default" : "secondary"} className="gap-1">
          <Database className="h-3 w-3" />
          {isSuperAdmin ? "All users · super admin" : "Your runs"}
        </Badge>

        {isSuperAdmin ? (
          <>
            <input
              list="tool-usage-options"
              value={tool}
              onChange={(e) => {
                setTool(e.target.value);
                setRows(null);
              }}
              placeholder="tool name (e.g. note)"
              className="w-56 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
            />
            <datalist id="tool-usage-options">
              {(tools ?? []).map((t) => (
                <option key={t.tool_name} value={t.tool_name}>
                  {t.count} use{t.count === 1 ? "" : "s"} · last{" "}
                  {formatRelativeTime(t.last_used)}
                </option>
              ))}
            </datalist>
          </>
        ) : (
          <select
            value={tool}
            onChange={(e) => {
              setTool(e.target.value);
              setRows(null);
            }}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
          >
            {FALLBACK_REAL_RUN_TOOLS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}

        <Button size="sm" onClick={load} className="gap-1.5" disabled={loading}>
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Database className="h-3.5 w-3.5" />
          )}
          Find usages
        </Button>
        {rows ? <Badge variant="outline">{rows.length} found</Badge> : null}
      </div>

      {isSuperAdmin && tools ? (
        <p className="text-xs text-muted-foreground">
          {tools.length} tools with recent usage. Type or pick one above, then
          Find usages.
        </p>
      ) : null}

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {rows && rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          No saved runs for <span className="font-mono">{tool}</span>
          {isSuperAdmin ? "" : " on your account"}. Run this tool in a chat, then
          come back.
        </div>
      ) : null}

      {rows && rows.length > 0 ? (
        <div className="mx-auto grid w-full max-w-3xl gap-3 md:grid-cols-[260px_1fr]">
          {/* Usage picker — most recent N */}
          <ul className="space-y-1">
            {rows.map((row) => {
              const active = row.id === selectedId;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className={
                      "w-full rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors " +
                      (active
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50")
                    }
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-foreground truncate">
                        {summarizeRow(row)}
                      </span>
                      {row.is_error ? (
                        <Badge variant="destructive" className="ml-auto shrink-0">
                          error
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {formatRelativeTime(row.created_at)}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Selected render */}
          <div className="min-w-0">
            {selected ? (
              <div className="rounded-lg border border-border bg-card p-3">
                <ToolCallVisualization
                  key={selected.id}
                  entries={[rowToEntry(selected)]}
                  isPersisted
                  hasContent
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ToolInActionPage() {
  const [mode, setMode] = useState<"sim" | "real">("sim");
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold text-foreground">Tool renderer — in action</h1>
        <p className="text-sm text-muted-foreground">
          See a single tool render inside a realistic assistant turn (the agent writes, calls the tool, then continues),
          or load a tool's REAL saved runs with actual args + output
          {isSuperAdmin ? " (across all users)" : ""}.
        </p>
      </header>

      <div className="inline-flex rounded-md border border-border p-0.5">
        <button
          onClick={() => setMode("sim")}
          className={`flex items-center gap-1.5 rounded px-3 py-1 text-sm ${mode === "sim" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Simulated turn
        </button>
        <button
          onClick={() => setMode("real")}
          className={`flex items-center gap-1.5 rounded px-3 py-1 text-sm ${mode === "real" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Database className="h-3.5 w-3.5" />
          Real saved run
        </button>
      </div>

      {mode === "sim" ? (
        <section className="space-y-3">
          <select
            value={scenarioId}
            onChange={(e) => setScenarioId(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
          >
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {/* Remount on scenario change so the player resets cleanly. */}
          <SimulatedTurn key={scenario.id} scenario={scenario} />
        </section>
      ) : (
        <section className="space-y-3">
          <RealRuns isSuperAdmin={isSuperAdmin} />
        </section>
      )}
    </div>
  );
}
