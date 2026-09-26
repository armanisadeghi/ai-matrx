"use client";

import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  CircleAlert,
  ExternalLink,
  Laptop,
  Loader2,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  readCodexUsage,
  readCodexUsageAllowance,
  CodexUsageCollectionBusyError,
  type CodexUsageAllowance,
  type CodexUsageGrouping,
  type CodexUsageMetrics,
  type CodexUsageRow,
  type CodexUsageSnapshot,
} from "@/features/admin/codex-usage/service";
import { useDesktopPresence } from "@/features/agents/hooks/useDesktopPresence";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCount, formatPercent } from "@ai-matrx/kit/format";
import { MatrxDataTable, type MatrxColumnDef } from "@ai-matrx/design-system/data-table";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

type RangePreset = "today" | "yesterday" | "last-12-hours" | "custom";

type TimeRange = { start: string; end: string };
type LoadMode = "selection" | "refresh" | "continue";
type UsageLoad = {
  generation: number;
  mode: LoadMode;
  range: TimeRange;
  presence: ReturnType<typeof useDesktopPresence>;
};
type UsageScope =
  | { kind: "model"; model: string | null; effort?: string | null }
  | { kind: "project"; project: string | null }
  | { kind: "conversation" | "worker"; conversationId: string | null };

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const credits = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function localDate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function localMidnight(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function rangeForPreset(preset: Exclude<RangePreset, "custom">): TimeRange {
  const now = new Date();
  if (preset === "last-12-hours") {
    return {
      start: new Date(now.getTime() - 12 * 60 * 60_000).toISOString(),
      end: now.toISOString(),
    };
  }
  const startOfToday = localMidnight(localDate(now));
  const start =
    preset === "yesterday" ? addDays(startOfToday, -1) : startOfToday;
  return { start: start.toISOString(), end: addDays(start, 1).toISOString() };
}

function dateRange(startDate: string, endDate: string): TimeRange | null {
  const start = localMidnight(startDate);
  const end = addDays(localMidnight(endDate), 1);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start >= end
  )
    return null;
  return { start: start.toISOString(), end: end.toISOString() };
}

function metric(value: number | null | undefined): string {
  return value == null ? "—" : number.format(value);
}

function estimatedCredits(value: number | null | undefined): string {
  return value == null
    ? "Not available"
    : `${credits.format(value)} standard credits`;
}

function timestamp(value: string | null | undefined): string {
  if (!value || Number.isNaN(new Date(value).getTime())) return "Unknown";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * The producer of this column clamps to 0..100, so it is the 0..100 spelling
 * THE UNIT LAW asks for. "Not available" is this dashboard's own word for an
 * unmeasured row. A measured share below half a percent now reads "<1%"
 * instead of a confident "0%".
 */
function percentage(value: number | null | undefined): string {
  return formatPercent(value, { unknown: "Not available" });
}

function labelFor(row: CodexUsageRow, fallback: string): string {
  return (
    row.label ??
    row.title ??
    row.conversation_title ??
    row.project ??
    row.model ??
    row.worker ??
    fallback
  );
}

function CountCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-2xl font-semibold tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function UsageTable({
  title,
  rows,
  empty,
  onSelect,
  selected,
}: {
  title: string;
  rows: CodexUsageRow[];
  empty: string;
  onSelect?: (row: CodexUsageRow) => void;
  selected?: (row: CodexUsageRow) => boolean;
}) {
  const columns: MatrxColumnDef<CodexUsageRow>[] = [
    { id: "name", header: "Name", accessorFn: (row) => labelFor(row, "Unnamed activity"), cell: (usage) => {
      const name = labelFor(usage, "Unnamed activity");
      return <div className="min-w-0">{onSelect ? <button type="button" onClick={() => onSelect(usage)} className="max-w-full truncate text-left font-medium text-primary hover:underline">{name}</button> : usage.href ? <a href={usage.href} className="inline-flex max-w-full items-center gap-1 font-medium text-primary hover:underline"><span className="truncate">{name}</span><ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden /></a> : <span className="block truncate font-medium">{name}</span>}{usage.project && usage.project !== name ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{usage.project}</span> : null}</div>;
    } },
    { accessorKey: "model", header: "Model", cell: (row) => row.model ?? "—" },
    { accessorKey: "effort", header: "Effort", cell: (row) => row.effort ?? "—" },
    { accessorKey: "response_count", header: "Responses", cell: (row) => metric(row.response_count), className: "text-right tabular-nums" },
    { accessorKey: "estimated_standard_credits", header: "Estimated standard credits", cell: (row) => estimatedCredits(row.estimated_standard_credits), className: "text-right tabular-nums" },
  ];
  return (
    <section className="min-w-0 rounded-lg border bg-card">
      <MatrxDataTable<CodexUsageRow>
        tableId={`admin/codex-usage/${title.toLowerCase().replaceAll(" ", "-")}`}
        data={rows}
        columns={columns}
        getRowId={(row) => `${row.task_id ?? row.conversation_id ?? row.id ?? row.label ?? labelFor(row, "Unnamed activity")}-${row.model ?? ""}-${row.effort ?? ""}`}
        density="condensed"
        copy={false}
        detail={{ enabled: false }}
        rowClassName={(row) => selected?.(row) ? "bg-primary/5" : undefined}
        emptyState={{ title: empty }}
        toolbar={{ title, search: true }}
      />
    </section>
  );
}

function optionalActivity(
  metrics: CodexUsageMetrics,
): Array<{ label: string; value: number }> {
  const values = [
    {
      label: "Submitted peer-send expressions",
      value: metrics.peer_message_invocations,
    },
    {
      label: "Internal collaboration messages",
      value: metrics.collaboration_message_calls,
    },
    { label: "Child-agent calls", value: metrics.child_invocations },
  ];
  return values.filter(
    (item): item is { label: string; value: number } =>
      typeof item.value === "number",
  );
}

export function CodexUsageDashboard() {
  const presence = useDesktopPresence();
  const [preset, setPreset] = useState<RangePreset>("today");
  const [grouping, setGrouping] = useState<CodexUsageGrouping>("model");
  const [startDate, setStartDate] = useState(() => localDate(new Date()));
  const [endDate, setEndDate] = useState(() => localDate(new Date()));
  const [resumeRange, setResumeRange] = useState<TimeRange | null>(null);
  const [snapshot, setSnapshot] = useState<CodexUsageSnapshot | null>(null);
  const [allowance, setAllowance] = useState<CodexUsageAllowance | null>(null);
  const [allowanceError, setAllowanceError] = useState<string | null>(null);
  const [scope, setScope] = useState<UsageScope | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  const allowanceGeneration = useRef(0);
  const activeLoad = useRef(false);
  const queuedLoad = useRef<UsageLoad | null>(null);

  async function load(mode: LoadMode) {
    const generation = ++requestGeneration.current;
    const computedRange =
      preset === "custom"
        ? dateRange(startDate, endDate)
        : rangeForPreset(preset);
    const range = mode === "continue" ? resumeRange : computedRange;
    if (!range) {
      if (generation === requestGeneration.current) {
        setError(
          "Choose a date range whose end date is on or after its start date.",
        );
        setLoading(false);
      }
      return;
    }
    const request = { generation, mode, range, presence };
    if (activeLoad.current) {
      // A local collection owns one bounded scan at a time. Keep only the
      // newest range so quick date edits cannot send stale competing reads.
      queuedLoad.current = request;
      mode === "selection" ? setLoading(true) : setRefreshing(true);
      return;
    }
    activeLoad.current = true;
    let nextRequest: UsageLoad | null = request;
    while (nextRequest) {
      const refresh = nextRequest.mode !== "selection";
      refresh ? setRefreshing(true) : setLoading(true);
      const allowanceRequest = ++allowanceGeneration.current;
      void readCodexUsageAllowance(nextRequest.presence)
        .then((nextAllowance) => {
          if (allowanceRequest === allowanceGeneration.current) {
            setAllowance(nextAllowance);
            setAllowanceError(
              nextAllowance.status === "unavailable"
                ? (nextAllowance.reason ?? null)
                : null,
            );
          }
        })
        .catch((cause) => {
          if (allowanceRequest === allowanceGeneration.current) {
            setAllowance(null);
            setAllowanceError(
              cause instanceof Error ? cause.message : "Allowance is unavailable.",
            );
          }
        });
      try {
        const next = await readCodexUsage(nextRequest.presence, {
          ...nextRequest.range,
          grouping: "model",
          refresh,
        });
        if (nextRequest.generation === requestGeneration.current) {
          setSnapshot(next);
          setResumeRange(
            next.coverage.can_resume === true
              ? { start: next.range.start, end: next.range.end }
              : null,
          );
          setError(null);
        }
      } catch (cause) {
        if (nextRequest.generation === requestGeneration.current) {
          setError(
            cause instanceof CodexUsageCollectionBusyError
              ? "Another connected view is collecting usage. Try refresh again when that collection finishes."
              : cause instanceof Error
                ? cause.message
                : "Matrx Local could not provide usage right now.",
          );
        }
      }
      nextRequest = queuedLoad.current;
      queuedLoad.current = null;
    }
    activeLoad.current = false;
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    // Defer the proxy read out of the effect commit. `load` changes local UI
    // state when a reply arrives; starting it synchronously here violates the
    // React effect contract and causes a needless cascading render.
    const timer = window.setTimeout(() => void load("selection"), 0);
    return () => window.clearTimeout(timer);
  }, [preset, startDate, endDate, presence]);

  const activity = snapshot ? optionalActivity(snapshot.totals) : [];
  const canResume = snapshot?.coverage.can_resume === true;
  const isIncomplete = snapshot?.coverage.complete !== true;
  const completedCandidates = snapshot?.coverage.completed_candidates;
  const successfullyReadCandidates =
    snapshot?.coverage.successfully_read_candidates;
  const totalCandidates = snapshot?.coverage.total_candidates;
  const collectionProgress =
    typeof completedCandidates === "number" &&
    typeof totalCandidates === "number" &&
    totalCandidates > 0
      ? {
          completed: completedCandidates,
          total: totalCandidates,
          percent: Math.round((completedCandidates / totalCandidates) * 100),
        }
      : null;
  const collectedCount =
    typeof successfullyReadCandidates === "number"
      ? successfullyReadCandidates
      : null;
  const scopeRows = snapshot?.cells.filter((row) => {
    if (!scope) return false;
    if (scope.kind === "model")
      return (
        row.model === scope.model &&
        (scope.effort === undefined || row.effort === scope.effort)
      );
    if (scope.kind === "project") return row.project === scope.project;
    return row.conversation_id === scope.conversationId;
  });
  const scopeCredits = scopeRows?.some(
    (row) =>
      (row.response_count ?? 0) > 0 &&
      row.estimated_standard_credits == null,
  )
    ? null
    : scopeRows?.reduce(
        (total, row) => total + (row.estimated_standard_credits ?? 0),
        0,
      );
  const scopeResponses = scopeRows?.reduce(
    (total, row) => total + (row.response_count ?? 0),
    0,
  );
  const scopeShare =
    scopeCredits != null &&
    snapshot?.credits.estimated_standard != null &&
    snapshot.credits.estimated_standard > 0
      ? (scopeCredits / snapshot.credits.estimated_standard) * 100
      : null;
  const scopeTitle =
    scope?.kind === "model"
      ? `${scope.model ?? "Unknown model"}${scope.effort ? ` · ${scope.effort}` : ""}`
      : scope?.kind === "project"
        ? (scope.project ?? "Unknown project")
        : scopeRows?.[0]
          ? labelFor(scopeRows[0], "Unnamed conversation")
          : "Selected conversation";
  const coverageText = snapshot
    ? Object.entries(snapshot.coverage)
        .filter(
          ([, value]) =>
            typeof value === "boolean" || typeof value === "number",
        )
        .map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`)
        .join(" · ")
    : "";

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 pb-10 md:p-6">
      <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Laptop className="h-5 w-5 text-primary" aria-hidden />
            <h1 className="text-xl font-semibold tracking-tight">
              Codex usage
            </h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Local activity captured by Matrx Local. Cost is an estimated
            standard-credit scenario, not your measured Pro allowance debit.
          </p>
        </div>
        <div
          className={cn(
            "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
            presence
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
              : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400",
          )}
        >
          {presence ? (
            <Wifi className="h-4 w-4" aria-hidden />
          ) : (
            <WifiOff className="h-4 w-4" aria-hidden />
          )}
          <span>
            {presence
              ? `${presence.instanceName || "Matrx Local"} connected`
              : "Matrx Local is disconnected"}
          </span>
        </div>
      </header>

      <section className="flex flex-col gap-3 rounded-lg border bg-card p-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2" aria-label="Usage time range">
          {(
            [
              ["today", "Today"],
              ["yesterday", "Yesterday"],
              ["last-12-hours", "Last 12 hours"],
              ["custom", "Date range"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={preset === value ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setResumeRange(null);
                setPreset(value);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {preset === "custom" ? (
            <>
              <CalendarDays
                className="h-4 w-4 text-muted-foreground"
                aria-hidden
              />
              <input
                aria-label="Start date"
                type="date"
                value={startDate}
                max={endDate}
                onChange={(event) => {
                  setResumeRange(null);
                  setStartDate(event.target.value);
                }}
                className="h-8 rounded-md border bg-background px-2 text-xs"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                aria-label="End date"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(event) => {
                  setResumeRange(null);
                  setEndDate(event.target.value);
                }}
                className="h-8 rounded-md border bg-background px-2 text-xs"
              />
            </>
          ) : null}
          <select
            aria-label="Usage grouping"
            value={grouping}
            onChange={(event) =>
              setGrouping(event.target.value as CodexUsageGrouping)
            }
            className="h-8 rounded-md border bg-background px-2 text-xs"
          >
            <option value="model">By model</option>
            <option value="model_effort">By model and effort</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => void load("refresh")}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}{" "}
            Refresh
          </Button>
          {canResume ? (
            <Button
              size="sm"
              disabled={refreshing}
              onClick={() => void load("continue")}
            >
              Continue collection
            </Button>
          ) : null}
        </div>
      </section>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">
              {snapshot ? "Latest usage read failed" : "Usage is unavailable"}
            </p>
            <p className="mt-1">{error}</p>
            {snapshot ? (
              <p className="mt-1 text-xs">
                The displayed report remains {timestamp(snapshot.range.start)}{" "}
                to {timestamp(snapshot.range.end)} (end exclusive).
              </p>
            ) : null}
            <p className="mt-1 text-xs">
              Start Matrx Local and make sure it is signed in, then refresh this
              page.
            </p>
          </div>
          <ErrorAlchemyMenu className="ml-auto" />
        </div>
      ) : null}

      {loading && !error ? (
        <div className="flex min-h-52 items-center justify-center gap-2 rounded-lg border text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Reading
          sanitized activity from Matrx Local…
        </div>
      ) : null}

      {snapshot ? (
        <>
          {isIncomplete ? (
            <section className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-950 dark:text-amber-100">
              <p className="font-medium">Collection is partial</p>
              <p className="mt-1">
                {collectionProgress
                  ? `Processed ${collectionProgress.completed} of ${collectionProgress.total} candidates.`
                  : "The indexed candidate set was not fully collected."}{" "}
                {collectedCount != null
                  ? `${collectedCount} candidates were successfully read.`
                  : "Some candidates may be unreadable or missing."}{" "}
                All shares, totals, and rankings reflect only the successfully
                collected subset and may change.
              </p>
            </section>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <CountCard
              label="Estimated standard credits"
              value={estimatedCredits(snapshot.credits.estimated_standard)}
              detail="Scenario estimate; not allowance debits"
            />
            <CountCard
              label="Responses"
              value={metric(snapshot.totals.response_count)}
              detail="Captured responses in this range"
            />
            <CountCard
              label="Allowance windows"
              value={
                allowance?.status === "available"
                  ? metric(allowance.limits.length)
                  : "Unavailable"
              }
              detail="Read separately from the usage report"
            />
            <CountCard
              label="Conversations"
              value={metric(snapshot.conversations.length)}
              detail="Sanitized conversation rollups"
            />
            <CountCard
              label="Projects"
              value={metric(snapshot.projects.length)}
              detail="Projects represented in this range"
            />
          </div>

          <section className="rounded-lg border bg-muted/20 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-medium">Coverage and freshness</span>
                <p className="mt-1 text-xs text-muted-foreground">
                  Collected {timestamp(snapshot.collected_at)} · Range{" "}
                  {timestamp(snapshot.range.start)} to{" "}
                  {timestamp(snapshot.range.end)} (end exclusive)
                  {snapshot.indexed_at
                    ? ` · Index frozen ${timestamp(snapshot.indexed_at)}`
                    : ""}
                </p>
              </div>
              <Badge variant="outline">
                {allowance?.status === "available"
                  ? `Allowance observed ${timestamp(allowance.observed_at)}`
                  : "Allowance unavailable"}
              </Badge>
            </div>
            {coverageText ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {coverageText}
              </p>
            ) : null}
            {collectionProgress ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {collectionProgress.completed} of {collectionProgress.total}{" "}
                candidates processed ({collectionProgress.percent}%).
                {collectedCount != null
                  ? ` ${collectedCount} successfully read.`
                  : ""}
                {canResume
                  ? " Continue collection to keep this exact frozen range."
                  : ""}
              </p>
            ) : null}
            {allowance?.status === "available" ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {allowance.limits.map((limit) => (
                  <div
                    key={`${limit.bucket}-${limit.window_minutes ?? "unknown"}`}
                    className="rounded-md border bg-background p-3"
                  >
                    <p className="text-xs font-medium">{limit.bucket}</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">
                      {percentage(limit.remaining_percent)} remaining
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {limit.window_minutes != null
                        ? `${number.format(limit.window_minutes)} minute window`
                        : "Window duration unavailable"}
                      {limit.resets_at != null
                        ? ` · resets ${timestamp(new Date(limit.resets_at * 1000).toISOString())}`
                        : ""}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Allowance unavailable:{" "}
                {allowanceError ?? "Codex did not expose it."}
              </p>
            )}
          </section>

          {activity.length > 0 ? (
            <section className="grid gap-3 sm:grid-cols-2">
              <CountCard
                label={activity[0].label}
                value={metric(activity[0].value)}
                detail="Captured only when Local reports it"
              />
              {activity.slice(1).map((item) => (
                <CountCard
                  key={item.label}
                  label={item.label}
                  value={metric(item.value)}
                  detail="Captured only when Local reports it"
                />
              ))}
            </section>
          ) : null}

          {snapshot.activity ? (
            <section className="rounded-lg border bg-muted/20 p-4 text-sm">
              <p className="font-medium">Peer and child-agent activity</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {snapshot.activity.classification}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Peer counts are submitted peer-send expressions, not messages or
                confirmed delivery. Titles and recipient titles are only
                supplied through this authenticated owner connection.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <CountCard
                  label="Inbound peer wakes"
                  value={
                    typeof snapshot.activity.inbound_peer_wakes === "number"
                      ? metric(snapshot.activity.inbound_peer_wakes)
                      : "Unknown"
                  }
                  detail="No recipient provenance is inferred"
                />
                <CountCard
                  label="Causal cost"
                  value={
                    typeof snapshot.activity.causal_cost === "number"
                      ? estimatedCredits(snapshot.activity.causal_cost)
                      : "Unknown"
                  }
                  detail="Not inferred from nearby activity"
                />
              </div>
            </section>
          ) : null}

          {scope ? (
            <section className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Selected scope</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {scopeTitle}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setScope(null)}
                >
                  Clear selection
                </Button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <CountCard
                  label="Scope estimate"
                  value={estimatedCredits(scopeCredits)}
                  detail="Estimated standard credits in this selected scope"
                />
                <CountCard
                  label="Share of report"
                  value={
                    scopeShare == null
                      ? "Not available"
                      : percentage(scopeShare)
                  }
                  detail="Of the displayed report estimate"
                />
                <CountCard
                  label="Scope responses"
                  value={metric(scopeResponses)}
                  detail="Captured responses in this selected scope"
                />
              </div>
            </section>
          ) : null}

          <UsageTable
            title={
              grouping === "model" ? "Model usage" : "Model and effort usage"
            }
            rows={
              grouping === "model" ? snapshot.models : snapshot.model_effort
            }
            empty="No model activity was captured in this range."
            onSelect={(row) =>
              setScope({
                kind: "model",
                model: row.model ?? null,
                ...(grouping === "model_effort"
                  ? { effort: row.effort ?? null }
                  : {}),
              })
            }
            selected={(row) =>
              scope?.kind === "model" &&
              scope.model === (row.model ?? null) &&
              (scope.effort === undefined ||
                scope.effort === (row.effort ?? null))
            }
          />
          <UsageTable
            title="Projects"
            rows={snapshot.projects}
            empty="No project rollups were returned in this range."
            onSelect={(row) =>
              setScope({ kind: "project", project: row.project ?? null })
            }
            selected={(row) =>
              scope?.kind === "project" &&
              scope.project === (row.project ?? null)
            }
          />
          <UsageTable
            title="Conversations"
            rows={snapshot.conversations}
            empty="No conversation rollups were returned in this range."
            onSelect={(row) =>
              setScope({
                kind: "conversation",
                conversationId: row.conversation_id ?? null,
              })
            }
            selected={(row) =>
              scope?.kind === "conversation" &&
              scope.conversationId === (row.conversation_id ?? null)
            }
          />
          <UsageTable
            title="Workers"
            rows={snapshot.workers}
            empty="No worker rollups were returned in this range."
            onSelect={(row) =>
              setScope({
                kind: "worker",
                conversationId: row.conversation_id ?? null,
              })
            }
            selected={(row) =>
              scope?.kind === "worker" &&
              scope.conversationId === (row.conversation_id ?? null)
            }
          />
        </>
      ) : null}
    </main>
  );
}
