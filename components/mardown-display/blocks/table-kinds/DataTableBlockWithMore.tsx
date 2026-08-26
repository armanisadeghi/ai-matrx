"use client";

/**
 * THE PRODUCTION FETCH-MORE HOST for `data_table` (adversarial finding A-9).
 *
 * `DataTableBlock`'s truncation banner grows its "Get all N rows" button only
 * when a `DataTableMoreProvider` is in the tree — and until this file, the
 * only mount in the repo was the dev demo. Every REAL truncated table
 * (dispatched by the block registry from a message stream) rendered the
 * "this view cannot ask for them" text: LAW 3's literal failure mode, a
 * banner without a control (`common-docs/policies/no-dead-ends.md`).
 *
 * This host closes it ON THE PRODUCTION RENDER PATH. It is what the block
 * registry mounts for `data_table`, and it:
 *
 *  1. defers to any EXISTING provider (a page that owns its read — the
 *     table-kinds demo — keeps its own labels and ceiling);
 *  2. re-runs the producing read when it faithfully CAN: an `origin: "sql"`
 *     source whose recorded query is the bare registered-model select that
 *     `POST /table-kinds/read` runs (aidream `services/table_kinds`) — the
 *     one live producer of truncated tables today;
 *  3. provides NOTHING when the read cannot be faithfully re-run (a parsed
 *     CSV, a PDF lift, a filtered query) — `DataTableBlock`'s banner then
 *     says precisely why, per origin, instead of offering a button that lies.
 *
 * The refetched value REPLACES the rendered one locally (state override) —
 * the stored message is never rewritten; a reload shows the original read
 * again, which is the honest representation of what the producer produced.
 */

import React from "react";
import { useBackendApi } from "@/hooks/useBackendApi";
import { consumeStream } from "@/lib/api/stream-parser";
import { toast } from "@/lib/toast";
import { readSearchKindValue } from "../search-kinds/search-kind-data";
import DataTableBlock, { type DataTableBlockProps } from "./DataTableBlock";
import {
  DataTableMoreProvider,
  useDataTableMore,
} from "./data-table-more";

/** The endpoint's own ceiling (`TableKindsRequest.limit`, `ge=1 le=100`). */
export const TABLE_KINDS_ROW_CEILING = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The schema-qualified table this value's producing read can be FAITHFULLY
 * re-run against, or null.
 *
 * Faithful means: `origin === "sql"` with a schema + table, and the recorded
 * query (when one is recorded) is the bare `select * from schema.table limit N`
 * the `/table-kinds/read` endpoint runs. A filtered or joined query would
 * return DIFFERENT rows from a bare re-read — offering "get the rest" on one
 * would be a button that lies, which is the same defect as a banner with no
 * button.
 */
export function refetchableTableSource(value: unknown): { table: string } | null {
  if (!isRecord(value)) return null;
  const source = value.source;
  if (!isRecord(source) || source.origin !== "sql") return null;
  const schema = str(source.schema_name);
  const table = str(source.table_name);
  if (!schema || !table) return null;
  const query = str(source.query);
  if (query) {
    const bare = new RegExp(
      `^select \\* from ${escapeRegExp(`${schema}.${table}`)} limit \\d+$`,
      "i",
    );
    if (!bare.test(query.trim())) return null;
  }
  return { table: `${schema}.${table}` };
}

function int(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The dispatch-mounted `data_table` component: the canonical block, wrapped in
 * a working fetch-more seam wherever the producing read can be re-run.
 */
export function DataTableBlockWithMore({
  serverData,
  className,
}: DataTableBlockProps) {
  // A host page that already provides the seam (the table-kinds demo) knows
  // its own read and its own ceiling — never shadow it.
  const existing = useDataTableMore();
  const api = useBackendApi();
  const [override, setOverride] = React.useState<Record<string, unknown> | null>(
    null,
  );
  const [pending, setPending] = React.useState(false);

  const { value } = readSearchKindValue<"data_table">(serverData);
  const refetch = refetchableTableSource(value);
  const totalRowCount = int((value as Record<string, unknown>).total_row_count);

  const onRequestMore = React.useCallback(
    async ({ total }: { have: number; total: number | null }) => {
      if (!refetch || pending) return;
      setPending(true);
      try {
        const want = Math.min(
          total ?? TABLE_KINDS_ROW_CEILING,
          TABLE_KINDS_ROW_CEILING,
        );
        const response = await api.post("/table-kinds/read", {
          table: refetch.table,
          limit: Math.max(1, want),
        });
        let received: Record<string, unknown> | null = null;
        await consumeStream(response, {
          onData: (data) => {
            if (
              isRecord(data) &&
              data.type === "table_kinds_result" &&
              isRecord(data.result)
            ) {
              received = data.result;
            }
          },
          onError: (e) => {
            throw new Error(
              e.user_message || e.message || "The re-read failed.",
            );
          },
        });
        if (!received) {
          throw new Error("The re-read ended without returning the table.");
        }
        setOverride(received);
        const stillShort = total !== null && total > TABLE_KINDS_ROW_CEILING;
        if (stillShort) {
          toast.success(
            `Loaded ${want.toLocaleString()} rows — this read returns at most ${TABLE_KINDS_ROW_CEILING} at a time.`,
          );
        }
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "Could not load the rest of the table.",
        );
      } finally {
        setPending(false);
      }
    },
    [api, pending, refetch],
  );

  const shown = override ?? serverData;

  if (existing || !refetch) {
    return <DataTableBlock serverData={shown} className={className} />;
  }

  const overCeiling =
    totalRowCount !== null && totalRowCount > TABLE_KINDS_ROW_CEILING;
  return (
    <DataTableMoreProvider
      value={{
        onRequestMore,
        pending,
        // The button may only promise what the endpoint can deliver.
        moreLabel: overCeiling ? `Get ${TABLE_KINDS_ROW_CEILING} rows` : null,
        limitNote: overCeiling
          ? `This read returns at most ${TABLE_KINDS_ROW_CEILING} rows per request.`
          : null,
      }}
    >
      <DataTableBlock serverData={shown} className={className} />
    </DataTableMoreProvider>
  );
}

export default DataTableBlockWithMore;
