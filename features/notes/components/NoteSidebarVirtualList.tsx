"use client";

// The Notes sidebar list, VIRTUALISED: only the rows in view (plus a small
// overscan) are mounted. Every sidebar row carries a context menu, an item
// menu and a dozen Radix providers; with 500+ notes and the folders expanded
// the list mounted 800+ of them, and any re-render of the sidebar (a save, a
// sync) redrew them all while the person typed (the Write-mode freeze,
// 2026-10-10). Rendering ~30 rows bounds that cost no matter how many notes
// a person has.
//
// `useVirtualizer` is a React Compiler "incompatible library" (its instance is
// mutated in place, so memoised reads would go stale). This component opts out
// by name ("use no memo") and stays tiny, so the sidebar that owns the list
// keeps compiling.

import { useEffect, useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export interface NoteSidebarListItem {
  /** Stable React key for the row (also the virtualiser's item key). */
  key: string;
  /** The note this row shows, when it shows one. */
  noteId?: string;
}

/** Ask the list to bring a row into view once (a new `seq` asks again). */
export interface NoteSidebarReveal {
  seq: number;
  /** The note to reveal; null reveals the first note row. */
  noteId: string | null;
  align: "start" | "center";
}

interface NoteSidebarVirtualListProps<T extends NoteSidebarListItem> {
  items: T[];
  getScrollElement: () => HTMLElement | null;
  estimateSize: (item: T) => number;
  renderItem: (item: T) => ReactNode;
  reveal: NoteSidebarReveal | null;
}

export function NoteSidebarVirtualList<T extends NoteSidebarListItem>(props: NoteSidebarVirtualListProps<T>) {
  "use no memo";
  const { items, getScrollElement, estimateSize, renderItem, reveal } = props;
  const listRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement,
    estimateSize: (index) => estimateSize(items[index]!),
    getItemKey: (index) => items[index]!.key,
    overscan: 12,
    // Anything rendered above the list inside the same scroller (a load
    // failure line) offsets every row.
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  // A reveal is answered ONCE. When its row is not in the list yet (the folder
  // that holds it expands on the next commit, or the list is still loading)
  // the next change of `items` retries; list churn after that never re-scrolls.
  const answeredSeq = useRef<number | null>(null);
  useEffect(() => {
    if (!reveal || answeredSeq.current === reveal.seq) return;
    const index = items.findIndex((item) =>
      reveal.noteId ? item.noteId === reveal.noteId : item.noteId !== undefined,
    );
    if (index < 0) return;
    answeredSeq.current = reveal.seq;
    virtualizer.scrollToIndex(index, { align: reveal.align });
  }, [reveal, items, virtualizer]);

  const scrollMargin = virtualizer.options.scrollMargin;
  return (
    <div
      ref={listRef}
      data-virtual-list="notes-sidebar"
      style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}
    >
      {virtualizer.getVirtualItems().map((row) => (
        <div
          key={row.key}
          data-index={row.index}
          ref={virtualizer.measureElement}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            transform: `translateY(${row.start - scrollMargin}px)`,
          }}
        >
          {renderItem(items[row.index]!)}
        </div>
      ))}
    </div>
  );
}
