"use client";

/**
 * RUN HISTORY — Arman's ruling, 2026-08-25 (KI-049 addendum): "I need a place
 * where I can go and I can look at the actual runs. And if we made fifty AI
 * calls, I need to be able to click through them one by one and see what
 * they generated, what they did, what the results of them were."
 *
 * Master (recent runs, `admin_list_run_history`) → detail (one run's AI
 * calls, one at a time, `admin_list_run_ai_calls`) — read from the same
 * chat.request execution_kind/execution_id attribution the scheduler
 * (`sch_run`) and SEO command runs (`seo_collection_run`) now stamp on every
 * AI call they make. Data: `./runHistoryData.ts`.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Coins,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/styles/themes/utils";
import { formatUsd } from "@/lib/processing-units/units";
import {
  listRunAiCalls,
  listRunHistory,
  type RunAiCall,
  type RunHistoryEntry,
} from "./runHistoryData";

function formatDuration(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: string | null }) {
  const s = (status ?? "").toLowerCase();
  const ok = ["success", "completed", "succeeded"].includes(s);
  const failed = ["failed", "error", "cancelled"].includes(s);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide",
        ok && "border-primary/40 bg-primary/10 text-primary",
        failed && "border-destructive/50 bg-destructive/10 text-destructive",
        !ok && !failed && "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      {ok ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : failed ? (
        <XCircle className="h-3 w-3" />
      ) : (
        <Loader2 className="h-3 w-3" />
      )}
      {status ?? "unknown"}
    </span>
  );
}

/** One AI call's full record — the generated content is the point, so its
 * output owns the body; everything else is a compact metrics strip. */
function AiCallCard({ call, index }: { call: RunAiCall; index: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li className="rounded-md border border-border bg-background/60">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5 text-left"
      >
        <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
          #{index + 1}
        </span>
        <StatusBadge status={call.status} />
        <span className="text-xs font-medium text-foreground">
          {call.model ?? "unknown model"}
        </span>
        <span className="ml-auto flex items-center gap-2 text-[10px] tabular-nums text-muted-foreground">
          <span className="flex items-center gap-0.5">
            <Coins className="h-3 w-3" />
            {formatUsd(call.cost)}
          </span>
          <span className="flex items-center gap-0.5">
            <Clock className="h-3 w-3" />
            {formatDuration(call.total_duration_ms)}
          </span>
          <span>
            {call.input_tokens ?? 0}→{call.output_tokens ?? 0} tok
          </span>
          <span>{formatWhen(call.created_at)}</span>
        </span>
      </button>
      {expanded ? (
        <div className="space-y-2 border-t border-border px-2.5 py-2">
          {call.prompt_text ? (
            <div>
              <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Prompt
              </p>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-[11px] text-foreground">
                {call.prompt_text}
              </pre>
            </div>
          ) : null}
          <div>
            <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              What it generated
            </p>
            {call.output_text ? (
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-[11px] text-foreground">
                {call.output_text}
              </pre>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                No output text was captured for this call (a tool-only
                iteration, or the snapshot was not retained).
              </p>
            )}
          </div>
          {call.error ? (
            <div>
              <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
                Error
              </p>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
                {JSON.stringify(call.error, null, 2)}
              </pre>
            </div>
          ) : null}
          <p className="text-[10px] tabular-nums text-muted-foreground">
            iteration {call.iteration ?? 0} · conversation{" "}
            {call.conversation_id?.slice(0, 8) ?? "—"} · API{" "}
            {formatDuration(call.api_duration_ms)}
          </p>
        </div>
      ) : null}
    </li>
  );
}

function RunDetail({
  run,
  onBack,
}: {
  run: RunHistoryEntry;
  onBack: () => void;
}) {
  const calls = useQuery({
    queryKey: [
      "marketing",
      "run-console",
      "run-ai-calls",
      run.execution_kind,
      run.execution_id,
    ],
    queryFn: () => listRunAiCalls(run.execution_kind ?? "", run.execution_id ?? ""),
    enabled: !!run.execution_kind && !!run.execution_id,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[10px]"
          onClick={onBack}
        >
          <ChevronLeft className="mr-0.5 h-3 w-3" />
          All runs
        </Button>
        <span className="truncate text-xs font-medium text-foreground">
          {run.label}
        </span>
        <StatusBadge status={run.status} />
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
          {calls.data?.length ?? 0} AI call
          {(calls.data?.length ?? 0) === 1 ? "" : "s"} · {formatUsd(run.total_cost)}
        </span>
      </div>
      {run.error_text ? (
        <p className="mx-2 mt-2 rounded border border-destructive/50 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
          {run.error_text}
        </p>
      ) : null}
      {run.summary ? (
        <p className="mx-2 mt-2 rounded border border-border bg-muted/30 px-2 py-1 text-[11px] text-foreground">
          {run.summary}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {calls.isLoading ? (
          <p className="text-xs text-muted-foreground">Reading AI calls…</p>
        ) : calls.isError ? (
          <p className="text-xs text-destructive">
            Could not read this run's AI calls.
          </p>
        ) : (calls.data?.length ?? 0) === 0 ? (
          <p className="text-xs text-muted-foreground">
            No AI calls are attributed to this run. Either it made none, or
            (for runs before 2026-08-25) it predates the attribution fix.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {calls.data!.map((call, i) => (
              <AiCallCard key={call.id} call={call} index={i} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function RunHistoryPanel() {
  const [selected, setSelected] = useState<RunHistoryEntry | null>(null);
  const runs = useQuery({
    queryKey: ["marketing", "run-console", "run-history"],
    queryFn: () => listRunHistory(50),
    staleTime: 15 * 1000,
  });

  if (selected) {
    return <RunDetail run={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
        <p className="text-[11px] text-muted-foreground">
          Recent scheduled + SEO command runs, newest first. Click one to see
          its AI calls.
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 px-1.5"
          onClick={() => void runs.refetch()}
        >
          {runs.isFetching ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {runs.isLoading ? (
          <p className="text-xs text-muted-foreground">Reading recent runs…</p>
        ) : runs.isError ? (
          <p className="text-xs text-destructive">
            Could not read run history.
          </p>
        ) : (runs.data?.length ?? 0) === 0 ? (
          <p className="text-xs text-muted-foreground">
            No runs yet. Trigger an engine from Brands, or wait for a
            scheduled system task to fire.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {runs.data!.map((run) => (
              <li key={`${run.execution_kind}-${run.execution_id}`}>
                <button
                  type="button"
                  onClick={() => setSelected(run)}
                  className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-left hover:border-primary/40"
                >
                  <StatusBadge status={run.status} />
                  <span className="truncate text-xs font-medium text-foreground">
                    {run.label}
                  </span>
                  <span className="rounded border border-border px-1 py-px text-[9px] uppercase tracking-wide text-muted-foreground">
                    {run.source}
                  </span>
                  {run.ai_call_count > 0 ? (
                    <span className="rounded border border-primary/40 bg-primary/10 px-1 py-px text-[10px] tabular-nums text-primary">
                      {run.ai_call_count} AI call
                      {run.ai_call_count === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  <span className="ml-auto flex items-center gap-2 text-[10px] tabular-nums text-muted-foreground">
                    {run.total_cost > 0 ? (
                      <span className="flex items-center gap-0.5">
                        <Coins className="h-3 w-3" />
                        {formatUsd(run.total_cost)}
                      </span>
                    ) : null}
                    <span className="flex items-center gap-0.5">
                      <Clock className="h-3 w-3" />
                      {formatDuration(run.duration_ms)}
                    </span>
                    <span>{formatWhen(run.finished_at ?? run.started_at)}</span>
                  </span>
                  {run.error_text ? (
                    <span className="flex w-full items-center gap-1 text-[10px] text-destructive">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      <span className="truncate">{run.error_text}</span>
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
