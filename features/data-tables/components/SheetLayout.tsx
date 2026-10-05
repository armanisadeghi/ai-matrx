"use client";

/**
 * THE SHEET LAYOUT — the classic /data grid as one layout of the one table page.
 *
 * Owner's ruling (2026-09-23): there is no switch on /data. The table page at
 * /data/[tableId] draws Grid, Kanban, Calendar and Gallery from records-ui's
 * TablePage; the classic grid becomes a fifth layout beside them, "Sheet",
 * rendered through the same data seam (`features/data-tables/service.ts`) over
 * the record store.
 *
 * The host hands this component the table id (records-ui `HostLayout.render`).
 * It places the table (its organization, the reader) BEFORE the grid mounts, so
 * the very first read needs no further question.
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
  /**
   * The table page's own export, handed to a host layout by records-ui. Unused: the page's header
   * ⋯ is the table's one menu and carries Export (TABLE-ACTIONS item 11).
   */
  openExport?: (() => void) | undefined;
  /**
   * THE TABLE PAGE'S ONE TOOLBAR ROW, handed by records-ui (lane TABLE-PAGE-CHROME): the Sheet's
   * toolbar and its sort state are drawn into it, never a row of their own. Absent before it.
   */
  toolbarSlot?: HTMLElement | null | undefined;
  /**
   * Where the view's footer sits: `sticky` (default) — the Sheet fills the page and the pages bar
   * stays on the bottom edge, as on /data; `inline` — the Sheet is as tall as its rows.
   */
  footer?: "sticky" | "inline" | undefined;
}

export function SheetLayout({ tableId, organizationId, userId, toolbarSlot, footer }: SheetLayoutProps) {
  const fills = footer !== "inline";
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
    <div
      className={fills ? "flex h-full min-h-0 flex-1 flex-col" : "flex flex-col"}
      data-sheet-layout={tableId}
      data-sheet-footer={fills ? "sticky" : "inline"}
    >
      <UserTableViewer
        key={`${tableId}:${organizationId}:${userId ?? ""}`}
        tableId={tableId}
        fillHeight={fills}
        {...(toolbarSlot !== undefined ? { toolbarSlot } : {})}
        hideHeader
        // The same surface scope the /data/<id> route emits (TABLE-PARITY gap 5): agents
        // see the table (columns, rules, choices, row label, actions, the selection) and
        // write a confirmed cell through the seam's own upsertCell, and the row forms get
        // their Person chooser (PersonChoicesProvider sits inside this branch).
        emitSurfaceScope
        pageOwnsShareAndExport
      />
    </div>
  );
}

export default SheetLayout;
