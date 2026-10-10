"use client";

// features/unified-data/map/useTableMap.ts — LANE TABLE-MAP
//
// Reads what the Map needs with FEW calls: the data home's one door for the tables (as the list does),
// then ONE `custom.table_map_fields` call per organization (500 tables a call) and the records
// column's own batched counts. The organization filter and "Show platform tables" narrow in hand.

import { useEffect, useMemo, useState } from "react";
import { useRecordsClient } from "@ai-matrx/records/react";
import type { RecordsDataSource } from "@ai-matrx/records";

import * as doors from "@/features/unified-data/hub/doors";
import { createDataHomeCorpus } from "@/features/unified-data/home/dataHomeCorpus";
import { dataHomeKindWord } from "@/features/unified-data/home/dataHomeRows";
import { createRecordCountStore } from "@/features/unified-data/home/dataHomeRecordCounts";
import { buildTableMap, uniqueTables, type MapTableInput, type TableMap } from "./tableMapModel";

/**
 * A row that IS a table, whatever kind the store gives it. The tables the app keeps (a choice column's
 * List, a scope, a booking page's table) come with their own kind word and are the ones "Show platform
 * tables" brings in, so `kind === "table"` would drop exactly those. A form, portal or dashboard row
 * carries its own id and merely points at a table, so its id differs from the table's.
 */
export function isATableRow(row: { tableId: string | null; itemId: string }): boolean {
  return Boolean(row.tableId) && row.itemId === row.tableId;
}

export type TableMapState =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "ready"; map: TableMap; troubles: string[] };

export function useTableMap(args: {
  dataSource: RecordsDataSource;
  organizationFilter: string | null;
  showPlatformTables: boolean;
}) {
  const { dataSource, organizationFilter, showPlatformTables } = args;
  const client = useRecordsClient();
  const [state, setState] = useState<TableMapState>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const counts = useMemo(
    () => createRecordCountStore((organizationId, tableIds) => doors.tableRowCounts(dataSource, organizationId, tableIds)),
    [dataSource],
  );
  useEffect(() => counts.subscribe(() => setTick((n) => n + 1)), [counts]);

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    const corpus = createDataHomeCorpus(client, dataSource, { includePlatformTables: showPlatformTables });
    (async () => {
      const rows = await corpus.load();
      const tables: MapTableInput[] = uniqueTables(rows
        .filter((r) => isATableRow(r) && !r.archived && r.tableId && (!organizationFilter || r.organizationId === organizationFilter))
        .map((r) => ({
          tableId: r.tableId as string,
          name: r.name,
          href: r.href,
          kindWord: dataHomeKindWord(r.kind),
          organizationId: r.organizationId,
          organizationName: r.organizationName,
        })));
      const byOrg = new Map<string, string[]>();
      for (const t of tables) {
        if (!t.organizationId) continue;
        const list = byOrg.get(t.organizationId) ?? [];
        list.push(t.tableId);
        byOrg.set(t.organizationId, list);
      }
      const troubles: string[] = [];
      const fields: doors.TableMapFieldRow[] = [];
      await Promise.all(
        [...byOrg.entries()].flatMap(([orgId, ids]) => {
          const chunks: Promise<void>[] = [];
          for (let i = 0; i < ids.length; i += doors.TABLE_MAP_MAX) {
            chunks.push(
              doors.tableMapFields(dataSource, orgId, ids.slice(i, i + doors.TABLE_MAP_MAX)).then((answer) => {
                if (answer.ok) fields.push(...answer.data);
                else troubles.push(doors.doorFailureLine(answer.error));
              }),
            );
          }
          return chunks;
        }),
      );
      if (!live) return;
      for (const t of tables) if (t.organizationId) counts.want(t.organizationId, t.tableId);
      setState({ status: "ready", map: buildTableMap(tables, fields), troubles });
    })().catch((error: unknown) => {
      if (live) setState({ status: "failed", message: error instanceof Error ? error.message : "The tables could not be read." });
    });
    return () => {
      live = false;
    };
  }, [client, dataSource, organizationFilter, showPlatformTables, counts]);

  return { state, countOf: (tableId: string) => counts.get(tableId), countsVersion: tick };
}
