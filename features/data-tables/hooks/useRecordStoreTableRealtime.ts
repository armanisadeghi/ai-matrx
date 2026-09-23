/**
 * useRecordStoreTableRealtime — the grid's live updates for a table the RECORD STORE holds.
 *
 * The twin of `useTableRealtime` (which listens to `workbench.udt_dataset_rows`
 * through postgres_changes) with the SAME event shape, so `UserTableViewer`'s one
 * handler serves both stores. The record store cannot be reached by
 * postgres_changes at all — schema `custom` is doors-only — so this joins the
 * store's own broadcast port, `createRecordsRealtimePort`
 * (`features/unified-data/realtime/recordsRealtimePort.ts`), and nothing else.
 *
 * What comes down that wire is NOT data: record ids and "the shape moved". So:
 *   · ids       → the rows are read again through the store's id door (the same
 *                 ladder as a page), and each comes to the handler as an UPDATE
 *                 carrying the row as the store now holds it; an id that does not
 *                 come back (archived, or no longer visible to this person) and a
 *                 page-wide nudge come as a DELETE with no row, which the handler
 *                 answers by re-reading the page.
 *   · shape     → `onShapeChange`: a column, the table's name or its colors moved,
 *                 and only a fresh metadata read can redraw that.
 *
 * ECHO: this browser's own writes never arrive — every write through
 * `@ai-matrx/records` carries an op id and the port drops its own (see the port's
 * header). There is no `updated_at` race to judge here.
 */
"use client";

import { useEffect, useRef } from "react";

import { createRecordsRealtimePort } from "@/features/unified-data/realtime/recordsRealtimePort";

import { readRowsById } from "../service";
import { recordStoreHomeOf } from "../data-source/table-home";
import { invalidateRecordStoreTable } from "../data-source/record-store";
import type { TableRealtimeEvent } from "./useTableRealtime";

export function useRecordStoreTableRealtime(
  tableId: string | null | undefined,
  onChange: (event: TableRealtimeEvent) => void,
  options?: { enabled?: boolean; onShapeChange?: () => void },
): void {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onShapeRef = useRef(options?.onShapeChange);
  onShapeRef.current = options?.onShapeChange;
  const enabled = options?.enabled ?? true;
  const home = recordStoreHomeOf(tableId);
  const organizationId = home?.organizationId ?? null;

  useEffect(() => {
    if (!enabled || !tableId || !organizationId) return;
    const port = createRecordsRealtimePort(organizationId);
    let live = true;
    const stop = port.subscribeRecords(
      { organization_id: organizationId, table_id: tableId },
      {
        records(ids) {
          invalidateRecordStoreTable(tableId);
          if (ids === null) {
            onChangeRef.current({ kind: "DELETE", rowId: null, row: null });
            return;
          }
          void readRowsById({ tableId, rowIds: ids }).then((read) => {
            if (!live) return;
            if (!read.success) {
              // Could not read them back: the honest answer is a fresh page.
              onChangeRef.current({ kind: "DELETE", rowId: null, row: null });
              return;
            }
            const back = new Set(read.data.map((r) => r.id));
            for (const row of read.data) {
              onChangeRef.current({ kind: "UPDATE", rowId: row.id, row: { id: row.id, data: row.data } });
            }
            if (ids.some((id) => !back.has(id))) {
              onChangeRef.current({ kind: "DELETE", rowId: null, row: null });
            }
          });
        },
        shape() {
          invalidateRecordStoreTable(tableId);
          onShapeRef.current?.();
        },
      },
    );
    return () => {
      live = false;
      stop();
    };
  }, [enabled, organizationId, tableId]);
}
