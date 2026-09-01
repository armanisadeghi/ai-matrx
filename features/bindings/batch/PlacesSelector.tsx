"use client";

// features/bindings/batch/PlacesSelector.tsx
//
// WHICH PLACES ARE IN THE BATCH — and what each one will cost before it is
// picked (P17's "the picker prices the work before you commit to it").
//
// Every row says three things a person needs BEFORE selecting it: whether this
// rung already answers that job (so "Apply" never surprises anyone with an
// overwrite), how much the job describes (so you can see which places can
// actually feed this holder), and the job's own key. The shortcut batch
// selector shows a surface's declared-value count for the same reason.
//
// The list is VIRTUALISED with @tanstack/react-virtual — the repo's one
// virtualiser (ChunksPane, FileTree, AdminAuditTable). An org with hundreds of
// jobs renders hundreds of rows here, and rendering them all wedged the picker
// hard enough that scrolling stopped answering. Only the visible rows mount;
// the counts on screen stay the true totals.

import { useMemo, useRef, useState } from "react";
import { PencilLine, Plus, Search } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import {
  applyBulkSelection,
  bulkSelectionLabel,
} from "@/features/bindings/batch/batch-model";

export interface SelectablePlace {
  key: string;
  label: string;
  mandateKey: string;
  /** Whether the chosen rung already answers this job. */
  answeredHere: boolean;
  /** What the job declares, in words — the price, before the work. PROSE ONLY:
   * 🚨 W10-2 — this used to read `provision seo_page_writer`, a raw snake_case
   * slug in a plain muted span, one line under the mono chip that carries the
   * job's own key correctly. Slugs live in mono chips; prose speaks labels. */
  priceLine: string;
  /** The provision's key, when there is one — rendered as its own mono chip. */
  priceSlug?: string | null;
  /** Set when this holder cannot fulfil this job (the requirement gate). */
  blocked: string | null;
}

export function PlacesSelector({
  places,
  selected,
  loading,
  onToggle,
  onSetSelection,
}: {
  places: readonly SelectablePlace[];
  selected: ReadonlySet<string>;
  loading: boolean;
  onToggle: (key: string) => void;
  onSetSelection: (keys: readonly string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const needle = query.trim().toLowerCase();
  const filtered = needle.length > 0;

  const visible = useMemo(() => {
    if (!needle) return places;
    return places.filter(
      (place) =>
        place.label.toLowerCase().includes(needle) ||
        place.mandateKey.toLowerCase().includes(needle),
    );
  }, [places, needle]);

  const updates = visible.filter((p) => p.answeredHere);
  const adds = visible.filter((p) => !p.answeredHere);
  const allVisibleSelected =
    visible.length > 0 && visible.every((p) => selected.has(p.key));

  // One flat row list — the two group headings ride in the same virtual
  // stream as their rows, so a group of 600 costs the same as a group of 6.
  const rows: PickerRow[] = [];
  if (updates.length > 0) {
    rows.push({
      kind: "heading",
      id: "h:updates",
      icon: PencilLine,
      label: "This rung already answers",
      count: updates.length,
    });
    for (const place of updates) rows.push({ kind: "place", id: place.key, place });
  }
  if (adds.length > 0) {
    rows.push({
      kind: "heading",
      id: "h:adds",
      icon: Plus,
      label: "No answer at this rung yet",
      count: adds.length,
    });
    for (const place of adds) rows.push({ kind: "place", id: place.key, place });
  }

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (rows[index]?.kind === "heading" ? 25 : 53),
    overscan: 10,
  });

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search jobs by name or key…"
            className="h-8 pl-8 text-sm"
            style={{ fontSize: "16px" }}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          disabled={loading || visible.length === 0}
          onClick={() =>
            onSetSelection(
              applyBulkSelection({
                selected: [...selected],
                matchingKeys: visible.map((place) => place.key),
                add: !allVisibleSelected,
              }),
            )
          }
        >
          {bulkSelectionLabel({
            matching: visible.length,
            filtered,
            allMatchingSelected: allVisibleSelected,
          })}
        </Button>
      </div>

      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>
          {selected.size} in this batch ·{" "}
          {filtered
            ? `${visible.length} of ${places.length} jobs match`
            : `${places.length} ${places.length === 1 ? "job" : "jobs"}`}
        </span>
        {loading ? <span>Reading the jobs…</span> : null}
      </div>

      <div ref={scrollRef} className="max-h-72 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            {loading
              ? "Reading the jobs…"
              : "No job matches that. Clear the search to see them all."}
          </div>
        ) : (
          <div
            style={{ height: virtualizer.getTotalSize(), position: "relative" }}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              return (
                <div
                  key={row.id}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  className="absolute left-0 right-0"
                  style={{ top: item.start }}
                >
                  {row.kind === "heading" ? (
                    <SectionLabel
                      icon={row.icon}
                      label={row.label}
                      count={row.count}
                    />
                  ) : (
                    <PlaceRowItem
                      place={row.place}
                      isSelected={selected.has(row.place.key)}
                      onToggle={onToggle}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

type PickerRow =
  | {
      kind: "heading";
      id: string;
      icon: React.ComponentType<{ className?: string }>;
      label: string;
      count: number;
    }
  | { kind: "place"; id: string; place: SelectablePlace };

function SectionLabel({
  icon: Icon,
  label,
  count,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-1.5 border-b border-border bg-muted/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3 w-3" />
      {label}
      <span className="text-muted-foreground/70">· {count}</span>
    </div>
  );
}

function PlaceRowItem({
  place,
  isSelected,
  onToggle,
}: {
  place: SelectablePlace;
  isSelected: boolean;
  onToggle: (key: string) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={() => onToggle(place.key)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle(place.key);
        }
      }}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2.5 border-b border-border/60 px-3 py-2 text-left outline-none transition-colors",
        isSelected ? "bg-primary/5" : "hover:bg-accent/50",
        "focus-visible:ring-1 focus-visible:ring-primary",
      )}
    >
      <Checkbox checked={isSelected} className="pointer-events-none" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">
            {place.label}
          </span>
          {place.answeredHere ? (
            <span className="inline-flex h-4 shrink-0 items-center rounded border border-amber-300/60 bg-amber-500/10 px-1 text-[9px] font-medium text-amber-600 dark:border-amber-800 dark:text-amber-400">
              answered here — this replaces it
            </span>
          ) : null}
        </div>
        <div className="truncate font-mono text-[11px] text-muted-foreground">
          {place.mandateKey}
        </div>
        {place.blocked ? (
          <p className="text-[11px] leading-snug text-destructive">
            {place.blocked}
          </p>
        ) : null}
      </div>
      <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
        {place.priceLine}
        {place.priceSlug ? (
          <code className="rounded bg-muted px-1 py-px font-mono text-[10px] text-muted-foreground">
            {place.priceSlug}
          </code>
        ) : null}
      </span>
    </div>
  );
}
