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

import { useState } from "react";
import { toast } from "sonner";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lightbulb,
  RefreshCw,
  Star,
  X,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/utils/cn";
import { extractErrorMessage } from "@/utils/errors";
import { useSuggestionsQuery } from "@/features/kg-suggestions/hooks/useSuggestionsQuery";
import { KgSuggestionRowItem } from "@/features/kg-suggestions/components/KgSuggestionRowItem";
import { SuggestionsFilterBar } from "./SuggestionsFilterBar";
import { SuggestionsTable } from "./SuggestionsTable";

export function SuggestionsManager() {
  const isMobile = useIsMobile();
  const {
    query,
    patchQuery,
    rows,
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

  // ── Content ────────────────────────────────────────────────────────────
  let content: React.ReactNode;
  if (loading && rows.length === 0) {
    content = (
      <div className="space-y-2 p-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
    );
  } else if (error) {
    content = (
      <div className="p-6 text-center text-sm text-destructive">
        Couldn&apos;t load suggestions: {error}
      </div>
    );
  } else if (rows.length === 0) {
    content = (
      <div className="py-16 text-center text-sm text-muted-foreground">
        <Lightbulb className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
        No suggestions match these filters.
      </div>
    );
  } else if (isMobile) {
    content = (
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
    content = (
      <div className="overflow-x-auto">
        <SuggestionsTable
          rows={rows}
          query={query}
          patchQuery={patchQuery}
          expandedId={expandedId}
          onToggleExpand={toggleExpand}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          accept={accept}
          reject={reject}
          defer={defer}
          star={star}
          restore={restore}
        />
      </div>
    );
  }

  return (
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

      <SuggestionsFilterBar query={query} patchQuery={patchQuery} rows={rows} />

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

      {/* Scroll body */}
      <div className="flex-1 min-h-0 overflow-y-auto">{content}</div>

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
