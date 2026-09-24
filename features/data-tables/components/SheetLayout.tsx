"use client";

/**
 * THE SHEET LAYOUT — the classic /data grid as one layout of the one table page.
 *
 * Owner's ruling (2026-09-23): there is no switch on /data. The table page at
 * /data-v2/[tableId] draws Grid, Kanban, Calendar and Gallery from records-ui's
 * TablePage; the classic grid becomes a fifth layout beside them, "Sheet",
 * rendered through the same data seam (`features/data-tables/service.ts`) over
 * the record store only. The older-store half of the seam stays solely so /data
 * keeps working until the one flip.
 *
 * The host hands this component the table id (records-ui `HostLayout.render`).
 * It places the table in the record store BEFORE the grid mounts, so the very
 * first read goes through the record-store half and never touches an older door
 * (guarded by `a-record-store-table-never-reaches-an-older-door.test.ts`).
 */

import { useLayoutEffect, useState } from "react";
import UserTableViewer from "@/components/user-generated-table-data/UserTableViewer";
import {
  placeTableInRecordStore,
  recordStoreHomeOf,
} from "@/features/data-tables/data-source/table-home";

export interface SheetLayoutProps {
  tableId: string;
  /** The organization the table page reads in (the store's organization for this table). */
  organizationId: string;
  /** The person reading; `null` only while the session is still resolving. */
  userId: string | null;
}

export function SheetLayout({ tableId, organizationId, userId }: SheetLayoutProps) {
  const placedAlready = (() => {
    const home = recordStoreHomeOf(tableId);
    return !!home && home.organizationId === organizationId && home.userId === userId;
  })();
  const [placed, setPlaced] = useState(placedAlready);

  useLayoutEffect(() => {
    placeTableInRecordStore(tableId, { organizationId, userId });
    setPlaced(true);
  }, [tableId, organizationId, userId]);

  if (!placed) return null;
  return (
    <div className="flex h-full min-h-0 flex-col" data-sheet-layout={tableId}>
      <UserTableViewer
        key={`${tableId}:${organizationId}:${userId ?? ""}`}
        tableId={tableId}
        fillHeight
        hideHeader
        // The same surface scope the /data/<id> route emits (TABLE-PARITY gap 5): agents
        // see the table (columns, rules, choices, row label, actions, the selection) and
        // write a confirmed cell through the seam's own upsertCell, and the row forms get
        // their Person chooser (PersonChoicesProvider sits inside this branch).
        emitSurfaceScope
      />
    </div>
  );
}

export default SheetLayout;
