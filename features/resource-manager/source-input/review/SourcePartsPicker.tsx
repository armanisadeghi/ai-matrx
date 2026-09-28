"use client";

/**
 * Choose the parts of one Source — search, never "show 50 more".
 *
 * Parts are the manifest's Segments (a page of a PDF, a chunk of a note). The
 * search box matches a part's label, a page number ("12") or a page range
 * ("3-10"); "Choose all shown" / "Clear shown" act on what the search shows,
 * so "pages 40 to 80" is two keystrokes and one click.
 */

import { useState } from "react";
import { Search } from "lucide-react";
import type { SourceManifestSegment } from "@ai-matrx/agents/sources";
import { Button, Input } from "@ai-matrx/design-system";
import { Checkbox } from "@/components/ui/checkbox";
import { formatChars } from "@/lib/tokens/estimate";

function matchesQuery(segment: SourceManifestSegment, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const range = /^(\d+)\s*[-–to]+\s*(\d+)$/.exec(q);
  if (range && segment.page !== undefined) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    return segment.page >= Math.min(from, to) && segment.page <= Math.max(from, to);
  }
  if (/^\d+$/.test(q) && segment.page !== undefined) {
    return segment.page === Number(q);
  }
  return segment.label.toLowerCase().includes(q) || segment.id.toLowerCase() === q;
}

interface SourcePartsPickerProps {
  segments: SourceManifestSegment[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
}

export function SourcePartsPicker({ segments, selected, onChange }: SourcePartsPickerProps) {
  const [query, setQuery] = useState("");
  const chosen = new Set(selected);
  const shown = segments.filter((s) => matchesQuery(s, query));
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
          placeholder={hasPages ? "Search parts — words, a page (12) or pages (3-10)" : "Search parts"}
          aria-label="Search parts"
          className="pl-8"
        />
      </div>

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
            No part matches “{query}”.
          </li>
        )}
        {shown.map((segment) => (
          <li key={segment.id} className="[content-visibility:auto] [contain-intrinsic-size:auto_44px]">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-accent/50 sm:min-h-9">
              <Checkbox
                checked={chosen.has(segment.id)}
                onCheckedChange={() => toggle(segment.id)}
                aria-label={`Choose ${segment.label}`}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{segment.label}</span>
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
