// features/kg-suggestions/components/manager/SuggestionsManager.tsx
//
// The full-route suggestions manager: a power-user triage surface over every KG
// → scope suggestion the user has. Filter bar + dense sortable table (desktop)
// or stacked decision cards (mobile), server-side pagination, a stats summary,
// and bulk accept / defer / reject / star across the selection.
//
// All data + decisions come from `useSuggestionsQuery`. The single shared
// `KgSuggestionRowItem` is the expanded/mobile decision card, so the manager
// never forks the decision UX.

"use client";

import { useCallback, useState } from "react";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createKnowledgeScope } from "@/features/surfaces/manifests/knowledge.manifest";
import { toast } from "@/lib/toast";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lightbulb,
  Network,
  RefreshCw,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/utils/cn";
import { extractErrorMessage } from "@/utils/errors";
import { useSuggestionsQuery } from "@/features/kg-suggestions/hooks/useSuggestionsQuery";
import {
  KG_SUGGESTION_STAGE_FILTERS,
  KG_SUGGESTION_STATUSES,
} from "@/features/kg-suggestions/constants";
import type {
  KgSuggestionStage,
  KgSuggestionStatus,
  KgSuggestionsQuery,
} from "@/features/kg-suggestions/types";
import { KgSuggestionRowItem } from "@/features/kg-suggestions/components/KgSuggestionRowItem";
import {
  SourcePreviewProvider,
  useSourcePreviewController,
} from "@/features/kg-suggestions/components/source-preview/SourcePreviewContext";
import { SourcePreviewPanel } from "@/features/kg-suggestions/components/source-preview/SourcePreviewPanel";
import { SuggestionsFilterBar } from "./SuggestionsFilterBar";
import { SuggestionsTable } from "./SuggestionsTable";

export function SuggestionsManager() {
  const isMobile = useIsMobile();
  const {
    query,
    patchQuery,
    rows,
    heavyHitters,
    lowQuality,
    lowQualityTotal,
    sourceTitles,
    total,
    stats,
    loading,
    error,
    refresh,
    accept,
    reject,
    defer,
    star,
    restore,
  } = useSuggestionsQuery();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showLowQuality, setShowLowQuality] = useState(false);

  // Source preview floats in a non-blocking, resizable panel beside the table —
  // review the document a suggestion came from without losing your place.
  const { target, openPreview, closePreview } = useSourcePreviewController();

  const pageSize = query.pageSize ?? 50;
  const page = query.page ?? 0;
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const hasPrev = page > 0;
  const hasNext = (page + 1) * pageSize < total;

  const pendingCount = sumStats(stats, (s) => s.status === "pending");
  const deferredCount = sumStats(stats, (s) => s.status === "deferred");
  const starredCount = sumStats(stats, (s) => s.is_starred);

  const toggleExpand = (id: string) =>
    setExpandedId((cur) => (cur === id ? null : id));

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectAll = () =>
    setSelected((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)),
    );

  const clearSelection = () => setSelected(new Set());

  const runBulk = async (
    label: string,
    fn: (id: string) => Promise<unknown>,
  ) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const results = await Promise.allSettled(ids.map((id) => fn(id)));
    const failed = results.filter((r) => r.status === "rejected").length;
    clearSelection();
    if (failed === 0) toast.success(`${label} ${ids.length} suggestion(s)`);
    else toast.error(`${label}: ${ids.length - failed} done, ${failed} failed`);
  };

  const dismissAllLowQuality = async () => {
    const ids = lowQuality.map((r) => r.id);
    if (ids.length === 0) return;
    const results = await Promise.allSettled(ids.map((id) => reject(id)));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) toast.success(`Dismissed ${ids.length} low-quality`);
    else toast.error(`Dismissed ${ids.length - failed}, ${failed} failed`);
  };

  const hasHeavy = heavyHitters.length > 0;

  // Surface scope (matrx-user/knowledge) — the suggestion-queue half of the
  // Knowledge surface. Built at TRIGGER time from live state, never on mount.
  // The extraction and graph halves live on their own routes and emit
  // disjoint values.
  const getSurfaceScope = useCallback(
    () =>
      createKnowledgeScope({
        suggestions_total: total,
        suggestions_pending_count: pendingCount,
        suggestions_deferred_count: deferredCount,
        suggestions_starred_count: starredCount,
        suggestions_low_quality_count: lowQualityTotal,
        suggestions_query: query as unknown as Record<string, unknown>,
        suggestions_rows: [...rows, ...heavyHitters] as unknown as Array<
          Record<string, unknown>
        >,
        suggestions_stats: stats as unknown as Array<Record<string, unknown>>,
        focused_suggestion_id: expandedId ?? undefined,
        focused_suggestion: expandedId
          ? ([...rows, ...heavyHitters, ...lowQuality].find(
              (row) => row.id === expandedId,
            ) as unknown as Record<string, unknown> | undefined)
          : undefined,
        suggestions_selected_ids: [...selected],
      }),
    [
      total,
      pendingCount,
      deferredCount,
      starredCount,
      lowQualityTotal,
      query,
      rows,
      heavyHitters,
      lowQuality,
      stats,
      expandedId,
      selected,
    ],
  );

  // Low-quality (<50%) suggestions are pulled out of the main table and parked
  // in this collapsed, muted footer. The user can still see them and clear them
  // — we just signal loudly that we consider them weak.
  const lowQualitySection =
    lowQualityTotal > 0 ? (
      <div className="shrink-0 border-t border-border bg-muted/20">
        <div className="flex items-center gap-2 px-3 py-1.5">
          <button
            type="button"
            onClick={() => setShowLowQuality((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
            <span className="font-medium">
              {lowQualityTotal} low-quality{" "}
              {lowQualityTotal === 1 ? "suggestion" : "suggestions"}
            </span>
            <span className="hidden sm:inline text-muted-foreground/70">
              · below 50% confidence — usually noise
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 transition-transform",
                showLowQuality && "rotate-180",
              )}
            />
          </button>
          {showLowQuality ? (
            <button
              type="button"
              onClick={() => void dismissAllLowQuality()}
              className="inline-flex shrink-0 items-center gap-1 rounded border border-border bg-background px-2 py-0.5 text-[11px] text-destructive hover:bg-destructive/10 transition-colors"
            >
              <X className="h-3 w-3" />
              Dismiss all
            </button>
          ) : null}
        </div>
        {showLowQuality ? (
          <div className="px-3 pb-2 pb-safe sm:max-h-[40dvh] sm:overflow-auto">
            <div className="grid gap-2 opacity-70 lg:grid-cols-2 2xl:grid-cols-3">
              {lowQuality.map((row) => (
                <KgSuggestionRowItem
                  key={row.id}
                  row={row}
                  accept={accept}
                  reject={reject}
                  defer={defer}
                  compact
                />
              ))}
            </div>
            {lowQualityTotal > lowQuality.length ? (
              <p className="mt-2 text-center text-[10px] text-muted-foreground">
                Showing the {lowQuality.length} strongest of {lowQualityTotal}.
                Dismiss these or tighten your filters to see the rest.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    ) : null;

  // The prominent "heavy hitter" section — suggested NEW scopes. They lead the
  // page because the field suggestions below often depend on them.
  const heavySection = hasHeavy ? (
    <section className="border-b border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <Network className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
          Suggested scopes
        </h2>
        <span className="rounded-full bg-amber-500/20 px-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
          {heavyHitters.length}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Recurring entities the system thinks deserve their own scope. Decide
        these first — the field fills below attach to these scopes, so declining
        one can make its dependent suggestions moot.
      </p>
      <div className="mt-2 grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
        {heavyHitters.map((row) => (
          <KgSuggestionRowItem
            key={row.id}
            row={row}
            accept={accept}
            reject={reject}
            defer={defer}
          />
        ))}
      </div>
    </section>
  ) : null;

  // ── Main area (the "little stuff": field fills + plain links) ────────────
  let mainArea: React.ReactNode;
  if (loading && rows.length === 0 && !hasHeavy) {
    mainArea = (
      <div className="space-y-2 p-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
    );
  } else if (error) {
    mainArea = (
      <div className="p-6 text-center text-sm text-destructive">
        Couldn&apos;t load suggestions: {error}
      </div>
    );
  } else if (rows.length === 0) {
    mainArea = (
      <div className="py-12 text-center text-sm text-muted-foreground">
        <Lightbulb className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
        {hasHeavy
          ? "No field suggestions — just the scopes above."
          : "No suggestions match these filters."}
      </div>
    );
  } else if (isMobile) {
    mainArea = (
      <div className="space-y-2 p-3 pb-safe">
        {rows.map((row) => (
          <KgSuggestionRowItem
            key={row.id}
            row={row}
            accept={accept}
            reject={reject}
            defer={defer}
          />
        ))}
      </div>
    );
  } else {
    mainArea = (
      <SuggestionsTable
        rows={rows}
        query={query}
        patchQuery={patchQuery}
        expandedId={expandedId}
        onToggleExpand={toggleExpand}
        selected={selected}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        sourceTitles={sourceTitles}
        accept={accept}
        reject={reject}
        defer={defer}
        star={star}
        restore={restore}
      />
    );
  }

  // Surface write target (matrx-user/knowledge) — the SUGGESTIONS mount's one.
  // `mode: "ui"`, and it goes through the exact seam the user's own filter bar
  // uses: `patchQuery`. Deliberately absent, and it is the whole point of this
  // queue: accept / reject / defer / star, and the selection that arms the
  // bulk bar. A suggestion is a PROPOSAL; turning one into confirmed knowledge
  // stays a human decision.
  //
  // Row FOCUS (setExpandedId) was built here and removed: the only legal
  // inputs are ids inside `suggestions_rows`, which is bindable-only
  // (`autoContext: false`), so an agent in a normal turn can never see one.
  // See the manifest's writeTargets block for the full reasoning.
  const getWriteHandlers = useCallback(
    () => ({
      suggestions_filter: (value: unknown) => {
        if (
          typeof value !== "object" ||
          value === null ||
          Array.isArray(value)
        )
          throw new Error(
            "suggestions_filter expects an object with any subset of: search, statuses, stage, minConfidence, starredOnly, unseenOnly.",
          );
        const input = value as Record<string, unknown>;
        const accepted = [
          "search",
          "statuses",
          "stage",
          "minConfidence",
          "starredOnly",
          "unseenOnly",
        ];
        const unknownKeys = Object.keys(input).filter(
          (k) => !accepted.includes(k),
        );
        if (unknownKeys.length > 0)
          throw new Error(
            `suggestions_filter does not accept ${unknownKeys.join(", ")}. Accepted keys: ${accepted.join(", ")}. (Org / scope-type / scope / field / source filters and sorting stay with the user.)`,
          );
        if (Object.keys(input).length === 0)
          throw new Error(
            "suggestions_filter expects at least one of: search, statuses, stage, minConfidence, starredOnly, unseenOnly.",
          );

        const patch: Partial<KgSuggestionsQuery> = {};

        if ("search" in input) {
          if (input.search !== null && typeof input.search !== "string")
            throw new Error(
              "suggestions_filter.search expects a string or null (null clears it).",
            );
          patch.search = (input.search as string | null) || null;
        }
        if ("statuses" in input) {
          // Validate against the SAME constant the filter chips render from.
          const allowed = KG_SUGGESTION_STATUSES.map((s) => s.value);
          if (
            !Array.isArray(input.statuses) ||
            input.statuses.some(
              (s) =>
                typeof s !== "string" ||
                !allowed.includes(s as KgSuggestionStatus),
            )
          )
            throw new Error(
              `suggestions_filter.statuses expects an array over: ${allowed.join(" | ")} (an empty array means every status). It REPLACES the current set.`,
            );
          patch.statuses = input.statuses as KgSuggestionStatus[];
        }
        if ("stage" in input) {
          const allowed = KG_SUGGESTION_STAGE_FILTERS.map((s) => s.value);
          if (
            typeof input.stage !== "string" ||
            !allowed.includes(input.stage as KgSuggestionStage | "all")
          )
            throw new Error(
              `suggestions_filter.stage expects one of: ${allowed.join(" | ")}.`,
            );
          patch.stage = input.stage as KgSuggestionStage | "all";
        }
        if ("minConfidence" in input) {
          if (input.minConfidence !== null) {
            if (
              typeof input.minConfidence !== "number" ||
              !Number.isFinite(input.minConfidence) ||
              input.minConfidence < 0 ||
              input.minConfidence > 1
            )
              throw new Error(
                "suggestions_filter.minConfidence expects a number between 0 and 1 (e.g. 0.7 for ≥ 70%), or null for any confidence.",
              );
          }
          patch.minConfidence = input.minConfidence as number | null;
        }
        for (const flag of ["starredOnly", "unseenOnly"] as const) {
          if (flag in input) {
            if (typeof input[flag] !== "boolean")
              throw new Error(
                `suggestions_filter.${flag} expects a boolean.`,
              );
            patch[flag] = input[flag] as boolean;
          }
        }

        patchQuery(patch);
      },
    }),
    [patchQuery],
  );

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/knowledge"
      getScope={getSurfaceScope}
      getWriteHandlers={getWriteHandlers}
      isEditable={false}
    >
      <SourcePreviewProvider value={{ openPreview }}>
        <div className="flex h-full min-h-0 flex-col">
          {/* Summary strip */}
          <div className="flex items-center gap-3 border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              {pendingCount} pending
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3 text-amber-500" />
              {deferredCount} deferred
            </span>
            <span className="inline-flex items-center gap-1">
              <Star className="h-3 w-3 text-amber-500" />
              {starredCount} starred
            </span>
            <button
              type="button"
              onClick={refresh}
              className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground transition-colors"
            >
              <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
              Refresh
            </button>
          </div>

          <SuggestionsFilterBar
            query={query}
            patchQuery={patchQuery}
            rows={rows}
          />

          {/* Bulk action bar */}
          {selected.size > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-primary/5 px-3 py-1.5 text-[11px]">
              <span className="font-medium text-foreground">
                {selected.size} selected
              </span>
              <BulkButton
                icon={<Check className="h-3 w-3" />}
                label="Accept"
                className="text-success hover:bg-success/10"
                onClick={() =>
                  void runBulk("Accepted", (id) =>
                    accept(id).catch((e) => {
                      throw new Error(extractErrorMessage(e));
                    }),
                  )
                }
              />
              <BulkButton
                icon={<Clock className="h-3 w-3" />}
                label="Defer"
                className="text-muted-foreground hover:bg-accent"
                onClick={() => void runBulk("Deferred", (id) => defer(id))}
              />
              <BulkButton
                icon={<X className="h-3 w-3" />}
                label="Reject"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => void runBulk("Rejected", (id) => reject(id))}
              />
              <BulkButton
                icon={<Star className="h-3 w-3" />}
                label="Star"
                className="text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                onClick={() => void runBulk("Starred", (id) => star(id, true))}
              />
              <button
                type="button"
                onClick={clearSelection}
                className="ml-1 rounded px-2 py-0.5 text-muted-foreground hover:bg-accent transition-colors"
              >
                Clear
              </button>
            </div>
          ) : null}

          {/* Scroll body — heavy hitters lead; the table owns the vertical scroll so
          its header stays sticky. On mobile everything shares one scroll area. */}
          {isMobile ? (
            <div className="flex-1 min-h-0 overflow-auto">
              {heavySection}
              {mainArea}
              {lowQualitySection}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              {hasHeavy ? (
                <div className="max-h-[45%] shrink-0 overflow-y-auto">
                  {heavySection}
                </div>
              ) : null}
              <div className="min-h-0 flex-1 overflow-auto">{mainArea}</div>
              {lowQualitySection}
            </div>
          )}

          {/* Pagination footer */}
          <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground pb-safe">
            <span className="tabular-nums">
              {from}–{to} of {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={!hasPrev}
                onClick={() => patchQuery({ page: page - 1 })}
                className="inline-flex items-center gap-0.5 rounded px-2 py-1 hover:bg-accent disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </button>
              <button
                type="button"
                disabled={!hasNext}
                onClick={() => patchQuery({ page: page + 1 })}
                className="inline-flex items-center gap-0.5 rounded px-2 py-1 hover:bg-accent disabled:opacity-40 transition-colors"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
        <SourcePreviewPanel
          target={target}
          onClose={closePreview}
          position="right"
        />
      </SourcePreviewProvider>
    </SurfaceRuntimeProvider>
  );
}

function BulkButton({
  icon,
  label,
  className,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-0.5 transition-colors",
        className,
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function sumStats(
  stats: { status: string; is_starred: boolean; n: number }[],
  pred: (s: { status: string; is_starred: boolean }) => boolean,
): number {
  return stats.reduce((acc, s) => (pred(s) ? acc + s.n : acc), 0);
}

export default SuggestionsManager;
