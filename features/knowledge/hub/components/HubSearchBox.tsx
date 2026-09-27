"use client";

/**
 * The hub's search box with operator chips (Linear / Notion): typed operators
 * (`type:note`, `@Ava`, `#grant-2026`, `last week`, `in:inbox` …) lift into
 * removable chips over the ONE query; the rest is text. The parser is the one
 * the ⌘K bar uses (`knowledgeQueryText.ts`). `/` focuses, Esc leaves.
 */

import { forwardRef, useEffect, useEffectEvent, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/utils/cn";
import {
  applyChips,
  chipKey,
  chipsFromQuery,
  parseQueryText,
  removeChip,
  type QueryChip,
} from "@/features/knowledge/api/knowledgeQueryText";
import type { EntityRef, KnowledgeQuery } from "@/features/knowledge/api/knowledgeSearch";
import {
  ORIGIN_WORDS,
  SOURCE_KIND_WORDS,
  dateLabel,
  tokenLabel,
} from "@/features/knowledge/hub/hubPresentation";

export function chipLabel(c: QueryChip, titleFor: (ref: EntityRef) => string): string {
  switch (c.kind) {
    case "type":
      return tokenLabel(c.value);
    case "source_kind":
      return SOURCE_KIND_WORDS[c.value] ?? c.value;
    case "origin":
      return `From ${ORIGIN_WORDS[c.value] ?? c.value}`;
    case "within":
      return c.ref.type === "tag" && !c.ref.id ? `#${c.ref.name ?? ""}` : titleFor(c.ref);
    case "entity":
      return `@${c.value}`;
    case "captured_by":
      return c.value === "me" ? "Captured by me" : "Captured by anyone";
    case "state":
      return c.value === "inbox" ? "Inbox" : c.value === "kept" ? "Kept" : "Archived";
    case "date":
      return dateLabel(c.value.relative);
    case "sort":
      return `Sort: ${c.value}`;
  }
}

interface HubSearchBoxProps {
  query: KnowledgeQuery;
  onQueryChange: (next: KnowledgeQuery, opts: { typing: boolean }) => void;
  onOpenFilters: () => void;
  titleFor: (ref: EntityRef) => string;
  /** Called when the person presses ↓ / Enter to move into the results. */
  onEnterResults: () => void;
}

const DEBOUNCE_MS = 250;

export const HubSearchBox = forwardRef<HTMLInputElement, HubSearchBoxProps>(function HubSearchBox(
  { query, onQueryChange, onOpenFilters, titleFor, onEnterResults },
  ref,
) {
  const [draft, setDraft] = useState(query.text ?? "");
  const [lastExternal, setLastExternal] = useState(query.text ?? "");
  const external = query.text ?? "";
  if (external !== lastExternal) {
    // The URL changed underneath (sidebar, Back): the box follows it.
    setLastExternal(external);
    setDraft(external);
  }

  const commit = (raw: string, final: boolean) => {
    const endsWithSpace = /\s$/.test(raw);
    if (final || endsWithSpace) {
      const { text, chips } = parseQueryText(raw);
      if (chips.length) {
        const next = applyChips({ ...query, text: text || undefined }, chips);
        setDraft(text ? `${text}${endsWithSpace && !final ? " " : ""}` : "");
        setLastExternal(text);
        onQueryChange(next, { typing: !final });
        return;
      }
    }
    const text = raw.trim();
    if (text === (query.text ?? "")) return;
    setLastExternal(text);
    onQueryChange({ ...query, text: text || undefined }, { typing: !final });
  };

  const commitTyping = useEffectEvent((raw: string) => commit(raw, false));
  useEffect(() => {
    const t = setTimeout(() => commitTyping(draft), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [draft]);

  const chips = chipsFromQuery(query);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-2.5 focus-within:ring-2 focus-within:ring-ring">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          ref={ref}
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              commit(draft, true);
              onEnterResults();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              onEnterResults();
            } else if (e.key === "Escape") {
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "Backspace" && draft === "" && chips.length) {
              onQueryChange(removeChip(query, chips[chips.length - 1]), { typing: false });
            }
          }}
          placeholder="Search your knowledge — try type:note, @Ava, #grant-2026, last week"
          aria-label="Search your knowledge"
          className="h-9 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
        <button
          type="button"
          onClick={onOpenFilters}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Filters (f)"
          title="Filters (f)"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Filter</span>
          <kbd className="hidden rounded border border-border px-1 text-[10px] sm:inline">F</kbd>
        </button>
      </div>
      {chips.length ? (
        <div className="flex flex-wrap items-center gap-1" aria-label="Active filters">
          {chips.map((c) => (
            <span
              key={chipKey(c)}
              className={cn(
                "inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs",
              )}
            >
              <span className="truncate">{chipLabel(c, titleFor)}</span>
              <button
                type="button"
                aria-label={`Remove ${chipLabel(c, titleFor)}`}
                className="rounded text-muted-foreground hover:text-foreground"
                onClick={() => onQueryChange(removeChip(query, c), { typing: false })}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            className="px-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onQueryChange({ mode: query.mode, text: query.text }, { typing: false })}
          >
            Clear filters
          </button>
        </div>
      ) : null}
    </div>
  );
});
