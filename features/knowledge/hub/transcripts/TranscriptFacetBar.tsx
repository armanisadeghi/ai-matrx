"use client";

/**
 * The Transcripts view's own facets in the hub (H6d) — Type, Status, Folders,
 * Visibility, Tags, Scope — the retired list's filters, over the loaded rows'
 * own fields. Each facet is a menu of values with counts; chosen values show
 * as removable chips. Carried in the address as `g.<facet>=a,b`.
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
}: {
  counts: Record<TranscriptFacet, { value: string; count: number }[]>;
  selection: TranscriptFacetSelection;
  onChange: (next: TranscriptFacetSelection) => void;
  /** e.g. "Facets narrow the 50 rows loaded so far; load more to check the rest." */
  note?: string | null;
}) {
  const toggle = (facet: TranscriptFacet, value: string) => {
    const cur = selection[facet] ?? [];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    onChange({ ...selection, [facet]: next });
  };
  const chips = TRANSCRIPT_FACETS.flatMap((f) => (selection[f] ?? []).map((v) => ({ f, v })));
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs" role="group" aria-label="Transcript filters">
      {TRANSCRIPT_FACETS.map((f) => {
        const values = counts[f] ?? [];
        const chosen = selection[f]?.length ?? 0;
        return (
          <DropdownMenu key={f}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 hover:bg-accent",
                  chosen ? "bg-accent font-medium" : "text-muted-foreground",
                )}
              >
                {TRANSCRIPT_FACET_LABEL[f]}
                {chosen ? <span className="tabular-nums">· {chosen}</span> : null}
                <ChevronDown className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
              <DropdownMenuLabel className="text-xs">{TRANSCRIPT_FACET_LABEL[f]}</DropdownMenuLabel>
              {values.length ? (
                values.map(({ value, count }) => (
                  <DropdownMenuCheckboxItem
                    key={value}
                    checked={(selection[f] ?? []).includes(value)}
                    onCheckedChange={() => toggle(f, value)}
                    onSelect={(e) => e.preventDefault()}
                    className="text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate">{facetValueLabel(f, value)}</span>
                    <span className="ml-2 tabular-nums text-muted-foreground">{count}</span>
                  </DropdownMenuCheckboxItem>
                ))
              ) : (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">No values among the rows loaded so far.</p>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
      {chips.map(({ f, v }) => (
        <button
          key={`${f}:${v}`}
          type="button"
          onClick={() => toggle(f, v)}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 hover:bg-accent"
          aria-label={`Remove the ${TRANSCRIPT_FACET_LABEL[f]} filter ${facetValueLabel(f, v)}`}
        >
          {TRANSCRIPT_FACET_LABEL[f]}: {facetValueLabel(f, v)} <X className="h-3 w-3" />
        </button>
      ))}
      {note ? <span className="text-muted-foreground">{note}</span> : null}
    </div>
  );
}
