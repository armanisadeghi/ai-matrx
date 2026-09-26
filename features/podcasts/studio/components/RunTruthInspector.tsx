"use client";

// features/podcasts/studio/components/RunTruthInspector.tsx
//
// The "absolute truth" of a podcast run — everything durably stored, nothing
// hidden. Reads the raw rows directly from Supabase (owner-scoped via RLS, same
// access path as runsRepository): the `agent_run` (full request / result /
// error / cost), every `agent_run_stage` (the actual per-agent OUTPUT, error,
// cost, timing — i.e. what each agent produced), the `pc_studio_runs` scratch
// row, and the `pc_episodes` row. This is the debugging ground truth: when the
// cast/voices/script come out wrong you can see exactly which stage produced
// what, with the exact request that was sent.
//
// Read-only. Lazy — fetches on first expand. "Copy for AI" dumps the whole
// truth as one JSON object for pasting into a chat/issue.
//
// KEYING (2026-09-17 defect): on an in-place run the durable agent_run id is
// not known at mount — it arrives mid-stream. The panel used to fetch once with
// a null id and then show "(empty)" / "No stage records" beside "Nothing is
// hidden" forever, and Refresh re-ran the same null query. Now: every load
// resolves the id (prop → pc_studio_runs.backend_run_id → none), an open panel
// refetches whenever the id or episode it was loaded for changes, and an
// unresolved id is SAID, never rendered as empty records.

import { useEffect, useEffectEvent, useState } from "react";
import { toast } from "@/lib/toast";
import {
  AlertCircle,
  ChevronDown,
  ClipboardCopy,
  Loader2,
  RefreshCw,
  ScrollText,
} from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";
import { formatDurationMs } from "@ai-matrx/kit/format";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface RunTruthInspectorProps {
  /** The durable agent_run id (source of truth). */
  agentRunId: string | null;
  /** The pc_studio_runs scratch row id (the studio run page URL id). */
  studioRunId: string;
  /** The persisted episode id, when one exists. */
  episodeId: string | null;
}

type Row = Record<string, unknown>;

interface RunTruth {
  /** The agent_run id this truth was read for (null = none resolvable yet). */
  resolvedAgentRunId: string | null;
  /** The props this load was made for — a change means the truth is stale. */
  loadedFor: string;
  agentRun: Row | null;
  stages: Row[];
  studioRun: Row | null;
  episode: Row | null;
  fetchedAt: string;
}

const STATUS_TONE: Record<string, string> = {
  completed: "text-emerald-600 dark:text-emerald-400",
  done: "text-emerald-600 dark:text-emerald-400",
  failed: "text-red-600 dark:text-red-400",
  cancelled: "text-amber-600 dark:text-amber-500",
  processing: "text-primary",
  running: "text-primary",
};

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Couldn't copy to clipboard");
  }
}

function durationLabel(start: unknown, end: unknown): string | null {
  if (typeof start !== "string") return null;
  const s = new Date(start).getTime();
  const e = typeof end === "string" ? new Date(end).getTime() : Date.now();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return null;
  return formatDurationMs(e - s, { style: "compact" });
}

function CopyButton({ text, label }: { text: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => copyText(text, label)}
      className="flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <ClipboardCopy className="h-3 w-3" />
      Copy
    </button>
  );
}

function JsonBlock({
  title,
  value,
  defaultOpen = false,
}: {
  title: string;
  value: unknown;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isEmpty =
    value == null ||
    (typeof value === "object" && Object.keys(value as object).length === 0) ||
    (Array.isArray(value) && value.length === 0);
  const text = pretty(value);
  return (
    <div className="rounded-lg border border-border bg-background/60">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground"
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 transition-transform",
              !open && "-rotate-90",
            )}
          />
          <span className="truncate">{title}</span>
          {isEmpty && (
            <span className="text-[10px] text-muted-foreground">(empty)</span>
          )}
        </button>
        {!isEmpty && <CopyButton text={text} label={title} />}
      </div>
      {open && !isEmpty && (
        <pre className="max-h-80 overflow-auto border-t border-border px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {text}
        </pre>
      )}
    </div>
  );
}

function StageCard({ stage }: { stage: Row }) {
  const key = String(stage.stage_key ?? "?");
  const status = String(stage.status ?? "");
  const failed = status === "failed";
  const [open, setOpen] = useState(failed); // failed stages start expanded
  const dur = durationLabel(stage.started_at, stage.finished_at);
  const cost = typeof stage.cost === "number" ? stage.cost : null;
  // agent_run_stage.output is jsonb shaped { output: <actual> } — surface the
  // inner value when present, else the whole object.
  const rawOutput = stage.output as { output?: unknown } | null;
  const output =
    rawOutput && "output" in rawOutput ? rawOutput.output : rawOutput;

  return (
    <div className="rounded-lg border border-border bg-background/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform",
            !open && "-rotate-90",
          )}
        />
        <span className="font-mono text-xs text-foreground">{key}</span>
        <span
          className={cn(
            "text-[11px] font-medium",
            STATUS_TONE[status] ?? "text-muted-foreground",
          )}
        >
          {status || "—"}
        </span>
        <span className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
          {dur && <span>{dur}</span>}
          {cost != null && <span>${cost.toFixed(4)}</span>}
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border px-3 py-2">
          {stage.error != null && (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase text-red-600 dark:text-red-400">
                  Error
                  <ErrorAlchemyMenu />
                </span>
                <CopyButton text={pretty(stage.error)} label="Stage error" />
              </div>
              <pre className="max-h-60 overflow-auto text-[11px] text-red-700 dark:text-red-300">
                {pretty(stage.error)}
              </pre>
              <ErrorAlchemyMenu />
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground">
              Output
            </span>
            <CopyButton text={pretty(output)} label="Stage output" />
          </div>
          <pre className="max-h-80 overflow-auto rounded-md border border-border bg-background/60 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
            {output == null ? "(no output)" : pretty(output)}
          </pre>
        </div>
      )}
    </div>
  );
}

/** Which agent_run to read. The page's live id wins; otherwise the scratch
 *  row's backend_run_id (persisted the moment the stream announced it); with
 *  no scratch row at all, the URL id IS the agent_run id (manage-list links). */
export function resolveTruthAgentRunId(input: {
  agentRunId: string | null;
  studioRunId: string;
  studioRun: Row | null;
}): string | null {
  if (input.agentRunId) return input.agentRunId;
  if (input.studioRun) {
    const backend = input.studioRun.backend_run_id;
    return typeof backend === "string" && backend.trim() ? backend : null;
  }
  return input.studioRunId;
}

export function RunTruthInspector({
  agentRunId,
  studioRunId,
  episodeId,
}: RunTruthInspectorProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truth, setTruth] = useState<RunTruth | null>(null);

  const loadKey = `${agentRunId ?? ""}|${episodeId ?? ""}`;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [studioRunRes, episodeRes] = await Promise.all([
        supabase
          .schema("podcast")
          .from("pc_studio_runs")
          .select("*")
          .eq("id", studioRunId)
          .maybeSingle(), // intentionally includes soft-deleted
        episodeId
          ? supabase
              .schema("podcast")
              .from("pc_episodes")
              .select("*")
              .eq("id", episodeId)
              .maybeSingle() // intentionally includes soft-deleted
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (studioRunRes.error) throw studioRunRes.error;
      if (episodeRes.error) throw episodeRes.error;
      const studioRun = (studioRunRes.data as Row) ?? null;
      const resolvedAgentRunId = resolveTruthAgentRunId({
        agentRunId,
        studioRunId,
        studioRun,
      });
      const [agentRunRes, stagesRes] = await Promise.all([
        resolvedAgentRunId
          ? supabase
              .schema("chat")
              .from("agent_run")
              .select("*")
              .eq("id", resolvedAgentRunId)
              .maybeSingle() // intentionally includes soft-deleted
          : Promise.resolve({ data: null, error: null }),
        resolvedAgentRunId
          ? supabase
              .schema("chat")
              .from("agent_run_stage")
              .select("*")
              .eq("run_id", resolvedAgentRunId)
              .order("started_at", { ascending: true, nullsFirst: true })
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (agentRunRes.error) throw agentRunRes.error;
      if (stagesRes.error) throw stagesRes.error;
      setTruth({
        resolvedAgentRunId,
        loadedFor: loadKey,
        agentRun: (agentRunRes.data as Row) ?? null,
        stages: (stagesRes.data as Row[]) ?? [],
        studioRun,
        episode: (episodeRes.data as Row) ?? null,
        fetchedAt: new Date().toISOString(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load run details");
    } finally {
      setLoading(false);
    }
  };

  // The id (or episode) this panel was loaded for changed under an open panel —
  // the run announced its durable record mid-stream. Re-read immediately.
  const stale = open && truth != null && truth.loadedFor !== loadKey;
  const reloadStale = useEffectEvent(() => {
    if (!loading) void load();
  });
  useEffect(() => {
    if (!stale) return undefined;
    // Scheduled, not inline: rapid id/episode changes collapse into one read.
    const timer = setTimeout(reloadStale, 0);
    return () => clearTimeout(timer);
  }, [stale, loading]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !truth && !loading) void load();
  };

  const agentRun = truth?.agentRun ?? null;
  const status = agentRun ? String(agentRun.status ?? "") : "";
  const totalCost =
    agentRun && typeof agentRun.total_cost === "number"
      ? agentRun.total_cost
      : null;
  const runDuration = agentRun
    ? durationLabel(agentRun.created_at, agentRun.updated_at)
    : null;

  return (
    <div className="rounded-2xl border border-border bg-card/40">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-foreground"
      >
        <ScrollText className="h-4 w-4 text-muted-foreground" />
        Run details — full truth
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
          advanced
        </span>
        {loading && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
        <ChevronDown
          className={cn(
            "ml-auto h-4 w-4 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border p-4">
          <p className="text-[11px] text-muted-foreground">
            Everything durably stored for this run — the exact request sent,
            every agent stage&apos;s output/error/cost, and the resulting rows.
            Nothing is hidden. Use this to see precisely what ran and what each
            step produced.
          </p>

          {error ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              <span className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </span>
              <button
                type="button"
                onClick={() => void load()}
                className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-medium hover:bg-red-500/10"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            </div>
          ) : null}

          {loading && !truth ? (
            <div className="flex items-center gap-2 px-1 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading the full run record…
            </div>
          ) : null}

          {truth ? (
            <>
              {/* Toolbar + summary */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-border bg-background/60 px-3 py-2 text-[11px] text-muted-foreground">
                <span>
                  status:{" "}
                  <span
                    className={cn(
                      "font-medium",
                      STATUS_TONE[status] ?? "text-foreground",
                    )}
                  >
                    {status || "—"}
                  </span>
                </span>
                {runDuration && <span>duration: {runDuration}</span>}
                {totalCost != null && (
                  <span>cost: ${totalCost.toFixed(4)}</span>
                )}
                <span className="font-mono">
                  run: {truth.resolvedAgentRunId ?? "not assigned yet"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void copyText(pretty(truth), "Full run truth");
                  }}
                  className="ml-auto flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                  Copy all for AI
                </button>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </button>
              </div>

              {!truth.resolvedAgentRunId ? (
                <p className="rounded-lg border border-border bg-background/60 px-3 py-2 text-[11px] text-muted-foreground">
                  The server hasn&apos;t assigned this run its durable record
                  yet, so there is no request, result, or stage history to show.
                  This panel fills in by itself the moment it is assigned — or
                  press Refresh.
                </p>
              ) : truth.agentRun == null ? (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
                  No durable run record exists for {truth.resolvedAgentRunId}.
                  It may not be written yet (press Refresh) or it was never
                  committed.
                </p>
              ) : null}

              {agentRun != null && (
                <>
                  {/* The headline truth: request (incl. the cast we sent) + result. */}
                  <JsonBlock
                    title="Request sent (input — includes speaker cast)"
                    value={agentRun?.request ?? null}
                    defaultOpen
                  />
                  <JsonBlock
                    title="Result (resolved cast, URLs, official video)"
                    value={agentRun?.result ?? null}
                  />
                  {agentRun?.error != null && (
                    <JsonBlock
                      title="Run error"
                      value={agentRun.error}
                      defaultOpen
                    />
                  )}

                  {/* Per-agent stage truth. */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between px-0.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Stages ({truth.stages.length}) — what each agent
                        produced
                      </span>
                    </div>
                    {truth.stages.length === 0 ? (
                      <p className="px-1 text-[11px] text-muted-foreground">
                        No stage records found for this run.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {truth.stages.map((s, i) => (
                          <StageCard
                            key={String(s.id ?? `${s.stage_key}-${i}`)}
                            stage={s}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Supporting rows. */}
              <JsonBlock
                title="Studio run row (pc_studio_runs)"
                value={truth.studioRun}
              />
              <JsonBlock
                title="Episode row (pc_episodes)"
                value={truth.episode}
              />
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
