"use client";

/**
 * KI-016 — the SITUATIONAL REFRESH engine's body in the run console.
 *
 * Same console, same tier prop, same Schedule tab, same cascade — a different
 * ENGINE. What differs is only what "owed work" means: topic placement counts
 * keywords with no offering, a refresh counts segments whose as-of has aged
 * past `seo.situational_stamps.stale_after_hours`.
 *
 * WHY THIS IS NOT THE PLACEMENT BODY WITH IF-STATEMENTS. Every column, every
 * result row and every right-hand tab in the placement body is about keywords
 * and offerings; none of it means anything here. Bending one body around two
 * engines would have produced a screen where half the columns are always "—".
 * The SHELL (`RunConsole`) is what is shared, and it is shared entirely: the
 * brand list read, the knob read, the schedule panel, the tier prop.
 *
 * WHY THERE IS NO LIVE-RUN WINDOW. The engine is one database function — pure
 * SQL, zero AI spend, seconds not minutes. There is no model thinking out loud
 * to watch, so a floating window would be an empty box. The banned pattern is a
 * spinner over a multi-minute paid pass; this is neither.
 */

import { useState, type ReactNode } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Clock,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/lib/toast";
import { cn } from "@/styles/themes/utils";
import { formatCount } from "@/features/marketing/search-console/types";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { useSurfaceRuntimeRegistration } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import { getSituationalRefreshStatus, runSituationalRefresh } from "./data";
import type { RunConsoleLiveState } from "./run-console-scope";
import type {
  ConsoleSiteRow,
  SituationalRefreshStatus,
  SituationalRunOutcome,
} from "./types";

/** "3 hours ago" / "never" — an as-of only means something as an age. */
function age(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))} min ago`;
  if (hours < 48) return `${Math.round(hours)} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

interface SituationalRow {
  site: ConsoleSiteRow;
  isLoading: boolean;
  isError: boolean;
  status: SituationalRefreshStatus | undefined;
}

function useSituationalRows(sites: ConsoleSiteRow[]): SituationalRow[] {
  const queries = useQueries({
    queries: sites.map((site) => ({
      queryKey: ["seo", "situational", "refresh-status", site.id],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getSituationalRefreshStatus(site.id, signal),
      staleTime: 30 * 1000,
    })),
  });
  return sites.map((site, index) => ({
    site,
    isLoading: queries[index]?.isLoading ?? false,
    isError: queries[index]?.isError ?? false,
    status: queries[index]?.data,
  }));
}

export function SituationalRefreshConsole({
  sites,
  sitesLoading,
  sitesError,
  selected,
  onSelectedChange,
  schedulePanel,
  surfaceName,
  buildScope,
}: {
  sites: ConsoleSiteRow[];
  sitesLoading: boolean;
  sitesError: boolean;
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
  /** The surface this mount emits — the tier decides it (KI-049). */
  surfaceName: string;
  /**
   * The shell's half of the scope, closed over. This body owns the run state
   * and the per-brand situational standing; handing a builder DOWN is what
   * keeps that state where it lives instead of lifting it into the shell just
   * to satisfy a provider.
   */
  buildScope: (live: RunConsoleLiveState) => SurfaceScopePayload;
  /**
   * The tier's schedule editor, built by the shell so BOTH engines author
   * their cadence through the one `ScheduleCascadePanel` and the one cascade.
   */
  schedulePanel: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [outcomes, setOutcomes] = useState<SituationalRunOutcome[]>([]);

  const rows = useSituationalRows(sites);
  const byId = new Map(sites.map((site) => [site.id, site]));

  // THE EMITTER for this engine's tab. `getScope` runs at trigger time and
  // reads these closures fresh (the hook holds it in a ref).
  useSurfaceRuntimeRegistration({
    surfaceName,
    getScope: () =>
      buildScope({
        selectedSiteIds: selected,
        situationalStatus: rows
          .map((row) => row.status)
          .filter((status): status is SituationalRefreshStatus => !!status),
        isRunning: running,
        queueLength: queue.length,
        outcomes,
      }),
  });

  /**
   * Drain one brand at a time. The pass is cheap but it is still a bounded
   * write loop against one statement-timeout budget — running eight brands at
   * once is how a fleet press turns into eight timeouts.
   */
  const startRun = async (siteIds: string[]) => {
    if (siteIds.length === 0 || running) return;
    setRunning(true);
    setOutcomes([]);
    setQueue(siteIds);
    toast.success(
      `Refreshing situational segments on ${siteIds.length} brand${siteIds.length === 1 ? "" : "s"}`,
      { description: "Re-working out every segment against the current window." },
    );
    for (const siteId of siteIds) {
      const site = byId.get(siteId);
      if (!site) continue;
      const outcome = await runSituationalRefresh(site);
      setOutcomes((current) => [outcome, ...current]);
      setQueue((current) => current.filter((id) => id !== siteId));
      if (outcome.error) toast.error(outcome.error);
      void queryClient.invalidateQueries({
        queryKey: ["seo", "situational", "refresh-status", siteId],
      });
    }
    void queryClient.invalidateQueries({ queryKey: ["seo", "dimensions"] });
    void queryClient.invalidateQueries({ queryKey: ["marketing", "gsc"] });
    setRunning(false);
  };

  const columns: MatrxColumnDef<SituationalRow>[] = [
    {
      id: "brand",
      header: "Brand",
      accessorFn: (r) => r.site.name,
      cell: (r) => (
        <div>
          <div className="truncate text-xs font-medium text-foreground">
            {r.site.name}
          </div>
          <div className="truncate text-[10px] text-muted-foreground">
            {r.site.domain}
          </div>
        </div>
      ),
    },
    {
      id: "segments",
      header: "Segments",
      align: "right",
      accessorFn: (r) => r.status?.matchers ?? -1,
      cell: (r) => {
        if (r.isLoading)
          return <span className="text-[10px] text-muted-foreground">reading…</span>;
        if (r.isError)
          return (
            <span className="inline-flex items-center gap-1 text-[10px] text-warning">
              <AlertTriangle className="h-3 w-3" /> unreadable
            </span>
          );
        return (
          <span className="tabular-nums text-foreground">
            {formatCount(r.status?.matchers ?? 0)}
          </span>
        );
      },
    },
    {
      id: "stale",
      header: "Past their as-of",
      align: "right",
      accessorFn: (r) => r.status?.stale_matchers ?? -1,
      cell: (r) =>
        r.status && r.status.stale_matchers > 0 ? (
          <span
            className="inline-flex items-center gap-1 tabular-nums text-warning"
            title={`Older than ${r.status.stale_after_hours} hours`}
          >
            <Clock className="h-3 w-3" />
            {formatCount(r.status.stale_matchers)}
          </span>
        ) : (
          <span className="tabular-nums text-muted-foreground">0</span>
        ),
    },
    {
      id: "oldest",
      header: "Oldest as-of",
      accessorFn: (r) =>
        r.status?.oldest_evaluated_at
          ? new Date(r.status.oldest_evaluated_at).getTime()
          : 0,
      cell: (r) => (
        <span
          className={cn(
            "text-[11px] tabular-nums",
            r.status && r.status.stale_matchers > 0
              ? "text-warning"
              : "text-muted-foreground",
          )}
        >
          {r.status?.matchers ? age(r.status.oldest_evaluated_at) : "—"}
        </span>
      ),
    },
    {
      id: "stamps",
      header: "Stamps held",
      align: "right",
      accessorFn: (r) => r.status?.stamps ?? -1,
      cell: (r) => (
        <span className="tabular-nums text-muted-foreground">
          {formatCount(r.status?.stamps ?? 0)}
        </span>
      ),
    },
    {
      id: "autonomy",
      header: "AI may",
      accessorFn: (r) => r.status?.autonomy?.mode ?? "",
      cell: (r) => {
        const verdict = r.status?.autonomy;
        if (!verdict) return <span className="text-[10px] text-muted-foreground">—</span>;
        if (verdict.decision === "apply")
          return (
            <span className="inline-flex items-center gap-1 text-[10px] text-success">
              <ShieldCheck className="h-3 w-3" /> apply
            </span>
          );
        if (verdict.decision === "off")
          return (
            <span className="rounded border border-border px-1 py-px text-[10px] text-muted-foreground">
              off
            </span>
          );
        return (
          <span className="inline-flex items-center gap-1 text-[10px] text-warning">
            <UserCheck className="h-3 w-3" /> propose
          </span>
        );
      },
    },
    {
      id: "run",
      header: "",
      sortable: false,
      filter: false,
      compact: true,
      width: 40,
      cell: (r) => (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[10px]"
          disabled={running}
          onClick={(event) => {
            event.stopPropagation();
            void startRun([r.site.id]);
          }}
          title={`Refresh ${r.site.name}'s situational segments`}
        >
          <Play className="h-3 w-3" />
        </Button>
      ),
    },
  ];

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-12">
      <section className="flex min-h-0 flex-col rounded-lg border border-border bg-card lg:col-span-7">
        <Tabs defaultValue="brands" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="h-8 shrink-0 justify-start rounded-none border-b border-border bg-transparent px-1">
            <TabsTrigger value="brands" className="h-6 text-xs">
              Brands
            </TabsTrigger>
            <TabsTrigger value="schedule" className="h-6 text-xs">
              Schedule
            </TabsTrigger>
          </TabsList>

          <TabsContent value="schedule" className="m-0 flex min-h-0 flex-1 flex-col">
            {schedulePanel}
          </TabsContent>

          <TabsContent value="brands" className="m-0 flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[10px]"
            onClick={() =>
              onSelectedChange(
                selected.length === sites.length ? [] : sites.map((s) => s.id),
              )
            }
          >
            {selected.length === sites.length && sites.length > 0 ? "None" : "All"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-1.5"
            title="Re-read how stale each brand is"
            onClick={() =>
              void queryClient.invalidateQueries({
                queryKey: ["seo", "situational", "refresh-status"],
              })
            }
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            className="ml-auto h-7 gap-1 text-xs"
            disabled={running || selected.length === 0}
            onClick={() => void startRun(selected)}
          >
            {running ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            {running
              ? queue.length > 0
                ? `Refreshing… ${queue.length} left`
                : "Refreshing…"
              : `Run now (${selected.length})`}
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {sitesError ? (
            <p className="p-3 text-xs text-destructive">
              Could not read the brand list.
            </p>
          ) : (
            <MatrxDataTable<SituationalRow>
              data={rows}
              columns={columns}
              getRowId={(r) => r.site.id}
              isLoading={sitesLoading}
              toolbar={{ search: true, searchPlaceholder: "Find a brand" }}
              selection={{
                selectedIds: selected,
                onSelectedIdsChange: onSelectedChange,
                noun: "brand",
              }}
              pageSize={0}
              zebra
              emptyState={{ title: "No brands match your search." }}
              className="h-full"
            />
          )}
        </div>
          </TabsContent>
        </Tabs>
      </section>

      <section className="flex min-h-0 flex-col overflow-y-auto rounded-lg border border-border bg-card p-2 lg:col-span-5">
        <h2 className="mb-1.5 text-xs font-semibold text-foreground">This run</h2>
        {outcomes.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Pick one or more brands and press Run now. Each pass re-works out
            every segment against the current window: new matches gain a fresh
            as-of, keywords that stopped matching are released, and anything a
            person pinned is left alone.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {outcomes.map((outcome) => (
              <li
                key={`${outcome.siteId}-${outcome.finishedAt}`}
                className={cn(
                  "rounded-md border px-2.5 py-1.5",
                  outcome.error
                    ? "border-destructive/50 bg-destructive/10"
                    : "border-border bg-muted/30",
                )}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {outcome.error ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  ) : (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                  <span className="text-xs font-medium text-foreground">
                    {outcome.siteName}
                  </span>
                  {outcome.error ? null : outcome.refusal ? (
                    // AUTONOMY SAID NO — and a human reads exactly why, here,
                    // rather than reading a green tick over a pass that wrote
                    // nothing (KI-044).
                    <span className="text-[11px] text-warning">
                      {outcome.refusal}
                    </span>
                  ) : outcome.matchers === 0 ? (
                    <span className="text-[11px] text-muted-foreground">
                      nothing to refresh — this brand has no saved segments yet
                    </span>
                  ) : (
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {formatCount(outcome.matchers)} segment
                      {outcome.matchers === 1 ? "" : "s"} · stamped{" "}
                      {formatCount(outcome.stamped)} · released{" "}
                      {formatCount(outcome.removed)}
                    </span>
                  )}
                  {outcome.proposals > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded border border-warning/50 bg-warning/10 px-1 py-px text-[10px] tabular-nums text-warning">
                      <UserCheck className="h-3 w-3" />
                      {formatCount(outcome.proposals)} waiting in Approvals
                    </span>
                  ) : null}
                  {outcome.timeoutApplied > 0 ? (
                    <span className="rounded border border-border px-1 py-px text-[10px] tabular-nums text-muted-foreground">
                      {formatCount(outcome.timeoutApplied)} applied after the wait
                    </span>
                  ) : null}
                  {outcome.remaining > 0 ? (
                    <span className="rounded border border-warning/50 px-1 py-px text-[10px] tabular-nums text-warning">
                      {formatCount(outcome.remaining)} still filling
                    </span>
                  ) : null}
                  {outcome.window ? (
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {outcome.window.start} → {outcome.window.end}
                    </span>
                  ) : null}
                </div>
                {outcome.error ? (
                  <p className="mt-0.5 text-[10px] text-destructive">
                    {outcome.error}
                  </p>
                ) : null}
                {outcome.segments.length > 0 ? (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {outcome.segments.map((segment) => (
                      <li
                        key={segment.matcherId}
                        className="flex flex-wrap items-baseline gap-x-2 text-[10px] text-muted-foreground"
                      >
                        <span className="text-foreground">{segment.rule}</span>
                        <span>
                          {segment.dimension} → {segment.value}
                        </span>
                        {segment.error ? (
                          <span className="text-destructive">
                            {segment.error}
                          </span>
                        ) : (
                          <span className="tabular-nums">
                            matched {formatCount(segment.matched)}
                            {segment.proposed > 0
                              ? ` · proposed ${formatCount(segment.proposed)}`
                              : ` · stamped ${formatCount(segment.stamped)} · released ${formatCount(segment.removed)}`}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
