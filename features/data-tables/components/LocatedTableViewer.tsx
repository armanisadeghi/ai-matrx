"use client";

/**
 * THE GRID, OPENED BY ID ANYWHERE OUTSIDE THE TABLE PAGE (lane INTEG-CLIENTS, CUTOVER-PLAN F2/F3).
 *
 * `UserTableViewer` reads through the data seam, and the seam dispatches by where the table
 * is PLACED — which only the table page (`/data-v2`'s Sheet layout) ever did. Every other host
 * that opens a table by id — the Quick Data sheet, the table window, the chat "view table"
 * modal, a canvas table, a tool result's dataset overlay, the agent-resources preview — mounted
 * the viewer UNPLACED, so a moved table was read from its archived older copy (or refused by the
 * older door) and a table born in the record store did not open at all.
 *
 * This host asks where the table lives (`locateTable`: the record store's Table kernel by id)
 * BEFORE the viewer mounts, so the first read goes to the right store. An older table mounts
 * exactly as before. A table the person was not given, or a store that could not be asked, is
 * said in words — never an empty grid.
 */

import { useEffect, useState, type ComponentProps } from "react";
import UserTableViewer from "@/components/user-generated-table-data/UserTableViewer";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { locateTable } from "@/features/data-tables/data-source/where-a-table-is-born";

type ViewerProps = ComponentProps<typeof UserTableViewer>;

type Located = { tableId: string; state: "ready" } | { tableId: string; state: "refused"; why: string };

export function LocatedTableViewer(props: ViewerProps) {
  const { tableId } = props;
  const [located, setLocated] = useState<Located | null>(null);

  useEffect(() => {
    let cancelled = false;
    void locateTable(tableId)
      .then((answer) => {
        if (cancelled) return;
        setLocated(answer.ok ? { tableId, state: "ready" } : { tableId, state: "refused", why: answer.error });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLocated({
          tableId,
          state: "refused",
          why: err instanceof Error ? err.message : "This table could not be opened.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [tableId]);

  if (!located || located.tableId !== tableId) {
    return (
      <div className="flex h-full min-h-24 items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }
  if (located.state === "refused") {
    return (
      <div className="flex h-full min-h-24 items-center justify-center p-4 text-sm text-muted-foreground" role="status">
        {located.why}
      </div>
    );
  }
  return <UserTableViewer {...props} />;
}

export default LocatedTableViewer;
