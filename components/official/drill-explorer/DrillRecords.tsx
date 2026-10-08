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
//
// Lane DRILL-LIVE-FIXES (VERIFY-DRILL-LIVE F3, F4, F8): the count's noun is the records' own grain
// ("one row per execution …" → 1,026 executions, never the host's `rowNoun` "requests" of the number
// above it); the header row carries what the rows add up to (the door's first-page `measures`) and,
// when a late cost moved them off the counted number, a "Settling" badge whose tooltip has both; the
// table is source-paged (controlled-append) so its pager reads the TRUE total; every moment column
// (any ISO timestamp, whichever Dimension it feeds or none) prints as a date and time in the calendar
// the numbers are cut in, and an id nothing names prints short, whole in its tooltip.

import { useEffect, useState } from "react";
import type { DrillDefinition, DrillSource } from "@ai-matrx/records";
import type { RecordsClient } from "@ai-matrx/records/core";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import type { MatrxDataTableQueryState, MatrxDrillDimension, MatrxDrillMeasure, MatrxDrillQuestion } from "@ai-matrx/design-system/data-table";

import AppLink from "@/components/navigation/AppLink";
import { InfoHint } from "@/components/official/InfoHint";
import { readOf } from "@/components/read-state/ReadGate";

import { doorWindow, drillWindowKey } from "./useDrillExplorer";
import { useDrillNameBookOr, useDrillNames, type DrillNameBook } from "./drillNames";
import type { DrillSiblingDefinition } from "./drillSiblings";
import { asOfPage, doorWhere, type DrillNameResolver, type DrillRecordOpener, type DrillRecordsDeclaration } from "./types";
import type { DrillCarried } from "./questionParts";
import { recordsColumnDimension, recordsColumnHeader } from "./recordsColumns";
import { plainWords } from "./dimensionWords";
import { grainNoun, isMoment, measureFactWords, momentWords, pluralNoun, shortId, drillFailureWords } from "./explorerWords";
import { formatCount } from "@ai-matrx/kit/format";

import { Button } from "@ai-matrx/design-system/controls";
const PAGE = 100;
/** Sums the header row names at most (the first Measures the question shows). */
const SUMS_SHOWN = 3;
type Row = Record<string, unknown> & { __row: string };
type Settling = NonNullable<DrillRowsPageSums["settling"]>;
interface DrillRowsPageSums {
  measures?: Record<string, number | string | null>;
  counted?: Record<string, number | string | null>;
  settling?: Record<string, { counted: number | string | null; now: number | string | null; difference: number }>;
}

/**
 * THE RECORDS' NOUN: records that are ANOTHER declared definition's rows (ai_usage → ai_usage_executions,
 * a sibling the host offers) take that definition's grain; records over the definition's own fact
 * (workflow_runs → workflow_run_facts, kg_cost → rag_ingest_run) take its own ("one row per ingest run" →
 * "ingest run"). Null while the sibling is still being described; the host's `rowNoun` stands in.
 *
 * NOTHING IS DESCRIBED HERE (lane DRILL-D1, VERIFY-DRILL-FINAL D2): `records.fact` is a fact token, and
 * describing it asked the door to drill a System table by inference — refused 403 on every run-analysis
 * load. Only declared definitions are described, and the siblings already are (`useDrillSiblings`).
 */
export function useRecordsNoun(
  def: DrillDefinition,
  records: DrillRecordsDeclaration,
  siblings: { offered: readonly string[]; described: readonly DrillSiblingDefinition[] } = { offered: [], described: [] },
): string | null {
  const own = grainNoun(def.grain);
  if (records.fact === def.key || !siblings.offered.includes(records.fact)) return own;
  const sibling = siblings.described.find((s) => s.token === records.fact);
  if (!sibling) return null;
  return grainNoun(sibling.def.grain) ?? own;
}

/** The first moment the platform holds any record: "All time" as the window records are listed for. */
export const DRILL_ALL_TIME_FROM = "2020-01-01T00:00:00Z";

/** "All time" as a window with a start (the door lists records for a window). */
export function allTimeWindow(key: string, now: Date = new Date()): { key: string; from: string; to: string } {
  return { key, from: DRILL_ALL_TIME_FROM, to: now.toISOString() };
}

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
  book: hostBook,
  siblings,
  openRecord,
  timeZone,
}: {
  /** The host's sibling definitions: the records' noun when the records are a sibling's rows. */
  siblings?: { offered: readonly string[]; described: readonly DrillSiblingDefinition[] } | undefined;
  /** The explorer's one name book (drillNames.ts); absent = one of this list's own over `resolvers`. */
  book?: DrillNameBook | undefined;
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
  /** The calendar the numbers are cut in ("UTC" on the platform lane); the reader's own when absent. */
  timeZone?: string | undefined;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [says, setSays] = useState<string | null>(null);
  const [sums, setSums] = useState<DrillRowsPageSums>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  // Dimension key → id → words, for the ids on the pages read (a records page carries no labels)
  const book = useDrillNameBookOr(hostBook, resolvers);
  const recordNames = useDrillNames(book);
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
    // RECORDS ARE LISTED FOR A WINDOW (the door requires a start): "All time" is every record there is,
    // so it is asked as the whole span from the platform's first day to now — never a refusal on screen
    // (lane DRILL-FLIP-FIXES, VERIFY-DRILL-FINAL N2).
    // along the definition's own time Dimension (lane DRILL-LIVE-FIX-2 #1); none = no window at all
    const along = drillWindowKey(dimensions, carried);
    const win = along ? (doorWindow({ by: [], show: [], where: [], window: asked.window ?? null }, { key: along }).window ?? allTimeWindow(along)) : undefined;
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
          setError(drillFailureWords(got.error.message, `The ${rowNoun}s could not be read.`));
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
          const put = (named: Record<string, string>) => !cancelled && book.learn({ [dim.key]: named });
          // a host-named id (a person) goes to the ONE book: asked once, unread words when it fails
          if (book.resolves(dim.key)) {
            void book.want(dim.key, ids);
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
        // the sums ride the FIRST page only: a later page keeps them
        if (offset === 0) {
          const withSums = page as DrillRowsPageSums;
          setSums({
            ...(withSums.measures ? { measures: withSums.measures } : {}),
            ...(withSums.counted ? { counted: withSums.counted } : {}),
            ...(withSums.settling ? { settling: withSums.settling } : {}),
          });
        }
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
            <Button variant="quiet" data-drill-explorer-record-open={v} onClick={() => openRecord.open?.(v)}>{words}</Button>
          );
        }
        if (v === null || v === undefined) return <span className="text-muted-foreground">{dim?.labelFor ? dim.labelFor(null) : "—"}</span>;
        if (typeof v === "number" && format) return <span className="tabular-nums">{format(v)}</span>;
        // A MOMENT reads as a date and time, whichever Dimension it feeds or none (F4: usage's
        // created_at feeds no Dimension and printed "2026-09-12T23:59:36.392599+00:00")
        if (isMoment(v)) return <span className="whitespace-nowrap tabular-nums">{momentWords(v, timeZone)}</span>;
        if (dimKey && typeof v === "string" && recordNames[dimKey]?.[v]) return <span>{recordNames[dimKey][v]}</span>;
        if (dim?.labelFor && (typeof v === "string" || typeof v === "boolean")) return <span>{dim.labelFor(String(v))}</span>;
        if (typeof v === "boolean") return <span>{v ? "Yes" : "No"}</span>;
        // a code no Dimension names ("landed_only") reads in plain words, never as the code
        if (typeof v === "string" && /^[a-z]+(_[a-z0-9]+)+$/.test(v)) return <span>{plainWords(v)}</span>;
        // an id nothing names reads short (the whole id in its tooltip), never a whole UUID leading a row
        const short = typeof v === "string" ? shortId(v) : null;
        if (short) return <span className="font-mono text-muted-foreground" title={String(v)}>{short}</span>;
        return <span className={typeof v === "number" ? "tabular-nums" : undefined}>{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>;
      },
    };
  });

  const noun = useRecordsNoun(def, records, siblings) ?? rowNoun;
  const measureOf = (key: string) => def.measures.find((m) => m.key === key);
  const fmtSum = (key: string, v: number | string | null | undefined) => {
    if (v === null || v === undefined) return "—";
    const n = Number(v);
    const f = measures.find((m) => m.key === key)?.format;
    return f ? f(n) : formatCount(n);
  };
  // what these records add up to, for the Measures the question shows (the header's own first)
  const sumKeys = question.show.filter((k) => sums.measures && k in sums.measures).slice(0, SUMS_SHOWN);
  const settling: Settling | undefined = sums.settling && Object.keys(sums.settling).length > 0 ? sums.settling : undefined;
  const settlingTip = settling
    ? Object.entries(settling)
        .filter(([k]) => sumKeys.includes(k) || sumKeys.length === 0)
        .slice(0, 2)
        .map(([k, s]) => `${measureOf(k)?.label ?? k}: counted ${fmtSum(k, s.counted)}, now ${fmtSum(k, s.now)}`)
        .join(" · ")
    : "";

  const [tableQuery, setTableQuery] = useState<MatrxDataTableQueryState>({ page: 1, pageSize: PAGE, search: "", anyOf: "", columnFilters: {}, sort: null });

  return (
    <div className="flex min-h-0 flex-col" data-drill-explorer-records>
      {/* ONE header row: the count in the records' own noun, what they add up to, when they are cut */}
      <div data-drill-explorer-records-header className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-4 py-1 type-secondary text-muted-foreground">
        {total !== null ? (
          <span data-drill-explorer-records-count className="font-medium text-foreground">
            {`${formatCount(total)} ${pluralNoun(noun, total)}`}
          </span>
        ) : null}
        {total !== null
          ? sumKeys.map((k) => (
              <span key={k} data-drill-explorer-records-sum={k} className="whitespace-nowrap tabular-nums">
                <span aria-hidden="true">· </span>
                {measureFactWords(measureOf(k)?.label ?? k, measureOf(k)?.unit, fmtSum(k, sums.measures?.[k]))}
              </span>
            ))
          : null}
        {asOf ? (
          <span className="whitespace-nowrap">
            <span aria-hidden="true">· </span>
            {`as of ${momentWords(asOf, timeZone)}`}
          </span>
        ) : null}
        {settling ? (
          <span data-drill-explorer-records-settling className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 type-meta font-medium text-amber-700 dark:text-amber-300">
            Settling
            <InfoHint text={settlingTip || "A late cost moved these records off the counted number."} label="Why these differ" />
          </span>
        ) : null}
        {says ? <InfoHint text={says} label="About these records" /> : null}
      </div>
      <MatrxDataTable
        data={rows}
        columns={tableColumns}
        getRowId={(r) => r.__row}
        isLoading={loading && rows.length === 0}
        isFetching={loading && rows.length > 0}
        read={readOf({ loading: loading && rows.length === 0, error }, { what: pluralNoun(noun, 2), onRetry: () => setOffset(0) })}
        emptyState={{ title: `No ${pluralNoun(noun, 2)}`, description: "" }}
        pageSize={PAGE}
        // SOURCE-PAGED (F3): the door pages the records, so the pager reads the door's total, not the
        // rows held ("1-100 of 100" over 1,026 records); the next page appends as the person scrolls.
        query={{
          mode: "controlled-append",
          state: tableQuery,
          onStateChange: setTableQuery,
          sourceProcessing: { search: "local", columnFilters: "local", sort: "local", ...(total !== null ? { sourceTotal: total } : {}) },
          pagination: {
            queryKey: `${sourceKey}|${askKey}|${columnsKey}`,
            rows,
            loading: loading && rows.length === 0,
            isFetchingNextPage: loading && rows.length > 0,
            error: error ? new Error(error) : null,
            hasNextPage: total !== null && rows.length < total,
            loadNextPage: async () => {
              if (!loading && total !== null && rows.length < total) setOffset(rows.length);
            },
            refresh: () => setOffset(0),
            totalItems: total ?? undefined,
          },
        }}
      />
    </div>
  );
}
