"use client";

// features/start/widgets/bodies/TableWidget.tsx — the first rows of one of the person's own tables, and the
// way into it. Reads through the data-tables service (the same doors /data/<id> uses): one metadata read for
// the columns, one page of rows. Title = the first column, meta = the second; every row opens the table.
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@ai-matrx/design-system/controls";
import { getTableMetadata, getTablePage } from "@/features/data-tables/service";
import type { StartWidgetBodyProps } from "../types";
import { WidgetList } from "../frame";

const SHOWN_ROWS = 8;

function cellText(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(cellText).filter(Boolean).join(", ");
  return "";
}

/** The first two columns' words for each row — pure, for the test. */
export function tableWidgetRows(
  columns: readonly { field_name: string }[],
  rows: readonly { id: string; data: Record<string, unknown> }[],
): { id: string; title: string; meta: string }[] {
  const [first, second] = columns;
  return rows.slice(0, SHOWN_ROWS).map((r) => ({
    id: r.id,
    title: (first ? cellText(r.data[first.field_name]) : "") || "Untitled row",
    meta: second ? cellText(r.data[second.field_name]) : "",
  }));
}

export function TableWidget({ config, size }: StartWidgetBodyProps) {
  const tableId = config.tableId;
  const query = useQuery({
    queryKey: ["start-table", tableId],
    enabled: Boolean(tableId),
    staleTime: 30_000,
    queryFn: async () => {
      const meta = await getTableMetadata({ tableId: tableId! });
      if (!meta.success) throw new Error(meta.error);
      const page = await getTablePage({ tableId: tableId!, limit: SHOWN_ROWS, offset: 0 });
      if (!page.success) throw new Error(page.error);
      return { name: meta.data.table.table_name, rows: tableWidgetRows(meta.data.columns, page.data.rows), total: meta.data.row_count };
    },
  });
  if (!tableId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center">
        <p className="text-xs text-muted-foreground">No table chosen</p>
        <Button variant="outline" asChild>
          <Link href="/data">Your tables</Link>
        </Button>
      </div>
    );
  }
  const href = `/data/${tableId}`;
  return (
    <WidgetList
      type="table"
      size={size}
      config={config}
      loading={query.isLoading}
      error={query.error ? query.error.message : null}
      empty={
        <Link href={href} className="underline">
          No rows yet. Open the table
        </Link>
      }
      rows={(query.data?.rows ?? []).map((r) => ({ key: r.id, title: r.title, href, meta: r.meta || null }))}
    />
  );
}
