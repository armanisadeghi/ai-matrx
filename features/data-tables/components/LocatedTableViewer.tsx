"use client";

/**
 * THE TABLE, OPENED BY ID ANYWHERE OUTSIDE THE TABLE PAGE (lane INTEG-CLIENTS, CUTOVER-PLAN F2/F3).
 *
 * Every host that opens a table by id — the Quick Data sheet, the table window, the chat "view
 * table" modal, a canvas table, a tool result's dataset overlay, the agent-resources preview —
 * asks where the table opens (`locateTable`: its own organization, for this person) BEFORE
 * anything mounts, then mounts records-ui's table page through the ONE host binding the /data-v2
 * page uses (`RecordStoreTableHost`). A table the person was not given, or a store that could not
 * be asked, is said in words — never an empty grid.
 */

import { useEffect, useState } from "react";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { locateTable } from "@/features/data-tables/data-source/locate-table";
import { RecordStoreTableHost } from "@/features/data-tables/records-ui-host/recordsUiHost";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

type ViewerProps = {
  tableId: string;
  /** The host's own actions, drawn in the table's one menu (records-ui `TablePage.menuExtras`). */
  recordStoreMenuExtras?: Array<{ key: string; label: string; onSelect: () => void }>;
  /** A PREVIEW (the tables picker): read-only, through the records-ui `rights` port. */
  readOnly?: boolean;
};

type Located =
  | { tableId: string; state: "record"; organizationId: string }
  | { tableId: string; state: "refused"; why: string };

export function LocatedTableViewer({ tableId, recordStoreMenuExtras, readOnly = false }: ViewerProps) {
  const [located, setLocated] = useState<Located | null>(null);

  useEffect(() => {
    let cancelled = false;
    void locateTable(tableId)
      .then((answer) => {
        if (cancelled) return;
        setLocated(
          answer.ok
            ? { tableId, state: "record", organizationId: answer.home.organizationId }
            : { tableId, state: "refused", why: answer.error },
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
  return (
    <RecordStoreTableHost
      tableId={tableId}
      organizationId={located.organizationId}
      menuExtras={recordStoreMenuExtras}
      readOnly={readOnly}
    />
  );
}

export default LocatedTableViewer;
