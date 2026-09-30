"use client";

/**
 * THE SHEET'S SEARCH BOX STAYS READABLE AT ANY WIDTH (BREAKER-2 B2-33, BREAKER-3 B3-26b).
 *
 * At 390 px, with the "Your look" chip beside it, the search field shrank until it read "Sea". The
 * box now measures the room its slot has: when "Search rows" fits, it is the field it always was;
 * when it does not, it is a search button (the iOS Mail / Linear mobile pattern) that opens the
 * field across the whole toolbar row, over the chips beside it, and folds back when it is left
 * empty. An active search on a folded box shows as a dot on the button, so a filtered Sheet never
 * looks unfiltered. Nothing here can widen the page: the open field is drawn inside the row.
 *
 * The row this sits in must be `position: relative` — the open field covers it.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Search, X } from "lucide-react";

import { Button, Input } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";

/**
 * The width "Search rows" needs at 16 px with the magnifier's padding: 16 px text is ~88 px, plus
 * 32 px on the left for the icon and 8 px on the right. Below this the placeholder is cut.
 */
export const SEARCH_FIELD_ROOM = 132;

export type SheetSearchBoxProps = {
  searchTerm: string;
  onSearchTermChange: (next: string) => void;
  onSubmit: (e: FormEvent) => void;
  onClear: () => void;
};

export function SheetSearchBox({ searchTerm, onSearchTermChange, onSubmit, onClear }: SheetSearchBoxProps) {
  const slotRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [slotWidth, setSlotWidth] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot || typeof ResizeObserver !== "function") return;
    const sizes = new ResizeObserver((entries) => {
      const width = entries[entries.length - 1]?.contentRect.width;
      if (typeof width === "number") setSlotWidth(width);
    });
    sizes.observe(slot);
    return () => sizes.disconnect();
  }, []);

  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  // Unmeasured (first paint, a browser without ResizeObserver) is the field, as it always was.
  const folded = slotWidth !== null && slotWidth < SEARCH_FIELD_ROOM;

  const field = (open: boolean) => (
    <form onSubmit={onSubmit} className="flex flex-1 gap-1">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={open ? inputRef : undefined}
          type="text"
          placeholder="Search rows"
          aria-label="Search rows"
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          onBlur={() => {
            // Left empty, the open field folds back to its button.
            if (open && searchTerm.trim() === "") setExpanded(false);
          }}
          onKeyDown={(e) => {
            if (open && e.key === "Escape") setExpanded(false);
          }}
          data-surface-value="search_term"
          // The clear button's room is kept only while there is something to clear: at 390 an
          // always-reserved 40px cut "Search rows" to "Search row" (DATA-V2-BASICS-2).
          className={`h-11 w-full pl-8 text-base md:h-7 md:pl-7 md:text-sm ${searchTerm || open ? "pr-10 md:pr-7" : "pr-2 md:pr-2"}`}
          style={{ fontSize: "16px" }}
        />
        {(searchTerm || open) && (
          <button
            type="button"
            // Keep the field's focus: a blur here would fold the box before the click lands.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (searchTerm) onClear();
              if (open) setExpanded(false);
            }}
            className="absolute right-0 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground md:right-1 md:h-7 md:w-7"
            aria-label={searchTerm ? "Clear table search" : "Close search"}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <Button size="sm" type="submit" className="hidden h-7 w-7 flex-shrink-0 p-0 md:inline-flex" title="Search">
        <Search className="h-3.5 w-3.5" />
      </Button>
    </form>
  );

  return (
    <div ref={slotRef} className="flex min-w-0 flex-1" data-sheet-search={folded ? "folded" : "field"}>
      {!folded ? (
        field(false)
      ) : (
        <>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="relative h-11 w-11 flex-shrink-0"
            aria-label="Search rows"
            aria-expanded={expanded}
            title={searchTerm ? `Searching for “${searchTerm}”` : "Search rows"}
            onClick={() => setExpanded(true)}
          >
            <Search className="h-4 w-4" />
            {searchTerm ? (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden />
            ) : null}
          </Button>
          {expanded ? (
            <div className={cn("absolute inset-0 z-20 flex items-center bg-background")}>{field(true)}</div>
          ) : null}
        </>
      )}
    </div>
  );
}

export default SheetSearchBox;
