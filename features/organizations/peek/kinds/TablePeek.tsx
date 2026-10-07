// record-view: none — table is read through the record store, which takes no custom fields
"use client";

/**
 * TablePeek — quick read-only preview of a record-store Table.
 *
 * The table names its own organization (`locateTable`), then the data seam reads its details, its
 * columns and its first rows (`getTablePage`). A failed read says so; an empty table says it is empty.
 */

import React from "react";
import { Table } from "lucide-react";
import { locateTable } from "@/features/data-tables/data-source/locate-table";
import { getTablePage, readTableDetails } from "@/features/data-tables/service";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

const PEEK_ROWS = 5;
const PEEK_COLUMNS = 6;

interface TableView {
  title: string | null;
  description: string | null;
  fields: { name: string; label: string }[];
  rows: { id: string; data: Record<string, unknown> }[];
  total: number;
  /** The columns or rows could not be read: said on screen, never shown as "empty". */
  readError: string | null;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function TablePeek({ id, open, onClose }: PeekProps) {
  const [view, setView] = React.useState<TableView | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const where = await locateTable(id);
      const details = where.ok ? await readTableDetails(id) : null;
      let next: TableView | null = null;
      if (details?.success && details.table) {
        const fields = [...(details.fields ?? [])]
          .sort((a, b) => a.field_order - b.field_order)
          .map((f) => ({ name: f.field_name, label: f.display_name || f.field_name }));
        const page = await getTablePage({ tableId: id, limit: PEEK_ROWS, offset: 0 });
        next = {
          title: details.table.name || details.table.description || null,
          description: details.table.name ? details.table.description || null : null,
          fields,
          rows: page.success ? page.data.rows : [],
          total: page.success ? page.data.pagination.total_count : 0,
          readError: page.success ? null : `The rows could not be read: ${page.error}`,
        };
      }
      if (!cancelled) {
        setView(next);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const title = view?.title?.trim() || "Table";
  const shown = view?.fields.slice(0, PEEK_COLUMNS) ?? [];

  return (
    <PeekDialog
      open={open}
      onClose={onClose}
      title={title}
      icon={<Table className="h-4 w-4 text-primary" />}
      href={`/data/${id}`}
      loading={loading}
    >
      {!view ? (
        <p className="text-sm text-muted-foreground">Table not found.</p>
      ) : (
        <>
          {view.description ? <PeekField label="Description">{view.description}</PeekField> : null}
          <PeekField label={`Columns (${view.fields.length})`}>
            {view.fields.length === 0 ? (
              <span className="text-muted-foreground">No columns yet.</span>
            ) : (
              view.fields.map((f) => f.label).join(", ")
            )}
          </PeekField>
          <PeekField label={view.readError ? "Rows" : `Rows (${view.total})`}>
            {view.readError ? (
              <span className="text-destructive">{view.readError}</span>
            ) : view.rows.length === 0 ? (
              <span className="text-muted-foreground">This table has no rows yet.</span>
            ) : (
              <div className="overflow-x-auto rounded border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 text-left">
                      {shown.map((f) => (
                        <th key={f.name} className="px-2 py-1 font-medium whitespace-nowrap">
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {view.rows.map((r) => (
                      <tr key={r.id} className="border-t border-border">
                        {shown.map((f) => (
                          <td key={f.name} className="px-2 py-1 max-w-[12rem] truncate">
                            {cellText(r.data[f.name])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PeekField>
        </>
      )}
    </PeekDialog>
  );
}
