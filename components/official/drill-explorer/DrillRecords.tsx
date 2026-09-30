"use client";

// components/official/drill-explorer/DrillRecords.tsx — "SEE THESE RECORDS" THROUGH THE DOOR
// (lane DRILL-EXPLORER; program DRILL-FINISH decisions 3, 14, 15).
//
// When the definition declares records (`records: {fact, columns}` from `platform.drill_describe`),
// the explorer's "See these records" — a question with no grouping — reads them through
// `platform.drill_rows`: the SAME filter compiler and the SAME lane rule the ask uses, so the rows
// add up to the number that was clicked. The page says the door's own `as_of` (records and totals
// are cut at one instant). Without records, the explorer keeps its host's link instead.
//
// Every cell reads as the answer does (lane DRILL-GAPS): a column a Measure reads is formatted by
// that Measure's unit (money through the one switch, durations, counts), a column a Dimension reads
// by that Dimension's words (a choice's label, the door's or the resolver's name, Yes / No), a
// moment as a date and time. An invoker definition's records are its own rows (kg_cost's recent runs).

import { useEffect, useState } from "react";
import type { DrillDefinition, DrillSource } from "@ai-matrx/records";
import type { RecordsClient } from "@ai-matrx/records/core";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import type { MatrxDrillDimension, MatrxDrillMeasure, MatrxDrillQuestion } from "@ai-matrx/design-system/data-table";

import AppLink from "@/components/navigation/AppLink";
import { Button } from "@/components/ui/button";
import { readOf } from "@/components/read-state/ReadGate";

import { doorWindow } from "./useDrillExplorer";
import { asOfPage, doorWhere, type DrillNameResolver, type DrillRecordOpener, type DrillRecordsDeclaration } from "./types";
import type { DrillCarried } from "./questionParts";
import { recordsColumnDimension, recordsColumnHeader } from "./recordsColumns";
import { plainWords } from "./dimensionWords";

const PAGE = 100;
type Row = Record<string, unknown> & { __row: string };

export function DrillRecords({
  client,
  source,
  lane,
  def,
  records,
  question,
  dimensions,
  measures,
  rowNoun,
  carried,
  resolvers,
  openRecord,
}: {
  client: RecordsClient | null;
  source: DrillSource;
  lane: "mine" | "organization" | "platform";
  def: DrillDefinition;
  records: DrillRecordsDeclaration;
  question: MatrxDrillQuestion;
  /** The explorer's Dimensions, with the words each value reads as. */
  dimensions: MatrxDrillDimension[];
  /** The explorer's Measures, with the format of each unit. */
  measures: MatrxDrillMeasure[];
  rowNoun: string;
  /** What the open view asks beyond the address (list and range filters): the records are read under it too. */
  carried?: DrillCarried | null | undefined;
  /** The host's name resolvers (a person's name); every other id is named by the door. */
  resolvers?: Record<string, DrillNameResolver> | undefined;
  /** How one record opens (THE DOOR LAW): its id column becomes the record's door. */
  openRecord?: DrillRecordOpener | undefined;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [says, setSays] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  // Dimension key → id → words, for the ids on the pages read (a records page carries no labels)
  const [recordNames, setRecordNames] = useState<Record<string, Record<string, string>>>({});
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
        // THE IDS ON THIS PAGE READ AS NAMES: a host resolver's (a person), else the door's own words —
        // the same door asked for just these ids, grouped by their Dimension, read as the seat.
        for (const column of columnsKey.split(",")) {
          const dimKey = recordsColumnDimension(def, column);
          const dim = dimKey ? def.dimensions.find((d) => d.key === dimKey) : undefined;
          if (!dim || dim.kind !== "relation") continue;
          const ids = [...new Set(page.rows.map((r) => r[column]).filter((v): v is string => typeof v === "string" && v.length > 0))].slice(0, 500);
          if (ids.length === 0) continue;
          const put = (named: Record<string, string>) => !cancelled && setRecordNames((held) => ({ ...held, [dim.key]: { ...(held[dim.key] ?? {}), ...named } }));
          const resolver = resolvers?.[dim.key];
          if (resolver) {
            void resolver.resolve(ids).then((r) => (r.ok ? put(r.names) : undefined));
            continue;
          }
          void client
            .drillAsk({ source: JSON.parse(sourceKey) as DrillSource, question: { by: [dim.key], where: { [dim.key]: ids }, lane, limit: ids.length, ...(win ? { window: win } : {}) } })
            .then((r) => {
              if (!r.ok) return;
              const named: Record<string, string> = {};
              for (const row of r.data?.rows ?? []) {
                const id = row.groups?.[dim.key];
                const label = row.labels?.[dim.key];
                if (typeof id === "string" && typeof label === "string") named[id] = label;
              }
              put(named);
            });
        }
        setTotal(page.total);
        setAsOf(asOfPage(page));
        setSays(page.says ?? null);
      });
    return () => {
      cancelled = true;
    };
    // `def` and `resolvers` are read for names only (a host passes fresh objects each render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, sourceKey, lane, askKey, columnsKey, offset, rowNoun]);

  // the columns asked are the columns shown (the declared record columns, in their order)
  const columns = records.columns;
  const formatOf = (column: string) => {
    const m = def.measures.find((x) => x.of === column && x.unit);
    return m ? measures.find((x) => x.key === m.key)?.format : undefined;
  };
  const tableColumns: MatrxColumnDef<Row>[] = columns.map((key) => {
    const format = formatOf(key);
    const dimKey = recordsColumnDimension(def, key);
    const dim = dimKey ? dimensions.find((d) => d.key === dimKey) : undefined;
    return {
      id: key,
      accessorKey: key,
      header: recordsColumnHeader(def, records, key),
      cell: (row) => {
        const v = row[key];
        if (openRecord && key === openRecord.column && typeof v === "string" && v) {
          const words = openRecord.label;
          const href = openRecord.href?.(v);
          return href ? (
            <AppLink href={href} className="underline underline-offset-2" data-drill-explorer-record-open={v}>
              {words}
            </AppLink>
          ) : (
            <button type="button" className="underline underline-offset-2" data-drill-explorer-record-open={v} onClick={() => openRecord.open?.(v)}>
              {words}
            </button>
          );
        }
        if (v === null || v === undefined) return <span className="text-muted-foreground">{dim?.labelFor ? dim.labelFor(null) : "—"}</span>;
        if (typeof v === "number" && format) return <span className="tabular-nums">{format(v)}</span>;
        if (dim?.kind === "time" && typeof v === "string") {
          const at = new Date(v);
          if (!Number.isNaN(at.getTime())) return <span className="tabular-nums">{at.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>;
        }
        if (dimKey && typeof v === "string" && recordNames[dimKey]?.[v]) return <span>{recordNames[dimKey][v]}</span>;
        if (dim?.labelFor && (typeof v === "string" || typeof v === "boolean")) return <span>{dim.labelFor(String(v))}</span>;
        if (typeof v === "boolean") return <span>{v ? "Yes" : "No"}</span>;
        // a code no Dimension names ("landed_only") reads in plain words, never as the code
        if (typeof v === "string" && /^[a-z]+(_[a-z0-9]+)+$/.test(v)) return <span>{plainWords(v)}</span>;
        return <span className={typeof v === "number" ? "tabular-nums" : undefined}>{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>;
      },
    };
  });

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
