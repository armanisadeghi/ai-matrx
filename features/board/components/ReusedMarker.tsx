"use client";

/**
 * "On N boards" (SI-13) — a small chip in a tile's header when the record it shows is also on other boards of
 * the person's, with a popover that lists those boards (each opens). It reads the one board-level index
 * (`ReuseContext`, filled by ONE read of every board's stored tiles), so a tile never queries anything itself.
 * Nothing renders for board-only content or a record that lives on this board alone.
 */

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { Layers } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { listBoardRefs, boardHref } from "../persistence/boardsService";
import { buildReuseIndex, otherBoardsOf, type ReuseIndex } from "../board/reuse";
import type { NodeSource } from "../board/document";

export const ReuseContext = createContext<{ index: ReuseIndex; boardId: string | null } | null>(null);

/** Read every saved board's tiles once when the board opens. A failed read leaves the index empty (no markers), never a wrong one. */
export function useReuseIndex(boardId: string | null, enabled: boolean): ReuseIndex | null {
  const [index, setIndex] = useState<ReuseIndex | null>(null);
  useEffect(() => {
    if (!boardId || !enabled) return;
    let live = true;
    listBoardRefs().then(
      (rows) => live && setIndex(buildReuseIndex(rows)),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [boardId, enabled]);
  return index;
}

export function ReusedMarker({ source }: { source: NodeSource }) {
  const reuse = useContext(ReuseContext);
  if (!reuse) return null;
  const others = otherBoardsOf(reuse.index, source, reuse.boardId);
  if (others.length === 0) return null;
  const n = others.length + 1;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-reused-marker
          title="This item is also on other boards"
          aria-label={`On ${n} boards`}
          className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Layers className="h-3 w-3" />
          on {n} boards
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1">
        <p className="px-2 py-1 text-xs text-muted-foreground">Also on</p>
        {others.map((b) => (
          <Link key={b.id} href={boardHref(b)} className="block truncate rounded-md px-2 py-1.5 text-sm hover:bg-accent">
            {b.title}
          </Link>
        ))}
      </PopoverContent>
    </Popover>
  );
}
