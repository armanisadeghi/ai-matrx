"use client";

/**
 * THE AGENT SURFACE OF A RECORD-STORE TABLE (records-ui merge tranche 6l, inventory H1 / H2).
 *
 * The merged grid on /data-v2 tells the page where the person is (`onGridContext`); this mounts
 * the `matrx-user/data-tables` surface runtime over the table page, so an agent in the side chat
 * sees the table, its columns, the cell / block / ticked rows and the rows on screen, and may write
 * ONE confirmed cell — through `@ai-matrx/records` (`custom.record_update`), never the older doors.
 *
 * `useGridContextChannel` is created by the page (the host port is bound OUTSIDE `RecordsMount`);
 * `RecordStoreTableSurface` sits INSIDE it, so its write reaches the store as this person.
 */
import { useRef, useState, type ReactNode } from "react";
import type { GridContextSnapshot } from "@ai-matrx/records-ui";
import { useRecordsClient } from "@ai-matrx/records/react";

import { SurfaceRuntimeProvider, type SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { buildDataTablesScope } from "@/features/data-tables/agent-context/buildDataTablesScope";

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
export function recordStoreWriteHandlers(
  latest: { current: GridContextSnapshot | null },
  write: (recordId: string, key: string, value: unknown) => Promise<{ ok: true } | { ok: false; says: string }>,
): SurfaceWriteHandlers {
  return {
    table_description: async () => {
      throw new Error(
        "table_description cannot be written on this table: a record-store table's description is changed by the person in Table settings. Tell the user the sentence you would set.",
      );
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

export function RecordStoreTableSurface({
  channel,
  enabled = true,
  children,
}: {
  channel: GridContextChannel;
  /** Off: the children draw bare (the classic grid tells nothing, so there is no scope to offer). */
  enabled?: boolean;
  children: ReactNode;
}) {
  const client = useRecordsClient();
  const { latest } = channel;
  const getScope = () => {
    const snapshot = latest.current;
    return buildDataTablesScope(
      snapshot
        ? scopeInputFromGrid(snapshot)
        : { tableId: "", isReadOnly: null, fields: [], visibleRows: [], totalCount: 0, searchTerm: "", fullDataset: null, openCell: null, openRow: null },
    );
  };
  const handlers = recordStoreWriteHandlers(latest, async (recordId, key, value) => {
    const answer = await client.recordUpdate({ record_id: recordId as never, patch: { [key]: value } as never });
    return answer.ok ? { ok: true } : { ok: false, says: answer.error.message };
  });
  const snapshot = latest.current;
  if (!enabled) return <>{children}</>;
  return (
    <SurfaceRuntimeProvider
      surfaceName={DATA_TABLES_SURFACE}
      getScope={getScope}
      isEditable={snapshot ? snapshot.canWrite : false}
      getWriteHandlers={() => handlers}
    >
      {children}
    </SurfaceRuntimeProvider>
  );
}
