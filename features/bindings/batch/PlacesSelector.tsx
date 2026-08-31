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

import { useMemo, useState } from "react";
import { PencilLine, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";

export interface SelectablePlace {
  key: string;
  label: string;
  mandateKey: string;
  /** Whether the chosen rung already answers this job. */
  answeredHere: boolean;
  /** What the job declares, in words — the price, before the work. */
  priceLine: string;
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

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return places;
    return places.filter(
      (place) =>
        place.label.toLowerCase().includes(needle) ||
        place.mandateKey.toLowerCase().includes(needle),
    );
  }, [places, query]);

  const updates = visible.filter((p) => p.answeredHere);
  const adds = visible.filter((p) => !p.answeredHere);
  const allVisibleSelected =
    visible.length > 0 && visible.every((p) => selected.has(p.key));

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
              allVisibleSelected ? [] : visible.map((place) => place.key),
            )
          }
        >
          {allVisibleSelected ? "Clear these" : "Select these"}
        </Button>
      </div>

      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>
          {selected.size} in this batch · {visible.length} shown
        </span>
        {loading ? <span>Reading the jobs…</span> : null}
      </div>

      <div className="max-h-72 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            {loading
              ? "Reading the jobs…"
              : "No job matches that. Clear the search to see them all."}
          </div>
        ) : (
          <>
            {updates.length > 0 ? (
              <SectionLabel
                icon={PencilLine}
                label="This rung already answers"
                count={updates.length}
              />
            ) : null}
            <PlaceList
              places={updates}
              selected={selected}
              onToggle={onToggle}
            />
            {adds.length > 0 ? (
              <SectionLabel
                icon={Plus}
                label="No answer at this rung yet"
                count={adds.length}
              />
            ) : null}
            <PlaceList places={adds} selected={selected} onToggle={onToggle} />
          </>
        )}
      </div>
    </div>
  );
}

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
    <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-border bg-muted/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
      <Icon className="h-3 w-3" />
      {label}
      <span className="text-muted-foreground/70">· {count}</span>
    </div>
  );
}

function PlaceList({
  places,
  selected,
  onToggle,
}: {
  places: readonly SelectablePlace[];
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <ul className="divide-y divide-border/60">
      {places.map((place) => {
        const isSelected = selected.has(place.key);
        return (
          <li key={place.key}>
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
                "flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left outline-none transition-colors",
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
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {place.priceLine}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
