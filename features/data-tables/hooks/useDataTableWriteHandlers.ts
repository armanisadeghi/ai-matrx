/**
 * Write handlers for the `matrx-user/data-tables` surface (`/data/[id]`).
 *
 * Two targets: `table_description` (authored prose) and `cell_value` (ONE cell
 * of one row). Both are `mode: "entity"` on `applyPolicy: "ask"` — they persist
 * on confirm through the SAME canonical service calls the page's own controls
 * use (`updateTableMetadata`, `upsertCell`), never a parallel write path.
 *
 * THE STALENESS RULE, and why every read here goes through a ref:
 * `applySurfaceWrite` resolves the handler closure BEFORE the user answers the
 * confirm dialog. Anything captured off a render closure — the loaded rows, the
 * field list, whether the table is read-only — can therefore be stale by the
 * time Apply is pressed. On a grid that is the difference between validating
 * against the rows the user is looking at and validating against the rows they
 * were looking at a page ago. So the handlers read `liveRef.current`, which the
 * component reassigns on every render, and they REFUSE rather than guess when
 * the coordinates no longer resolve.
 *
 * Every failure THROWS. The writeback seam converts a throw into the error
 * envelope the agent reads, so the messages are written for the agent: they say
 * what was received, what was expected, and what to re-read.
 */

import { useMemo, type RefObject } from "react";

import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";

import { normalizeCellValue } from "../components/EditableCell";
import { updateTableMetadata, upsertCell } from "../service";
import { isServiceFailure } from "../types";

/** Hard ceiling on the authored description. */
const MAX_DESCRIPTION_CHARS = 2000;

export interface DataTableWriteField {
  field_name: string;
  display_name: string;
  data_type: string;
}

export interface DataTableWriteRow {
  id: string;
  data: Record<string, unknown>;
}

/**
 * The live slice of viewer state the handlers validate against. Reassigned on
 * every render by the component that owns it — never read off a closure.
 */
export interface DataTableWriteLiveState {
  tableId: string;
  /** Null until the table row has loaded: permission is not yet known. */
  isReadOnly: boolean | null;
  fields: DataTableWriteField[];
  /** The page of rows currently on screen — the write's blast-radius bound. */
  visibleRows: DataTableWriteRow[];
}

export interface DataTableWriteCallbacks {
  /** Called with the persisted description so the page can show it. */
  onDescriptionSaved: (description: string) => void;
  /** Called after a cell lands so the page can reload the grid. */
  onCellSaved: (rowId: string, fieldName: string, value: unknown) => void;
}

/** What actually arrived, for an error message an agent can act on. */
function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `an array (${value.length} items)`;
  const t = typeof value;
  if (t === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    return `an object with keys [${keys.join(", ")}]`;
  }
  if (t === "string") return `a string`;
  return `a ${t}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );
}

/** Shared read-only / not-loaded gate. */
function assertWritable(live: DataTableWriteLiveState, target: string): void {
  if (live.isReadOnly === null) {
    throw new Error(
      `Cannot apply ${target}: the table has not finished loading, so its permissions are not known yet. Wait for the grid to render and try again.`,
    );
  }
  if (live.isReadOnly) {
    throw new Error(
      `Cannot apply ${target}: this table is shared with the user as read-only (is_read_only is true), so no write is permitted. They would need to duplicate the table to change it.`,
    );
  }
}

export function useDataTableWriteHandlers(
  liveRef: RefObject<DataTableWriteLiveState | null>,
  callbacks: DataTableWriteCallbacks,
): SurfaceWriteHandlers {
  const { onDescriptionSaved, onCellSaved } = callbacks;

  return useMemo<SurfaceWriteHandlers>(
    () => ({
      table_description: async (value: unknown) => {
        const live = liveRef.current;
        if (!live) throw new Error("Cannot apply table_description: the table viewer is no longer mounted.");
        assertWritable(live, "table_description");

        if (typeof value !== "string") {
          throw new Error(
            `table_description takes PLAIN TEXT, not JSON and not JSON-encoded — received ${describe(value)}. Send the sentence itself, with no surrounding quotes, no wrapper object and no escaped newlines.`,
          );
        }
        const text = value.trim();
        if (text.length === 0) {
          throw new Error(
            "table_description cannot be empty or whitespace-only. Clearing a table's description is the user's call, not an agent's — send the description you want it to have.",
          );
        }
        if (text.length > MAX_DESCRIPTION_CHARS) {
          throw new Error(
            `table_description is ${text.length} characters; the limit is ${MAX_DESCRIPTION_CHARS}. This field is a short summary of what the table holds — 1-3 sentences.`,
          );
        }

        const result = await updateTableMetadata({
          tableId: live.tableId,
          description: text,
        });
        if (isServiceFailure(result)) {
          throw new Error(
            `Could not save the table description: ${result.error}`,
          );
        }
        onDescriptionSaved(result.data.description ?? text);
      },

      cell_value: async (value: unknown) => {
        const live = liveRef.current;
        if (!live) throw new Error("Cannot apply cell_value: the table viewer is no longer mounted.");
        assertWritable(live, "cell_value");

        if (!isPlainObject(value)) {
          throw new Error(
            `cell_value takes an OBJECT { row_id, field_name, value } — received ${describe(value)}. All three keys are required in one call: the row, the column and the new value are one decision, so they are never sent separately.`,
          );
        }

        const known = new Set(["row_id", "field_name", "value"]);
        const unknownKeys = Object.keys(value).filter((k) => !known.has(k));
        if (unknownKeys.length > 0) {
          throw new Error(
            `cell_value received unexpected key(s) [${unknownKeys.join(", ")}]. The shape is exactly { row_id, field_name, value } — nothing else is accepted, and a stray key usually means a whole row was sent where one cell was expected.`,
          );
        }
        if (!("value" in value)) {
          throw new Error(
            "cell_value is missing the `value` key. Send `value: null` to empty the cell — omitting it is not the same thing.",
          );
        }

        const rowId = value.row_id;
        const fieldName = value.field_name;
        if (typeof rowId !== "string" || rowId.trim().length === 0) {
          throw new Error(
            `cell_value.row_id must be the row's UUID string — received ${describe(rowId)}. Read it from the first column (row_id) of visible_data_csv, from full_table_json, or from current_row_id.`,
          );
        }
        if (typeof fieldName !== "string" || fieldName.trim().length === 0) {
          throw new Error(
            `cell_value.field_name must be a column's machine field name — received ${describe(fieldName)}. Read it from column_list's \`name\` (NOT \`display_name\`).`,
          );
        }

        const field = live.fields.find((f) => f.field_name === fieldName);
        if (!field) {
          const real = live.fields
            .map((f) => `${f.field_name} (shown as "${f.display_name}")`)
            .join(", ");
          throw new Error(
            `cell_value.field_name "${fieldName}" is not a column of this table. The real columns are: ${real || "(none loaded)"}. Send the MACHINE name from column_list.\`name\`, not the display header.`,
          );
        }

        const row = live.visibleRows.find((r) => r.id === rowId);
        if (!row) {
          throw new Error(
            `cell_value.row_id "${rowId}" is not one of the ${live.visibleRows.length} row(s) on the page currently on screen, so writing it would change data the user cannot see. Re-read visible_data_csv for the rows that ARE visible; if the row you want is on another page or hidden by the active search, ask the user to navigate to it first.`,
          );
        }

        const raw = value.value;
        if (
          raw !== null &&
          typeof raw !== "string" &&
          typeof raw !== "number" &&
          typeof raw !== "boolean"
        ) {
          throw new Error(
            `cell_value.value must be a string, number, boolean or null — received ${describe(raw)}. For a "json" or "array" column send the JSON as a STRING and it will be parsed.`,
          );
        }

        // Coerce exactly the way the user's own inline editing does.
        const normalized = normalizeCellValue(raw, field.data_type);

        // normalizeCellValue is deliberately forgiving for a human who is still
        // typing — it hands NaN and unparsed strings on to the server to judge.
        // An agent write gets no such benefit of the doubt: a value the column
        // cannot hold is refused here, before anything is stored.
        if (
          (field.data_type === "number" || field.data_type === "integer") &&
          (typeof normalized !== "number" || Number.isNaN(normalized))
        ) {
          throw new Error(
            `cell_value.value ${JSON.stringify(raw)} is not a valid ${field.data_type} for column "${fieldName}". Send a number (or null to empty the cell).`,
          );
        }
        if (field.data_type === "json" || field.data_type === "array") {
          if (typeof raw === "string" && raw.trim().length > 0) {
            try {
              JSON.parse(raw);
            } catch {
              throw new Error(
                `cell_value.value is not parseable JSON, and column "${fieldName}" is a "${field.data_type}" column. Send valid JSON as a string (e.g. ${field.data_type === "array" ? '"[\\"a\\", \\"b\\"]"' : '"{\\"key\\": \\"value\\"}"'}), or null to empty the cell.`,
              );
            }
          }
          if (
            field.data_type === "array" &&
            normalized !== null &&
            !Array.isArray(normalized)
          ) {
            throw new Error(
              `cell_value.value parsed to ${describe(normalized)}, but column "${fieldName}" is an "array" column. Send a JSON array.`,
            );
          }
        }

        const result = await upsertCell({
          tableId: live.tableId,
          rowId,
          fieldName,
          value: normalized,
        });
        if (isServiceFailure(result)) {
          throw new Error(
            `Could not write ${fieldName} on row ${rowId}: ${result.error}`,
          );
        }
        onCellSaved(rowId, fieldName, normalized);
      },
    }),
    [liveRef, onDescriptionSaved, onCellSaved],
  );
}
