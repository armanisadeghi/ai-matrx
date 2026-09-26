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
 * BEFORE anything mounts. An older table mounts `UserTableViewer` exactly as before. A
 * RECORD-STORE table never reaches `UserTableViewer` (one-grid merge, step 7): it mounts
 * records-ui's table page through the ONE host binding the /data-v2 page uses
 * (`RecordStoreTableHost`), and the `data_tables.merged_grid` Feature Knob picks its grid. A table
 * the person was not given, or a store that could not be asked, is said in words — never an
 * empty grid.
 */

import { useEffect, useState, type ComponentProps } from "react";
import UserTableViewer from "@/components/user-generated-table-data/UserTableViewer";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { locateTable } from "@/features/data-tables/data-source/locate-table";
import { RecordStoreTableHost } from "@/features/data-tables/records-ui-host/recordsUiHost";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

type ViewerProps = ComponentProps<typeof UserTableViewer> & {
  /**
   * The host's own actions for a RECORD-STORE table, drawn in the table's one menu (records-ui
   * `TablePage.menuExtras`) — the record-store twin of `toolbarTrailing`, which only the older
   * viewer draws. Never a second toolbar row.
   */
  recordStoreMenuExtras?: Array<{ key: string; label: string; onSelect: () => void }>;
};

type Located =
  | { tableId: string; state: "older" }
  | { tableId: string; state: "record"; organizationId: string }
  | { tableId: string; state: "refused"; why: string };

export function LocatedTableViewer({ recordStoreMenuExtras, ...props }: ViewerProps) {
  const { tableId } = props;
  const [located, setLocated] = useState<Located | null>(null);

  useEffect(() => {
    let cancelled = false;
    void locateTable(tableId)
      .then((answer) => {
        if (cancelled) return;
        setLocated(
          !answer.ok
            ? { tableId, state: "refused", why: answer.error }
            : answer.store === "record"
              ? { tableId, state: "record", organizationId: answer.home.organizationId }
              : { tableId, state: "older" },
        );
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
        <ErrorAlchemyMenu error={located.why} />
      </div>
    );
  }
  if (located.state === "record") {
    return (
      <RecordStoreTableHost
        tableId={tableId}
        organizationId={located.organizationId}
        menuExtras={recordStoreMenuExtras}
      />
    );
  }
  return <UserTableViewer {...props} />;
}

export default LocatedTableViewer;
