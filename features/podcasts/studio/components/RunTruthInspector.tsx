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

import { useState } from "react";
import { toast } from "sonner";
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
  const sec = (e - s) / 1000;
  return sec < 60 ? `${sec.toFixed(1)}s` : `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
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
            className={cn("h-3.5 w-3.5 shrink-0 transition-transform", !open && "-rotate-90")}
          />
          <span className="truncate">{title}</span>
          {isEmpty && <span className="text-[10px] text-muted-foreground">(empty)</span>}
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
  const output = rawOutput && "output" in rawOutput ? rawOutput.output : rawOutput;

  return (
    <div className="rounded-lg border border-border bg-background/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 transition-transform", !open && "-rotate-90")}
        />
        <span className="font-mono text-xs text-foreground">{key}</span>
        <span className={cn("text-[11px] font-medium", STATUS_TONE[status] ?? "text-muted-foreground")}>
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
                </span>
                <CopyButton text={pretty(stage.error)} label="Stage error" />
              </div>
              <pre className="max-h-60 overflow-auto text-[11px] text-red-700 dark:text-red-300">
                {pretty(stage.error)}
              </pre>
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

export function RunTruthInspector({
  agentRunId,
  studioRunId,
  episodeId,
}: RunTruthInspectorProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truth, setTruth] = useState<RunTruth | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [agentRunRes, stagesRes, studioRunRes, episodeRes] = await Promise.all([
        agentRunId
          ? supabase.schema("chat").from("agent_run").select("*").eq("id", agentRunId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        agentRunId
          ? supabase
              .schema("chat").from("agent_run_stage")
              .select("*")
              .eq("run_id", agentRunId)
              .order("started_at", { ascending: true, nullsFirst: true })
          : Promise.resolve({ data: [], error: null }),
        supabase.schema("podcast").from("pc_studio_runs").select("*").eq("id", studioRunId).maybeSingle(),
        episodeId
          ? supabase.schema("podcast").from("pc_episodes").select("*").eq("id", episodeId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      const firstErr =
        agentRunRes.error || stagesRes.error || studioRunRes.error || episodeRes.error;
      if (firstErr) throw firstErr;
      setTruth({
        agentRun: (agentRunRes.data as Row) ?? null,
        stages: (stagesRes.data as Row[]) ?? [],
        studioRun: (studioRunRes.data as Row) ?? null,
        episode: (episodeRes.data as Row) ?? null,
        fetchedAt: new Date().toISOString(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load run details");
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !truth && !loading) void load();
  };

  const agentRun = truth?.agentRun ?? null;
  const status = agentRun ? String(agentRun.status ?? "") : "";
  const totalCost =
    agentRun && typeof agentRun.total_cost === "number" ? agentRun.total_cost : null;
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
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        <ChevronDown
          className={cn("ml-auto h-4 w-4 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border p-4">
          <p className="text-[11px] text-muted-foreground">
            Everything durably stored for this run — the exact request sent, every
            agent stage&apos;s output/error/cost, and the resulting rows. Nothing is
            hidden. Use this to see precisely what ran and what each step produced.
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
                  <span className={cn("font-medium", STATUS_TONE[status] ?? "text-foreground")}>
                    {status || "—"}
                  </span>
                </span>
                {runDuration && <span>duration: {runDuration}</span>}
                {totalCost != null && <span>cost: ${totalCost.toFixed(4)}</span>}
                <span className="font-mono">run: {agentRunId ?? "—"}</span>
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
                <JsonBlock title="Run error" value={agentRun.error} defaultOpen />
              )}

              {/* Per-agent stage truth. */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Stages ({truth.stages.length}) — what each agent produced
                  </span>
                </div>
                {truth.stages.length === 0 ? (
                  <p className="px-1 text-[11px] text-muted-foreground">
                    No stage records found for this run.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {truth.stages.map((s, i) => (
                      <StageCard key={String(s.id ?? `${s.stage_key}-${i}`)} stage={s} />
                    ))}
                  </div>
                )}
              </div>

              {/* Supporting rows. */}
              <JsonBlock title="Studio run row (pc_studio_runs)" value={truth.studioRun} />
              <JsonBlock title="Episode row (pc_episodes)" value={truth.episode} />
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
