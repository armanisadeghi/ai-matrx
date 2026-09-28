"use client";

/**
 * THE AGENT SURFACE OF ONE RECORD-STORE RECORD — `matrx-user/data-tables`, scoped to one row.
 *
 * A record opened on its own (records-ui's `Peek`, e.g. a Board tile) has no grid to tell the
 * surface where the person is. This builds the SAME `GridContextSnapshot` the merged grid tells
 * (records-ui's own `gridContextSnapshot`), for exactly one row — the table, its columns, its
 * row actions, this record as the one visible row and the current row — and feeds it to
 * `RecordStoreTableSurface`. So an agent reads this record exactly as it reads it in the table,
 * and `cell_value` writes this record only (the handler refuses any row that is not visible).
 *
 * Sits INSIDE `RecordsMount` (it reads through the mount's client, as this person).
 */
import { useEffect, useState, type ReactNode } from "react";
import { gridContextSnapshot, useRecordRights } from "@ai-matrx/records-ui";
import { useFields, useRecord, useRecordChangeRevision, useRecordsClient, useTable } from "@ai-matrx/records/react";
import type { RowAction } from "@ai-matrx/records";

import { RecordStoreTableSurface, useGridContextChannel } from "./RecordStoreTableSurface";

export function RecordStoreRecordSurface({
  tableId,
  recordId,
  children,
}: {
  tableId: string;
  recordId: string;
  children: ReactNode;
}) {
  const channel = useGridContextChannel();
  const client = useRecordsClient();
  const table = useTable(tableId);
  const fields = useFields(tableId);
  const record = useRecord(recordId);
  const rights = useRecordRights(recordId);
  const revision = useRecordChangeRevision(recordId);
  const [rowActions, setRowActions] = useState<RowAction[]>([]);
  const { onGridContext } = channel;
  const reloadRecord = record.reload;

  // A change to this record anywhere (the Peek, the table, another person) re-reads it, so the
  // agent's view of it is never older than the screen's.
  useEffect(() => {
    if (revision > 0) reloadRecord();
  }, [revision, reloadRecord]);

  // The table's row actions, each saying whether it can run here — what the grid lists too.
  useEffect(() => {
    let live = true;
    void client.rowActions({ table_id: tableId as never }).then((answer) => {
      if (live && answer.ok) setRowActions(answer.data.actions);
    });
    return () => {
      live = false;
    };
  }, [client, tableId]);

  const tableRead = table.data;
  const fieldList = fields.data;
  const read = record.data;
  useEffect(() => {
    if (!tableRead || !fieldList || !read || !rights.known) return;
    const row = { id: read.record_id, document: read.document, level: rights.level ?? "", hidden: read.hidden };
    onGridContext(
      gridContextSnapshot({
        tableId: tableId as never,
        table: tableRead,
        fields: fieldList,
        shownKeys: fieldList.map((f) => f.key),
        rows: [row],
        rowActions,
        canWrite: rights.write,
        cursor: null,
        editing: null,
        selectedIds: [],
        total: 1,
        search: "",
      }),
    );
  }, [tableId, tableRead, fieldList, read, rights.known, rights.level, rights.write, rowActions, onGridContext]);

  return <RecordStoreTableSurface channel={channel}>{children}</RecordStoreTableSurface>;
}
