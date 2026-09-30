"use client";

// components/official/drill-explorer/DrillRecords.tsx — "SEE THESE RECORDS" THROUGH THE DOOR
// (lane DRILL-EXPLORER; program DRILL-FINISH decisions 3, 14, 15).
//
// When the definition declares records (`records: {fact, columns}` from `platform.drill_describe`),
// the explorer's "See these records" — a question with no grouping — reads them through
// `platform.drill_rows`: the SAME filter compiler and the SAME lane rule the ask uses, so the rows
// add up to the number that was clicked. The page says the door's own `as_of` (records and totals
// are cut at one instant). Without records, the explorer keeps its host's link instead.

import { useEffect, useState } from "react";
import type { DrillDefinition, DrillSource } from "@ai-matrx/records";
import type { RecordsClient } from "@ai-matrx/records/core";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import type { MatrxDrillQuestion } from "@ai-matrx/design-system/data-table";

import { Button } from "@/components/ui/button";
import { readOf } from "@/components/read-state/ReadGate";

import { doorWindow } from "./useDrillExplorer";
import { asOfPage, doorWhere, type DrillRecordsDeclaration } from "./types";
import type { DrillCarried } from "./questionParts";
import { recordsCellName, recordsColumnHeader } from "./recordsColumns";

const PAGE = 100;
type Row = Record<string, unknown> & { __row: string };

export function DrillRecords({
  client,
  source,
  lane,
  def,
  records,
  question,
  names,
  formatUsd,
  rowNoun,
  carried,
}: {
  client: RecordsClient | null;
  source: DrillSource;
  lane: "mine" | "organization" | "platform";
  def: DrillDefinition;
  records: DrillRecordsDeclaration;
  question: MatrxDrillQuestion;
  names: Record<string, Record<string, string>>;
  formatUsd: (v: number | null) => string;
  rowNoun: string;
  /** What the open view asks beyond the address (list and range filters): the records are read under it too. */
  carried?: DrillCarried | null | undefined;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [columns, setColumns] = useState<string[]>(records.columns);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [says, setSays] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const askKey = JSON.stringify({ where: question.where, window: question.window ?? null, sort: question.sort ?? null, carried: carried?.where ?? null });
  const sourceKey = JSON.stringify(source);
  const columnsKey = records.columns.join(",");

  // A new question starts at the first page.
  const [pagedFor, setPagedFor] = useState(askKey);
  if (pagedFor !== askKey) {
    setPagedFor(askKey);
    setOffset(0);
  }

  useEffect(() => {
    if (!client) return;
    const asked = JSON.parse(askKey) as Pick<MatrxDrillQuestion, "where" | "window" | "sort"> & { carried: Record<string, unknown> | null };
    const win = doorWindow({ by: [], show: [], where: [], window: asked.window ?? null }).window;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void client
      .drillRows({
        source: JSON.parse(sourceKey) as DrillSource,
        where: { ...(asked.carried ?? {}), ...doorWhere({ by: [], show: [], where: asked.where }) },
        ...(win ? { window: win } : {}),
        lane,
        columns: columnsKey.split(","),
        limit: PAGE,
        offset,
      })
      .then((got) => {
        if (cancelled) return;
        setLoading(false);
        if (!got.ok) {
          setError(got.error.message || `The ${rowNoun}s could not be read.`);
          return;
        }
        const page = got.data!;
        const got_rows = page.rows.map((r, i) => ({ ...r, __row: `${offset + i}` }));
        setRows((held) => (offset === 0 ? got_rows : [...held, ...got_rows]));
        setTotal(page.total);
        if (page.columns && page.columns.length > 0) setColumns(page.columns);
        setAsOf(asOfPage(page));
        setSays(page.says ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [client, sourceKey, lane, askKey, columnsKey, offset, rowNoun]);

  const usdColumns = new Set(def.measures.filter((m) => m.unit === "usd" && m.of).map((m) => m.of!));
  const tableColumns: MatrxColumnDef<Row>[] = columns.map((key) => ({
    id: key,
    accessorKey: key,
    header: recordsColumnHeader(def, records, key),
    cell: (row) => {
      const v = row[key];
      if (v === null || v === undefined) return <span className="text-muted-foreground">—</span>;
      if (typeof v === "number" && usdColumns.has(key)) return <span className="tabular-nums">{formatUsd(v)}</span>;
      const named = typeof v === "string" ? recordsCellName(def, names, key, v) : null;
      if (named) return <span>{named}</span>;
      return <span className={typeof v === "number" ? "tabular-nums" : undefined}>{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>;
    },
  }));

  return (
    <div className="flex min-h-0 flex-col" data-drill-explorer-records>
      <p className="px-4 py-1 text-xs text-muted-foreground">
        {total !== null ? `${total.toLocaleString()} ${total === 1 ? rowNoun : `${rowNoun}s`}` : null}
        {asOf ? ` · as of ${new Date(asOf).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : null}
        {says ? ` · ${says}` : null}
      </p>
      <MatrxDataTable
        data={rows}
        columns={tableColumns}
        getRowId={(r) => r.__row}
        isLoading={loading && rows.length === 0}
        read={readOf({ loading: loading && rows.length === 0, error }, { what: `${rowNoun}s`, onRetry: () => setOffset(0) })}
        emptyState={{ title: `No ${rowNoun}s`, description: "" }}
        pageSize={PAGE}
      />
      {total !== null && rows.length < total ? (
        <div className="px-4 py-2">
          <Button type="button" variant="ghost" size="xs" disabled={loading} onClick={() => setOffset(rows.length)}>
            {`Show ${Math.min(PAGE, total - rows.length).toLocaleString()} more`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
