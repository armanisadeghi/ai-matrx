"use client";

/**
 * THE TABLE, OPENED BY ID ANYWHERE OUTSIDE THE TABLE PAGE — AS THE TABLE PAGE ITSELF.
 *
 * Every host that opens a table by id — the table window, the Quick Data sheet, the chat "view
 * table" modal, a canvas table, a tool result's dataset overlay, the tables picker's preview —
 * mounts exactly what /data/<table> mounts: `useUnifiedTable` + `UnifiedTableBody` (the same pair
 * a Board tile renders). The table reads as its OWN organization; a table the person was not
 * given gets the canonical no-access page; the grid layout, the merged grid's agent surface, the
 * table's one action list (with this app's entries) all come with it. Only the route's chrome
 * (header, address, capture) stays on the route.
 *
 * Lane CHAIR-ONE-GRID (2026-10-04): this used to mount a second host binding of its own
 * (a records-ui mount with fewer ports); `pnpm check:one-store-grid` keeps every store-table host on this one.
 */

import type { ObjectAction } from "@ai-matrx/records-ui/object-actions";
import { NO_ADDRESS, UnifiedTableBody, useUnifiedTable } from "@/features/unified-data/table-page/UnifiedTable";

type ViewerProps = {
  tableId: string;
  /** The host's own entries in the table's one action list (records-ui `host.extend`). */
  actionExtensions?: readonly ObjectAction[];
  /** A PREVIEW (the tables picker): read-only, through the records-ui `rights` port. */
  readOnly?: boolean;
};

export function LocatedTableViewer({ tableId, actionExtensions, readOnly = false }: ViewerProps) {
  const mount = useUnifiedTable({
    tableId,
    address: NO_ADDRESS,
    ...(actionExtensions ? { actionExtensions } : {}),
    readOnly,
  });
  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      data-record-store-table={tableId}
      data-grid={mount.mergedGrid ? "merged" : "classic"}
      {...(readOnly ? { "data-read-only": "preview" } : {})}
    >
      <UnifiedTableBody mount={mount} />
    </div>
  );
}

export default LocatedTableViewer;
