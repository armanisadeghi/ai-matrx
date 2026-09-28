"use client";

/**
 * The Transcripts view's own facets in the hub (H6d) — Type, Status, Folders,
 * Visibility, Tags, Scope — the retired list's filters, over the loaded rows'
 * own fields. Linear's filter pills: each facet is a menu of values with
 * counts; a chosen facet says its value in the pill and carries its own ×.
 * Carried in the address as `g.<facet>=a,b`.
 */

import { ChevronDown, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/utils/cn";
import {
  TRANSCRIPT_FACETS,
  TRANSCRIPT_FACET_LABEL,
  facetValueLabel,
  type TranscriptFacet,
  type TranscriptFacetSelection,
} from "./transcriptRows";

export function TranscriptFacetBar({
  counts,
  selection,
  onChange,
  note,
  ready = true,
}: {
  counts: Record<TranscriptFacet, { value: string; count: number }[]>;
  selection: TranscriptFacetSelection;
  onChange: (next: TranscriptFacetSelection) => void;
  /** e.g. "Facets narrow the 50 rows loaded so far; load more to check the rest." */
  note?: string | null;
  /**
   * The rows' own fields have been read. Until then every facet shows (its menu
   * says it is still reading); after, a facet whose loaded rows all share one
   * value (or none) is absent — it could narrow nothing — unless it is chosen.
   */
  ready?: boolean;
}) {
  const toggle = (facet: TranscriptFacet, value: string) => {
    const cur = selection[facet] ?? [];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    onChange({ ...selection, [facet]: next });
  };
  const clear = (facet: TranscriptFacet) => onChange({ ...selection, [facet]: [] });
  // A facet with one value across every loaded row cannot narrow anything; it stays only when chosen.
  const shown = TRANSCRIPT_FACETS.filter((f) => {
    const chosen = selection[f]?.length ?? 0;
    if (chosen) return true;
    if (!ready) return true;
    return (counts[f]?.length ?? 0) > 1;
  });
  if (!shown.length && !note) return null;
  return (
    <div
      className="-mx-1 flex min-w-0 items-center gap-1.5 overflow-x-auto px-1 text-xs scrollbar-hide md:flex-wrap md:overflow-visible"
      role="group"
      aria-label="Transcript filters"
    >
      {shown.map((f) => {
        const values = counts[f] ?? [];
        const picked = selection[f] ?? [];
        const label = TRANSCRIPT_FACET_LABEL[f];
        const summary =
          picked.length === 1 ? facetValueLabel(f, picked[0]) : picked.length > 1 ? `${picked.length} selected` : null;
        return (
          <div
            key={f}
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-md border md:h-7",
              summary ? "border-primary/30 bg-primary/10 text-foreground" : "border-dashed border-border text-muted-foreground",
            )}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-full items-center gap-1 rounded-md px-2.5 hover:text-foreground",
                    !summary && "hover:bg-muted",
                  )}
                  aria-label={summary ? `${label}: ${summary}. Change` : `Filter by ${label}`}
                >
                  <span className={summary ? "text-muted-foreground" : undefined}>{label}</span>
                  {summary ? <span className="max-w-40 truncate font-medium">{summary}</span> : null}
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
                <DropdownMenuLabel className="text-xs">{label}</DropdownMenuLabel>
                {values.length ? (
                  values.map(({ value, count }) => (
                    <DropdownMenuCheckboxItem
                      key={value}
                      checked={picked.includes(value)}
                      onCheckedChange={() => toggle(f, value)}
                      onSelect={(e) => e.preventDefault()}
                      className="text-xs"
                    >
                      <span className="min-w-0 flex-1 truncate">{facetValueLabel(f, value)}</span>
                      <span className="ml-2 tabular-nums text-muted-foreground">{count}</span>
                    </DropdownMenuCheckboxItem>
                  ))
                ) : (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">
                    {ready ? "No values among the rows loaded so far." : `Reading each transcript's ${label.toLowerCase()}…`}
                  </p>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {summary ? (
              <button
                type="button"
                onClick={() => clear(f)}
                className="inline-flex h-full items-center rounded-r-md border-l border-primary/20 px-1.5 text-muted-foreground hover:bg-primary/15 hover:text-foreground"
                aria-label={`Remove the ${label} filter`}
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        );
      })}
      {note ? <span className="shrink-0 text-muted-foreground">{note}</span> : null}
    </div>
  );
}
