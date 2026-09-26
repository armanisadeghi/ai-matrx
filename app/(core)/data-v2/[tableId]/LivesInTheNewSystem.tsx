"use client";

// app/(core)/data-v2/[tableId]/LivesInTheNewSystem.tsx — THE NEW TABLE PAGE AT AN OLDER ADDRESS.
//
// A table or a pick list that lives in the new system (its organization switched its Data tables,
// or it was born there) opens at the address it always had — /data/<id>, /lists/<id> — as the new
// table page (records-ui TablePage, the very screen /data-v2/<id> is), under ONE line saying where
// it lives. Same id, same address, no redirect. The /data and /lists routes both mount this; there
// is no second copy of the table page anywhere.

import { useMemo, type ReactNode } from "react";

import UnifiedDataTableRoute from "./page";

export function LivesInTheNewSystem({
  tableId,
  children,
  testId,
}: {
  tableId: string;
  /** The one line above the page: what moved, and where to go back to. */
  children: ReactNode;
  testId: string;
}) {
  const params = useMemo(() => Promise.resolve({ tableId }), [tableId]);
  return (
    <div className="flex h-full flex-col">
      <p
        className="shrink-0 px-4 pb-1 pt-[calc(var(--shell-header-h)+0.25rem)] text-xs text-muted-foreground"
        data-testid={testId}
      >
        {children}
      </p>
      {/* The table page pads itself below the shell header; the line above already sits there. */}
      <div className="min-h-0 flex-1 [--shell-header-h:0px]">
        <UnifiedDataTableRoute params={params} />
      </div>
    </div>
  );
}
