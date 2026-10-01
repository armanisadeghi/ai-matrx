"use client";

// features/unified-data/home/DataHomeRecent.tsx — LANE DATA-HOME-3C
//
// RECENT ON AN EMPTY SEARCH (DATA-HOME-3-SPEC §2.4). The rows the person last opened from this list
// (`lists.dataHomeRecent`, written by useDataHomeMarks.opened), newest first, as one line of links
// above the table — the shell's `notice` slot, the only place a list surface may put a line above
// its tabs. Typing a search hides it (the results are the answer then). A recent id whose row is no
// longer in hand (archived, access gone) is skipped, never shown as a dead link. One line only: a
// link that does not fit the width wraps out of sight (`flex-wrap` + a fixed height), so a phone
// shows the newest few and never scrolls sideways.

import Link from "next/link";

import { cn } from "@/lib/utils";
import type { DataHomeRow } from "./dataHomeRows";
import { KindIcon } from "./dataHomeColumns";

/** The most recent links one line ever offers. */
export const DATA_HOME_RECENT_SHOWN = 6;

export function recentRows(recent: readonly string[], byId: ReadonlyMap<string, DataHomeRow>): DataHomeRow[] {
  const out: DataHomeRow[] = [];
  for (const id of recent) {
    const row = byId.get(id);
    if (row) out.push(row);
    if (out.length === DATA_HOME_RECENT_SHOWN) break;
  }
  return out;
}

export function DataHomeRecent({
  rows,
  onOpened,
  className,
}: {
  rows: readonly DataHomeRow[];
  onOpened: (row: DataHomeRow) => void;
  className?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <nav aria-label="Recent" data-data-home-recent="" className={cn("flex min-w-0 items-center gap-2 text-xs", className)}>
      <span className="shrink-0 font-medium text-muted-foreground">Recent</span>
      <div className="flex h-11 min-w-0 flex-1 flex-wrap items-center gap-1.5 overflow-hidden lg:h-7">
        {rows.map((row) => (
          <Link
            key={row.id}
            href={row.href}
            onClick={() => onOpened(row)}
            title={[row.name, row.organizationName].filter(Boolean).join(" · ")}
            data-data-home-recent-item={row.id}
            className="inline-flex h-11 max-w-[14rem] shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-foreground hover:bg-muted lg:h-7"
          >
            <KindIcon kind={row.kind} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{row.name}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
