"use client";

/**
 * Choose the parts of one Source — search, never "show 50 more".
 *
 * Parts are the manifest's Segments (a page of a PDF, a chunk of a note). The
 * search box matches words (in a part's label and opening words here, and in its
 * full text on the server — `POST /sources/parts/search`), a page number ("12") or a page range
 * ("3-10"), through THE one matcher (`../partsSearch.ts`). "Choose all shown" /
 * "Clear shown" act on what the search shows, so "pages 40 to 80" is two
 * keystrokes and one click. Each part shows its opening words.
 */

import { useState } from "react";
import { Search } from "lucide-react";
import type { SourceRef } from "@ai-matrx/agents/sources";
import { Button, Input } from "@ai-matrx/design-system";
import { Checkbox } from "@/components/ui/checkbox";
import { formatChars } from "@/lib/tokens/estimate";
import { findParts, isWordQuery, type SourcePart } from "../partsSearch";
import { useSourcePartsSearch } from "../useSourcePartsText";

interface SourcePartsPickerProps {
  /** The Source whose parts these are — its text is read for a word search. */
  sourceRef: SourceRef;
  segments: SourcePart[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
}

export function SourcePartsPicker({ sourceRef, segments, selected, onChange }: SourcePartsPickerProps) {
  const [query, setQuery] = useState("");
  const words = isWordQuery(query);
  const partsText = useSourcePartsSearch(sourceRef, query);
  const chosen = new Set(selected);
  const shown = findParts(segments, query, partsText.matches);
  const chosenChars = segments.filter((s) => chosen.has(s.id)).reduce((n, s) => n + s.chars, 0);
  const hasPages = segments.some((s) => s.page !== undefined);

  // Keep the Source's own order so the model reads the parts in sequence.
  const commit = (next: Set<string>) => onChange(segments.filter((s) => next.has(s.id)).map((s) => s.id));

  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    commit(next);
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={hasPages ? "Search parts — words, a page (12) or pages (3-10)" : "Search parts by their words"}
          aria-label="Search parts"
          className="pl-8"
        />
      </div>
      {words && (partsText.reading || partsText.error || partsText.truncated) && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {partsText.error ??
            (partsText.reading
              ? "Searching inside the text…"
              : "More parts hold these words than can be listed — add a word to narrow the search.")}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {chosen.size} of {segments.length} parts chosen
          {chosen.size > 0 ? ` · ${formatChars(chosenChars)} characters` : ""}
        </span>
        <span className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={shown.length === 0}
            onClick={() => commit(new Set([...chosen, ...shown.map((s) => s.id)]))}
          >
            Choose all shown ({shown.length})
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={chosen.size === 0}
            onClick={() => {
              const next = new Set(chosen);
              for (const s of shown) next.delete(s.id);
              commit(next);
            }}
          >
            Clear shown
          </Button>
        </span>
      </div>

      <ul className="max-h-72 overflow-y-auto rounded-md border border-border divide-y divide-border">
        {shown.length === 0 && (
          <li className="px-3 py-4 text-center text-sm text-muted-foreground">
            {partsText.reading ? "Searching inside the text…" : `No part matches “${query}”.`}
          </li>
        )}
        {shown.map((segment) => (
          <li key={segment.id} className="[content-visibility:auto] [contain-intrinsic-size:auto_52px]">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-accent/50 sm:min-h-9">
              <Checkbox
                checked={chosen.has(segment.id)}
                onCheckedChange={() => toggle(segment.id)}
                aria-label={`Choose ${segment.label}`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">{segment.label}</span>
                {segment.preview && (
                  <span className="block truncate text-xs text-muted-foreground">{segment.preview}</span>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                {formatChars(segment.chars)}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
