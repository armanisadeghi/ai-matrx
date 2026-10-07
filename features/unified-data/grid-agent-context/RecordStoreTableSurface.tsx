"use client";

/**
 * THE AGENT SURFACE OF A RECORD-STORE TABLE (records-ui merge tranche 6l, inventory H1 / H2).
 *
 * The merged grid on /data tells the page where the person is (`onGridContext`); this mounts
 * the `matrx-user/data-tables` surface runtime over the table page, so an agent in the side chat
 * sees the table, its columns, the cell / block / ticked rows and the rows on screen, and may write
 * ONE confirmed cell, or the table's description — through `@ai-matrx/records` (`custom.record_update`
 * on the row, or on the table's own record through records-ui's `saveTableDescription`), never the
 * older doors.
 *
 * `useGridContextChannel` is created by the page (the host port is bound OUTSIDE `RecordsMount`);
 * `RecordStoreTableSurface` sits INSIDE it, so its write reaches the store as this person.
 */
import { useRef, useState, type ReactNode } from "react";
import { VersionLedger, updateRecordAt, versionRefusalLabel } from "@/lib/records/record-versions";
import type { GridContextSnapshot } from "./recordStoreTableScope";
import { useFields, useRecordsClient, useTable } from "@ai-matrx/records/react";
import { saveTableDescription } from "@ai-matrx/records-ui";

import { SurfaceRuntimeProvider, type SurfaceWriteHandlers } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { createDataTablesScope } from "@/features/surfaces/manifests/data-tables.manifest";
import { buildDataTablesScope } from "@/features/data-tables/agent-context/buildDataTablesScope";
import { briefColumns } from "@/features/data-tables/agent-context/tableBrief";

import { isWorkedOut, scopeInputFromGrid } from "./recordStoreTableScope";

export const DATA_TABLES_SURFACE = "matrx-user/data-tables" as const;

export interface GridContextChannel {
  /** Bind as `RecordsUiHost.onGridContext`. */
  onGridContext: (snapshot: GridContextSnapshot) => void;
  /** The last snapshot the grid told. */
  latest: { current: GridContextSnapshot | null };
  /** Whether the grid has told anything yet (the surface mounts once it has). */
  told: boolean;
}

export function useGridContextChannel(): GridContextChannel {
  const latest = useRef<GridContextSnapshot | null>(null);
  const [told, setTold] = useState(false);
  const onGridContext = (snapshot: GridContextSnapshot) => {
    latest.current = snapshot;
    setTold(true);
  };
  return { onGridContext, latest, told };
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `an array (${value.length} items)`;
  return typeof value === "object" ? `an object with keys [${Object.keys(value as object).join(", ")}]` : `a ${typeof value}`;
}

/**
 * The write targets, read through the channel at Apply time (never a render closure: the confirm
 * dialog resolves the handler before the person answers, and the page may have moved since).
 */
type Written = { ok: true } | { ok: false; says: string };

/** The longest description a table keeps (the older Sheet's limit, said in the manifest). */
export const MAX_TABLE_DESCRIPTION_CHARS = 2000;

export function recordStoreWriteHandlers(
  latest: { current: GridContextSnapshot | null },
  write: (recordId: string, key: string, value: unknown) => Promise<Written>,
  describeTable?: (text: string) => Promise<Written>,
): SurfaceWriteHandlers {
  return {
    table_description: async (value: unknown) => {
      const live = latest.current;
      if (!describeTable) {
        throw new Error("Cannot apply table_description here: this view is not over one table's page, so there is no table to describe.");
      }
      if (!gridHasLoaded(live)) {
        throw new Error("Cannot apply table_description: the table has not finished loading. Wait for the grid to render and try again.");
      }
      if (!live.canWrite) {
        throw new Error("Cannot apply table_description: this person may not change this table (is_read_only is true), so no write is permitted.");
      }
      if (typeof value !== "string") {
        throw new Error(
          `table_description takes PLAIN TEXT, not JSON and not JSON-encoded — received ${describe(value)}. Send the sentence itself, with no surrounding quotes, no wrapper object and no escaped newlines.`,
        );
      }
      const text = value.trim();
      if (!text) {
        throw new Error("table_description cannot be empty or whitespace-only. Clearing a table's description is the user's call, not an agent's — send the description you want it to have.");
      }
      if (text.length > MAX_TABLE_DESCRIPTION_CHARS) {
        throw new Error(`table_description is ${text.length} characters; the limit is ${MAX_TABLE_DESCRIPTION_CHARS}. This field is a short summary of what the table holds — 1-3 sentences.`);
      }
      const written = await describeTable(text);
      if (!written.ok) throw new Error(`The store refused the table description: ${written.says}`);
    },
    cell_value: async (value: unknown) => {
      const live = latest.current;
      if (!live) throw new Error("Cannot apply cell_value: the table has not finished loading. Wait for the grid to render and try again.");
      if (!live.canWrite) {
        throw new Error("Cannot apply cell_value: this person may not change records in this table (is_read_only is true), so no write is permitted.");
      }
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`cell_value takes an OBJECT { row_id, field_name, value } — received ${describe(value)}.`);
      }
      const v = value as Record<string, unknown>;
      const extra = Object.keys(v).filter((k) => !["row_id", "field_name", "value"].includes(k));
      if (extra.length > 0) throw new Error(`cell_value received unexpected key(s) [${extra.join(", ")}]. The shape is exactly { row_id, field_name, value }.`);
      if (!("value" in v)) throw new Error("cell_value is missing the `value` key. Send `value: null` to empty the cell.");
      const rowId = v["row_id"];
      const key = v["field_name"];
      if (typeof rowId !== "string" || !rowId.trim()) throw new Error(`cell_value.row_id must be the row's id string — received ${describe(rowId)}. Read it from visible_data_csv's row_id column or current_row_id.`);
      if (typeof key !== "string" || !key.trim()) throw new Error(`cell_value.field_name must be a column's machine name — received ${describe(key)}. Read it from column_list's \`name\`.`);
      const field = live.fields.find((f) => f.key === key);
      if (!field) {
        throw new Error(
          `cell_value.field_name "${key}" is not a column of this table. The real columns are: ${live.fields.map((f) => `${f.key} (shown as "${f.label || f.key}")`).join(", ")}.`,
        );
      }
      if (isWorkedOut(field)) {
        throw new Error(`cell_value cannot write "${key}" ("${field.label || key}"): the table works it out from other columns and stores nothing typed. Change the cells it reads instead.`);
      }
      if (!live.visibleRows.some((r) => r.id === rowId)) {
        throw new Error(
          `cell_value.row_id "${rowId}" is not one of the ${live.visibleRows.length} row(s) on screen, so writing it would change data the user cannot see. Ask the user to bring that row onto the page first.`,
        );
      }
      const raw = v["value"];
      if (raw !== null && !["string", "number", "boolean"].includes(typeof raw)) {
        throw new Error(`cell_value.value must be a string, number, boolean or null — received ${describe(raw)}.`);
      }
      const written = await write(rowId, key, raw);
      if (!written.ok) throw new Error(`The store refused ${key} on row ${rowId}: ${written.says}`);
    },
  };
}

/**
 * Has the grid told the host a real table yet? Before it has (a tile that has not drawn, or a table
 * still opening) the snapshot carries no columns, no rows and no total — and `canWrite` is false only
 * because nothing is known. Such a snapshot must never be read as "0 rows, read-only".
 */
export function gridHasLoaded(snapshot: GridContextSnapshot | null): snapshot is GridContextSnapshot {
  return snapshot !== null && (snapshot.total !== null || snapshot.fields.length > 0 || snapshot.visibleRows.length > 0);
}

export function RecordStoreTableSurface({
  channel,
  enabled = true,
  tableId,
  children,
}: {
  channel: GridContextChannel;
  /** The table this surface is over; the only value known before the grid has drawn. */
  tableId?: string;
  /** Off: the children draw bare (the classic grid tells nothing, so there is no scope to offer). */
  enabled?: boolean;
  children: ReactNode;
}) {
  const client = useRecordsClient();
  // What the store already holds before the grid has drawn (the same cached reads the grid makes):
  // the table's name and its column headers. No row count: the store keeps none until a page is read.
  const known = useTable(tableId ?? null);
  const knownFields = useFields(tableId ?? null);
  const { latest } = channel;
  // THE VERSIONS OF THE ROWS THE AGENT WAS SHOWN: read when the scope is handed over, so its one
  // confirmed cell is sent against what it saw — a colleague's change since is refused, never overwritten.
  const ledger = useRef<VersionLedger | null>(null);
  ledger.current ??= new VersionLedger();
  const getScope = () => {
    const snapshot = latest.current;
    if (snapshot) void ledger.current!.drew(client, snapshot.visibleRows.map((r) => r.id));
    // Not loaded yet: say only what is known. row_count / is_read_only are left OUT (unknown is not 0 / true).
    if (!gridHasLoaded(snapshot)) {
      const name = known.data?.name?.trim();
      const columns = briefColumns((knownFields.data ?? []).map((f) => ({ field_name: f.key, display_name: f.label?.trim() || f.key })));
      return {
        ...createDataTablesScope({
          ...(tableId ? { table_id: tableId } : {}),
          ...(name ? { table_name: name } : {}),
          ...(columns ? { brief_columns: columns } : {}),
        }),
        not_loaded_yet: true,
      };
    }
    const description = typeof known.data?.metadata?.["description"] === "string" ? (known.data.metadata["description"] as string).trim() : "";
    return buildDataTablesScope({ ...scopeInputFromGrid(snapshot), ...(description ? { tableDescription: description } : {}) });
  };
  const handlers = recordStoreWriteHandlers(latest, async (recordId, key, value) => {
    const answer = await updateRecordAt(client, {
      record_id: recordId,
      patch: { [key]: value },
      version: await ledger.current!.seen(recordId),
    });
    if (answer.ok) {
      ledger.current!.wrote(client, recordId, answer.data);
      return { ok: true };
    }
    const label = versionRefusalLabel(answer.error);
    return { ok: false, says: label ? `${label}: ${answer.error.message}` : answer.error.message };
  }, tableId ? (text) => saveTableDescription(client, tableId, text) : undefined);
  const snapshot = latest.current;
  if (!enabled) return <>{children}</>;
  return (
    <SurfaceRuntimeProvider
      surfaceName={DATA_TABLES_SURFACE}
      getScope={getScope}
      isEditable={gridHasLoaded(snapshot) ? snapshot.canWrite : false}
      getWriteHandlers={() => handlers}
    >
      {children}
    </SurfaceRuntimeProvider>
  );
}
