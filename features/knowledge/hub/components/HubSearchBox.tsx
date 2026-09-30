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
  MENTION_REF_TYPE,
  parseQueryText,
  removeChip,
  type QueryChip,
} from "@/features/knowledge/api/knowledgeQueryText";
import type { EntityRef, KnowledgeQuery } from "@/features/knowledge/api/knowledgeSearch";
import { HowSearchWorksButton } from "@/features/knowledge/hub/components/HubHowSearchWorks";
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
      if (c.ref.type === MENTION_REF_TYPE) return `@${c.ref.name ?? ""}`;
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
  /**
   * The open view's OWN filters (a preset's, a kind's, a container's). They are
   * the view — its name already says them — so they never show as removable
   * chips; only what the person added on top does, and "Clear filters" returns
   * to the view, never to everything (Linear: a view's definition is not a
   * filter you are carrying).
   */
  viewQuery?: KnowledgeQuery;
  /** Names what is being searched ("Search transcripts"); defaults to the whole hub. */
  placeholder?: string;
}

const DEBOUNCE_MS = 250;

export const HubSearchBox = forwardRef<HTMLInputElement, HubSearchBoxProps>(function HubSearchBox(
  { query, onQueryChange, onOpenFilters, titleFor, onEnterResults, viewQuery, placeholder = "Search your knowledge" },
  ref,
) {
  const [draft, setDraft] = useState(query.text ?? "");
  const external = query.text ?? "";
  const [prevExternal, setPrevExternal] = useState(external);
  /** The text this box last sent; its echo from the URL is not a change. */
  const [sent, setSent] = useState<string | null>(null);
  if (external !== prevExternal) {
    // The URL changed. Our own commit landing (possibly while the person kept
    // typing) must never overwrite the box; only an outside change (sidebar,
    // Back, Clear) replaces what it shows.
    setPrevExternal(external);
    if (external !== sent && external !== draft.trim()) setDraft(external);
  }

  const commit = (raw: string, final: boolean) => {
    const endsWithSpace = /\s$/.test(raw);
    if (final || endsWithSpace) {
      const { text, chips } = parseQueryText(raw);
      if (chips.length) {
        const next = applyChips({ ...query, text: text || undefined }, chips);
        setDraft(text ? `${text}${endsWithSpace && !final ? " " : ""}` : "");
        setSent(text);
        onQueryChange(next, { typing: !final });
        return;
      }
    }
    const text = raw.trim();
    if (text === (query.text ?? "")) return;
    setSent(text);
    onQueryChange({ ...query, text: text || undefined }, { typing: !final });
  };

  const commitTyping = useEffectEvent((raw: string) => commit(raw, false));
  useEffect(() => {
    const t = setTimeout(() => commitTyping(draft), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [draft]);

  const viewChipKeys = new Set(viewQuery ? chipsFromQuery(viewQuery).map(chipKey) : []);
  const allChips = chipsFromQuery(query);
  const chips = allChips.filter((c) => !viewChipKeys.has(chipKey(c)));

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
          placeholder={placeholder}
          title="Search — or narrow with type:note, @Ava, #grant-2026, last week"
          aria-label={placeholder}
          className="h-9 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
        <HowSearchWorksButton />
        <button
          type="button"
          onClick={onOpenFilters}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Filters (f)"
          title="Filters (f)"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="hidden @xl:inline">Filter</span>
          <kbd className="hidden rounded border border-border px-1 text-[10px] @xl:inline">F</kbd>
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
            onClick={() =>
              onQueryChange(
                viewQuery ? { ...viewQuery, mode: query.mode, text: query.text } : { mode: query.mode, text: query.text },
                { typing: false },
              )
            }
          >
            Clear filters
          </button>
        </div>
      ) : null}
    </div>
  );
});
