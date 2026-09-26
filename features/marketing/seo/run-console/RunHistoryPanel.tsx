"use client";

/**
 * RUN HISTORY — Arman's ruling, 2026-08-25 (KI-049 addendum): "I need a place
 * where I can go and I can look at the actual runs. And if we made fifty AI
 * calls, I need to be able to click through them one by one and see what
 * they generated, what they did, what the results of them were."
 *
 * Master (runs, `admin_list_run_history`) → detail (one run's AI calls, one at
 * a time, `admin_list_run_ai_calls`). Data: `./runHistoryData.ts`.
 *
 * FINDABLE (2026-09-14). A 20-second heartbeat filled the old fixed 50 rows and
 * buried every SEO run. The list is now filter-first and cursor-paged (Temporal
 * UI / GitHub Actions / Stripe), the default view is runs that did AI work plus
 * every SEO command run, and the scheduled runs that view leaves out are GROUPED
 * per task with their count — one click expands a group into exactly those runs
 * (Sentry / the browser console's repeated-row grouping). Nothing is hidden
 * without saying how much. Filters and the open run live in the URL.
 */

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Clock,
  Coins,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { cn } from "@/styles/themes/utils";
import { formatCount, formatUsd } from "@ai-matrx/kit/format";
import { extractErrorMessage, humanizeBackendError } from "@/utils/errors";
// THE package duration formatter (`@ai-matrx/kit/format`, census H1
// 2026-09-07). `compact` is the elapsed-work voice: 250ms / 5.2s / 5m 30s /
// 1h 02m. THE UNIT LAW puts the unit in the name.
import { formatDurationMs } from "@ai-matrx/kit/format";
import {
  getRunHistoryEntry,
  listRunAiCalls,
  listRunHistoryFacets,
  listRunHistoryPage,
  type RunAiCall,
  type RunHistoryEntry,
  type RunHistoryFacet,
} from "./runHistoryData";
import {
  activeFilterCount,
  EMPTY_RUN_HISTORY_FILTERS,
  parseRunHistoryFilters,
  parseSelectedRun,
  RUN_KIND_LABEL,
  RUN_KINDS,
  STATUS_GROUP_LABEL,
  STATUS_GROUPS,
  writeRunHistoryParams,
  type RunHistoryFilters,
  type RunKind,
  type SelectedRunRef,
  type StatusGroup,
} from "./runHistoryFilters";
import { replaceAddressWithoutNavigating } from "@/lib/url-state/addressWithoutNavigating";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

const formatDuration = (ms: number | null): string =>
  formatDurationMs(ms, { style: "compact" });

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

function groupOfStatus(status: string | null): StatusGroup | "other" {
  const s = (status ?? "").toLowerCase();
  if (["success", "succeeded", "completed", "complete", "done"].includes(s))
    return "succeeded";
  if (["failed", "error", "errored"].includes(s)) return "failed";
  if (
    [
      "abandoned",
      "cancelled",
      "canceled",
      "interrupted",
      "timed_out",
      "timeout",
      "expired",
      "lease_expired",
    ].includes(s)
  )
    return "interrupted";
  if (
    [
      "queued",
      "claimed",
      "running",
      "pending",
      "processing",
      "in_progress",
      "started",
    ].includes(s)
  )
    return "running";
  return "other";
}

function StatusBadge({
  status,
  group,
}: {
  status: string | null;
  group?: string | null;
}) {
  const g = (group as StatusGroup | "other" | null) ?? groupOfStatus(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide",
        g === "succeeded" && "border-primary/40 bg-primary/10 text-primary",
        g === "failed" && "border-destructive/50 bg-destructive/10 text-destructive",
        g === "interrupted" && "border-warning/50 bg-warning/10 text-warning",
        (g === "running" || g === "other") &&
          "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      {g === "succeeded" ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : g === "failed" ? (
        <XCircle className="h-3 w-3" />
      ) : g === "interrupted" ? (
        <CircleSlash className="h-3 w-3" />
      ) : g === "running" ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : null}
      {status ?? "unknown"}
    </span>
  );
}

/** The inline marker matrx-ai's snapshot redactor leaves where it cut a string.
 * Before 2026-09-14 it cut AI answers over 64 KB too, keeping only 128
 * characters at each end — those answers are gone and must never be shown as
 * if they were complete. */
const SNAPSHOT_REDACTION_MARKER = "<<<MATRX_SNAPSHOT_REDACTION";

function isFailedCall(call: RunAiCall): boolean {
  const s = (call.status ?? "").toLowerCase();
  return ["failed", "error", "cancelled"].includes(s) || call.error != null;
}

/** One AI call's full record — the generated content is the point, so its
 * output owns the body; everything else is a compact metrics strip. */
function AiCallCard({ call, index }: { call: RunAiCall; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const failed = isFailedCall(call);
  const truncated = !!call.output_text?.includes(SNAPSHOT_REDACTION_MARKER);
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
            {formatUsd(call.cost, { digits: "adaptive" })}
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
              <>
                {truncated ? (
                  <p className="mb-1 flex items-start gap-1 rounded border border-border bg-muted/30 px-2 py-1 text-[11px] text-foreground">
                    <AlertTriangle className="mt-px h-3 w-3 shrink-0 text-muted-foreground" />
                    <span>
                      Only part of this answer was kept. It was recorded before
                      September 14, 2026, when answers over 64 KB were shortened
                      to their first and last lines. The rest cannot be
                      recovered; answers recorded since then are kept in full.
                    </span>
                  </p>
                ) : null}
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-[11px] text-foreground">
                  {call.output_text}
                </pre>
              </>
            ) : failed ? (
              <p className="text-[11px] text-destructive">
                This call failed before the model returned an answer, so there
                is nothing it generated. The reason is below.
                <ErrorAlchemyMenu />
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                This call returned no text (a tool-only step, or its record was
                not kept).
              </p>
            )}
          </div>
          {call.error ? (
            <div>
              <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
                Error
                <ErrorAlchemyMenu />
              </p>
              {/* 🚨 A pretty-printed JSON error object is not an answer for
                  the business owner who pressed Run (2026-08-30). This console
                  mounts at the brand tier too, not just for developers. The
                  sentence goes on screen; the exact object stays on `title`. */}
              <p
                className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive"
                title={JSON.stringify(call.error, null, 2)}
              >
                {humanizeBackendError(
                  extractErrorMessage(call.error),
                  "That run failed. The full detail is in the logs.",
                )}
                <ErrorAlchemyMenu />
              </p>
            </div>
          ) : null}
          <p className="text-[10px] tabular-nums text-muted-foreground">
            iteration {call.iteration ?? 0} · conversation{" "}
            {call.conversation_id ? (
              <EntityRef
                token="conversation"
                id={call.conversation_id}
                name={call.conversation_id.slice(0, 8)}
                showIcon={false}
              />
            ) : (
              "—"
            )}{" "}
            · API {formatDuration(call.api_duration_ms)}
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
    queryFn: () =>
      listRunAiCalls(run.execution_kind ?? "", run.execution_id ?? ""),
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
        <StatusBadge status={run.status} group={run.status_group} />
        <span className="font-mono text-[10px] text-muted-foreground">
          {run.execution_id?.slice(0, 8)}
        </span>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
          {calls.data?.length ?? 0} AI call
          {(calls.data?.length ?? 0) === 1 ? "" : "s"} ·{" "}
          {formatUsd(run.total_cost, { digits: "adaptive" })}
        </span>
      </div>
      {run.error_text ? (
        <p className="mx-2 mt-2 rounded border border-destructive/50 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
          {run.error_text}
          <ErrorAlchemyMenu error={run.error_text} />
        </p>
      ) : null}
      {run.summary ? (
        <p className="mx-2 mt-2 rounded border border-border bg-muted/30 px-2 py-1 text-[11px] text-foreground">
          {run.summary}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {calls.isLoading ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Reading AI calls
          </p>
        ) : calls.isError ? (
          <p className="text-xs text-destructive">
            Could not read this run's AI calls:{" "}
            {extractErrorMessage(calls.error)}
            <ErrorAlchemyMenu />
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

/** A task or command filter value, encoded for the Select. */
const ALL_SOURCES = "__all";

function sourceValue(filters: RunHistoryFilters): string {
  if (filters.taskId) return `task:${filters.taskId}`;
  if (filters.operation) return `op:${filters.operation}`;
  return ALL_SOURCES;
}

function facetKey(f: RunHistoryFacet): string {
  return f.execution_kind === "sch_run"
    ? `task:${f.task_id}`
    : `op:${f.operation}`;
}

function FilterBar({
  filters,
  facets,
  onChange,
}: {
  filters: RunHistoryFilters;
  facets: RunHistoryFacet[];
  onChange: (next: RunHistoryFilters) => void;
}) {
  // The run-id box writes the URL after a pause, never per keystroke.
  const [runIdDraft, setRunIdDraft] = useState(filters.runId);
  useEffect(() => setRunIdDraft(filters.runId), [filters.runId]);
  useEffect(() => {
    if (runIdDraft === filters.runId) return;
    const t = setTimeout(() => onChange({ ...filters, runId: runIdDraft }), 350);
    return () => clearTimeout(t);
  }, [runIdDraft, filters, onChange]);

  const tasks = facets.filter((f) => f.execution_kind === "sch_run" && f.task_id);
  const ops = facets.filter(
    (f) => f.execution_kind === "seo_collection_run" && f.operation,
  );
  const toggleStatus = (s: StatusGroup) =>
    onChange({
      ...filters,
      statuses: filters.statuses.includes(s)
        ? filters.statuses.filter((x) => x !== s)
        : [...filters.statuses, s],
    });
  const count = activeFilterCount(filters);

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5">
      <Select
        value={filters.kind ?? ALL_SOURCES}
        onValueChange={(v) =>
          onChange({
            ...filters,
            kind: v === ALL_SOURCES ? null : (v as RunKind),
            // A kind switch drops a source filter from the other kind.
            taskId: v === "seo_collection_run" ? null : filters.taskId,
            operation: v === "sch_run" ? null : filters.operation,
          })
        }
      >
        <SelectTrigger className="h-7 w-[132px] text-xs" aria-label="Run kind">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_SOURCES} className="text-xs">
            Every kind
          </SelectItem>
          {RUN_KINDS.map((k) => (
            <SelectItem key={k} value={k} className="text-xs">
              {RUN_KIND_LABEL[k]}s
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={sourceValue(filters)}
        onValueChange={(v) => {
          if (v === ALL_SOURCES)
            return onChange({ ...filters, taskId: null, operation: null });
          const [type, ...rest] = v.split(":");
          const value = rest.join(":");
          onChange(
            type === "task"
              ? { ...filters, taskId: value, operation: null, kind: "sch_run" }
              : {
                  ...filters,
                  operation: value,
                  taskId: null,
                  kind: "seo_collection_run",
                },
          );
        }}
      >
        <SelectTrigger
          className="h-7 w-[220px] text-xs"
          aria-label="Task or command"
        >
          <SelectValue placeholder="Every task and command" />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          <SelectItem value={ALL_SOURCES} className="text-xs">
            Every task and command
          </SelectItem>
          {tasks.length ? (
            <SelectGroup>
              <SelectLabel className="text-[10px]">Scheduled tasks</SelectLabel>
              {tasks.map((f) => (
                <SelectItem key={facetKey(f)} value={facetKey(f)} className="text-xs">
                  {f.label} · {formatCount(Number(f.run_count))}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : null}
          {ops.length ? (
            <SelectGroup>
              <SelectLabel className="text-[10px]">SEO commands</SelectLabel>
              {ops.map((f) => (
                <SelectItem key={facetKey(f)} value={facetKey(f)} className="text-xs">
                  {f.label} · {formatCount(Number(f.run_count))}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : null}
          {/* A task in the URL that has no runs in this range still names itself. */}
          {sourceValue(filters) !== ALL_SOURCES &&
          !facets.some((f) => facetKey(f) === sourceValue(filters)) ? (
            <SelectItem value={sourceValue(filters)} className="text-xs">
              {filters.operation ?? `Task ${filters.taskId?.slice(0, 8)}`} · no
              runs in this range
            </SelectItem>
          ) : null}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-0.5" role="group" aria-label="Status">
        {STATUS_GROUPS.map((s) => {
          const on = filters.statuses.includes(s);
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => toggleStatus(s)}
              className={cn(
                "h-7 rounded border px-1.5 text-[11px]",
                on
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {STATUS_GROUP_LABEL[s]}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Input
          type="date"
          aria-label="From day"
          value={filters.from ?? ""}
          max={filters.to ?? undefined}
          onChange={(e) => onChange({ ...filters, from: e.target.value || null })}
          className="h-7 w-[128px] px-1.5 text-xs"
        />
        <span>to</span>
        <Input
          type="date"
          aria-label="To day"
          value={filters.to ?? ""}
          min={filters.from ?? undefined}
          onChange={(e) => onChange({ ...filters, to: e.target.value || null })}
          className="h-7 w-[128px] px-1.5 text-xs"
        />
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={runIdDraft}
          onChange={(e) => setRunIdDraft(e.target.value)}
          placeholder="Run id (part is fine)"
          aria-label="Search by run id"
          className="h-7 w-[170px] pl-5 font-mono text-xs"
        />
      </div>

      {count > 0 ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-0.5 px-1.5 text-[11px]"
          onClick={() =>
            onChange({ ...EMPTY_RUN_HISTORY_FILTERS, activity: filters.activity })
          }
        >
          <X className="h-3 w-3" />
          Clear {count}
        </Button>
      ) : null}
    </div>
  );
}

/** The scheduled runs the default view leaves out, one row per task, each
 * saying how many it holds and expanding into exactly those runs. */
function QuietGroups({
  facets,
  onExpand,
  onShowAll,
}: {
  facets: RunHistoryFacet[];
  onExpand: (taskId: string) => void;
  onShowAll: () => void;
}) {
  // Collapsed by default: ~80 task groups listed above the runs would bury the
  // runs again (seen on the first live render, 2026-09-14). One line carries
  // the whole count; expanding shows the largest groups first.
  const [open, setOpen] = useState(false);
  const [showAllGroups, setShowAllGroups] = useState(false);
  const groups = facets
    .filter((f) => f.execution_kind === "sch_run" && f.task_id && Number(f.quiet_count) > 0)
    .sort((a, b) => Number(b.quiet_count) - Number(a.quiet_count));
  if (groups.length === 0) return null;
  const total = groups.reduce((n, g) => n + Number(g.quiet_count), 0);
  const TOP = 5;
  const visible = showAllGroups ? groups : groups.slice(0, TOP);
  return (
    <div className="mb-2 rounded-md border border-dashed border-border bg-muted/20">
      <div className="flex items-center gap-2 px-2.5 py-1 text-[11px] text-muted-foreground">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 items-center gap-1.5 text-left hover:text-foreground"
        >
          <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-90")} />
          <Layers className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {formatCount(total)} scheduled run{total === 1 ? "" : "s"} that made
            no AI calls, grouped into {formatCount(groups.length)} task
            {groups.length === 1 ? "" : "s"}
          </span>
        </button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 shrink-0 px-1.5 text-[11px]"
          onClick={onShowAll}
        >
          Show every run
        </Button>
      </div>
      {open ? (
      <ul className="flex flex-col border-t border-dashed border-border">
        {visible.map((g) => (
          <li key={g.task_id}>
            <button
              type="button"
              onClick={() => onExpand(g.task_id!)}
              className="flex w-full flex-wrap items-center gap-x-2 px-2.5 py-1 text-left hover:bg-muted/40"
            >
              <span className="rounded border border-border bg-background px-1 py-px text-[10px] tabular-nums text-foreground">
                ×{formatCount(Number(g.quiet_count))}
              </span>
              <span className="truncate text-xs text-foreground">{g.label}</span>
              {Number(g.failed_count) > 0 ? (
                <span className="text-[10px] tabular-nums text-destructive">
                  {formatCount(Number(g.failed_count))} failed or interrupted
                  <ErrorAlchemyMenu />
                </span>
              ) : null}
              <span className="ml-auto flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground">
                latest {formatWhen(g.last_at)}
                <ChevronRight className="h-3 w-3" />
              </span>
            </button>
          </li>
        ))}
        {groups.length > TOP ? (
          <li>
            <button
              type="button"
              onClick={() => setShowAllGroups((v) => !v)}
              className="w-full px-2.5 py-1 text-left text-[11px] text-muted-foreground hover:text-foreground"
            >
              {showAllGroups
                ? "Show only the largest groups"
                : `${formatCount(groups.length - TOP)} more task${groups.length - TOP === 1 ? "" : "s"}`}
            </button>
          </li>
        ) : null}
      </ul>
      ) : null}
    </div>
  );
}

function RunRow({
  run,
  onOpen,
}: {
  run: RunHistoryEntry;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-left hover:border-primary/40"
    >
      <StatusBadge status={run.status} group={run.status_group} />
      <span className="truncate text-xs font-medium text-foreground">
        {run.label}
      </span>
      <span className="rounded border border-border px-1 py-px text-[9px] uppercase tracking-wide text-muted-foreground">
        {RUN_KIND_LABEL[run.execution_kind as RunKind] ?? run.source}
      </span>
      {run.ai_call_count > 0 ? (
        <span className="rounded border border-primary/40 bg-primary/10 px-1 py-px text-[10px] tabular-nums text-primary">
          {run.ai_call_count} AI call{run.ai_call_count === 1 ? "" : "s"}
        </span>
      ) : null}
      <span className="font-mono text-[10px] text-muted-foreground">
        {run.execution_id?.slice(0, 8)}
      </span>
      <span className="ml-auto flex items-center gap-2 text-[10px] tabular-nums text-muted-foreground">
        {run.total_cost > 0 ? (
          <span className="flex items-center gap-0.5">
            <Coins className="h-3 w-3" />
            {formatUsd(run.total_cost, { digits: "adaptive" })}
          </span>
        ) : null}
        <span className="flex items-center gap-0.5">
          <Clock className="h-3 w-3" />
          {formatDuration(run.duration_ms)}
        </span>
        <span>{formatWhen(run.sort_at)}</span>
      </span>
      {run.error_text ? (
        <span className="flex w-full items-center gap-1 text-[10px] text-destructive">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="truncate">{run.error_text}</span>
        </span>
      ) : null}
    </button>
  );
}

export function RunHistoryPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const filters = parseRunHistoryFilters(searchParams);
  const selectedRef = parseSelectedRun(searchParams);

  const commit = (next: RunHistoryFilters, selected: SelectedRunRef | null) => {
    const params = writeRunHistoryParams(
      new URLSearchParams(searchParams.toString()),
      next,
      selected,
    );
    const qs = params.toString();
    startTransition(() =>
      replaceAddressWithoutNavigating(qs ? `${pathname}?${qs}` : pathname),
    );
  };
  const setFilters = (next: RunHistoryFilters) => commit(next, null);

  const filterKey = [
    filters.kind,
    filters.taskId,
    filters.operation,
    filters.statuses.join(","),
    filters.from,
    filters.to,
    filters.runId.trim(),
    filters.activity,
  ];

  const runs = useInfiniteQuery({
    queryKey: ["marketing", "run-console", "run-history", ...filterKey],
    queryFn: ({ pageParam }) => listRunHistoryPage(filters, pageParam),
    initialPageParam: null as Parameters<typeof listRunHistoryPage>[1],
    getNextPageParam: (last) => last.next,
    staleTime: 15 * 1000,
  });

  const facets = useQuery({
    queryKey: [
      "marketing",
      "run-console",
      "run-history-facets",
      filters.kind,
      filters.statuses.join(","),
      filters.from,
      filters.to,
    ],
    queryFn: () => listRunHistoryFacets(filters),
    staleTime: 30 * 1000,
  });

  const rows = runs.data?.pages.flatMap((p) => p.rows) ?? [];
  const loadedSelected = selectedRef
    ? rows.find(
        (r) =>
          r.execution_kind === selectedRef.kind &&
          r.execution_id === selectedRef.id,
      )
    : undefined;
  const linkedRun = useQuery({
    queryKey: ["marketing", "run-console", "run-history-one", selectedRef?.kind, selectedRef?.id],
    queryFn: () => getRunHistoryEntry(selectedRef!),
    enabled: !!selectedRef && !loadedSelected && !runs.isLoading,
  });

  if (selectedRef) {
    const run = loadedSelected ?? linkedRun.data;
    if (run) {
      return <RunDetail run={run} onBack={() => commit(filters, null)} />;
    }
    if (linkedRun.isLoading || runs.isLoading) {
      return (
        <p className="flex items-center gap-1 p-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Opening run{" "}
          {selectedRef.id.slice(0, 8)}
        </p>
      );
    }
    return (
      <div className="space-y-2 p-2">
        <p className="text-xs text-destructive">
          {linkedRun.isError
            ? `Could not read run ${selectedRef.id.slice(0, 8)}: ${extractErrorMessage(linkedRun.error)}`
            : `No ${RUN_KIND_LABEL[selectedRef.kind].toLowerCase()} run has the id ${selectedRef.id}.`}
          <ErrorAlchemyMenu />
        </p>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => commit(filters, null)}
        >
          <ChevronLeft className="mr-0.5 h-3 w-3" />
          All runs
        </Button>
      </div>
    );
  }

  const facetRows = facets.data ?? [];
  const expandedTask =
    filters.taskId && filters.activity === "all"
      ? facetRows.find((f) => f.task_id === filters.taskId)
      : undefined;
  const showGroups =
    filters.activity === "ai" &&
    !filters.taskId &&
    !filters.operation &&
    !filters.runId.trim() &&
    filters.kind !== "seo_collection_run";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FilterBar filters={filters} facets={facetRows} onChange={setFilters} />
      <div className="flex items-center gap-2 border-b border-border px-2 py-1 text-[11px] text-muted-foreground">
        <span>
          {filters.runId.trim()
            ? "Runs whose id contains that text, every kind of run."
            : filters.activity === "ai"
              ? "Runs that made AI calls, and every SEO command run. Newest first."
              : "Every run, newest first."}
        </span>
        {filters.activity === "all" ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[11px]"
            onClick={() =>
              setFilters({ ...filters, activity: "ai", taskId: expandedTask ? null : filters.taskId })
            }
          >
            {expandedTask ? `Regroup ${expandedTask.label}` : "Group runs with no AI calls"}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 px-1.5"
          aria-label="Refresh run history"
          onClick={() => {
            void runs.refetch();
            void facets.refetch();
          }}
        >
          {runs.isFetching ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {showGroups ? (
          facets.isError ? (
            <p className="mb-2 text-[11px] text-destructive">
              Could not count the runs this view groups:{" "}
              {extractErrorMessage(facets.error)}
              <ErrorAlchemyMenu />
            </p>
          ) : (
            <QuietGroups
              facets={facetRows}
              onExpand={(taskId) =>
                setFilters({ ...filters, taskId, operation: null, kind: "sch_run", activity: "all" })
              }
              onShowAll={() => setFilters({ ...filters, activity: "all" })}
            />
          )
        ) : null}
        {runs.isLoading ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Reading runs
          </p>
        ) : runs.isError ? (
          <p className="text-xs text-destructive">
            Could not read run history: {extractErrorMessage(runs.error)}
            <ErrorAlchemyMenu />
          </p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {activeFilterCount(filters) > 0 || filters.activity === "ai"
              ? "No runs match this view. Clear a filter, or show every run."
              : "No runs yet. Trigger an engine from Brands, or wait for a scheduled system task to fire."}
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-1">
              {rows.map((run) => (
                <li key={`${run.execution_kind}-${run.execution_id}`}>
                  <RunRow
                    run={run}
                    onOpen={() =>
                      commit(filters, {
                        kind: run.execution_kind as RunKind,
                        id: run.execution_id!,
                      })
                    }
                  />
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-center gap-2 py-2 text-[11px] text-muted-foreground">
              <span className="tabular-nums">
                Showing {formatCount(rows.length)} run{rows.length === 1 ? "" : "s"}
              </span>
              {runs.hasNextPage ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={runs.isFetchingNextPage}
                  onClick={() => void runs.fetchNextPage()}
                >
                  {runs.isFetchingNextPage ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : null}
                  Load more
                </Button>
              ) : (
                <span>· that is every run in this view</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
