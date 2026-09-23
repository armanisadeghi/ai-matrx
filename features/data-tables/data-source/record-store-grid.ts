// features/data-tables/data-source/record-store-grid.ts — THE GRID PRIMITIVES' DOORS, CALLED BY NAME.
//
// Lane GRID-PRIMITIVES gave the record store the doors the older grid needs
// (colors, the layout knob, row actions, autonumber) and `@ai-matrx/records`
// 0.56.0 a typed method for each — but the package checks every call against the
// door list GENERATED AT ITS LAST PUBLISH, and those doors enter that list only
// when `records:generate` runs after the production apply (01:00–04:00 PT). Until
// then every one of those methods answers `door_absent` WITHOUT asking, even on a
// database that has the door. So the grid calls them the way
// `features/record-change-approvals/applyRecordChange.ts` calls `work_approval_*`:
// through the SAME data source the records client uses, schema `custom`, with the
// package's own result TYPES and the store's refusal mapped by the package's own
// `mapPgError`. `custom.migrate_retype` has no client method at all.
//
// 🚨 SWAP ON REGENERATE. Once `@ai-matrx/records` ships with these doors in its
// generated list, each function below becomes a one-line call to
// `tableDecorations` / `tableDecorate` / `gridLayout` / `rowActions` /
// `actionDeclare` / `actionRun` / `autonumberBackfill`, and this file keeps only
// `migrateRetype` until the client wraps it too.
//
// A door that is not on the database this browser talks to (production before
// the 01:00–04:00 PT apply) answers PGRST202; that is mapped to ONE sentence a
// person can read, and the grid shows the capability as absent — never a dead
// control that fails when pressed.

import { mapPgError } from "@ai-matrx/records/core";
import type {
  ActionRunResult,
  DecorationPath,
  GridLayout,
  RecordsError,
  RowAction,
  TableDecorations,
} from "@ai-matrx/records";
import { recordsDataSource } from "@ai-matrx/records-ui";

import { createClient } from "@/utils/supabase/client";

import type { RecordStoreHome } from "./table-home";

type DoorAnswer<T> = { ok: true; data: T } | { ok: false; error: RecordsError; absent: boolean };

const ABSENT_CODES = new Set(["PGRST202", "42883"]);

let source: ReturnType<typeof recordsDataSource> | null = null;
function dataSource() {
  source ??= recordsDataSource(createClient());
  return source;
}

/** Call one `custom.*` door by name, as the records client would. */
export async function callGridDoor<T>(
  home: RecordStoreHome,
  door: string,
  args: Record<string, unknown>,
): Promise<DoorAnswer<T>> {
  const answer = (await dataSource().rpc(door, { p_organization_id: home.organizationId, ...args }, { schema: "custom" })) as {
    data: unknown;
    error: { message: string; code?: string; hint?: string; details?: string } | null;
  };
  if (answer.error) {
    const absent = ABSENT_CODES.has(answer.error.code ?? "");
    const error = mapPgError(answer.error, `custom.${door}`);
    return {
      ok: false,
      absent,
      error: absent
        ? {
            ...error,
            message: `The record store this page is connected to does not have custom.${door} yet — it arrives with the grid primitives' database update (lane GRID-PRIMITIVES).`,
          }
        : error,
    };
  }
  return { ok: true, data: answer.data as T };
}

// ─── G1: colors and layout ───────────────────────────────────────────────────

export function tableDecorations(home: RecordStoreHome, tableId: string) {
  return callGridDoor<TableDecorations>(home, "table_decorations", { p_table_id: tableId });
}

export function tableDecorate(home: RecordStoreHome, tableId: string, path: DecorationPath, value: unknown) {
  return callGridDoor<TableDecorations>(home, "table_decorate", {
    p_table_id: tableId,
    p_path: path,
    p_value: value ?? null,
  });
}

export function gridLayout(home: RecordStoreHome, tableId: string) {
  return callGridDoor<GridLayout>(home, "grid_layout", { p_table_id: tableId, p_view_id: null });
}

// ─── G2: row actions ─────────────────────────────────────────────────────────

export function rowActions(home: RecordStoreHome, tableId: string) {
  return callGridDoor<{ actions: RowAction[]; stale: unknown[] }>(home, "row_actions", { p_table_id: tableId });
}

export function actionDeclare(home: RecordStoreHome, tableId: string, actions: readonly RowAction[]) {
  return callGridDoor<RowAction[]>(home, "action_declare", { p_table_id: tableId, p_actions: actions });
}

export function actionRun(home: RecordStoreHome, actionId: string, recordIds: readonly string[]) {
  return callGridDoor<ActionRunResult>(home, "action_run", { p_action_id: actionId, p_record_ids: [...recordIds] });
}

// ─── G5: autonumber ──────────────────────────────────────────────────────────

export function autonumberBackfill(home: RecordStoreHome, fieldId: string) {
  return callGridDoor<{ numbered: number; highest: number | null; says: string }>(home, "autonumber_backfill", {
    p_field_id: fieldId,
  });
}

// ─── the store's own verbs the published client does not wrap ───────────────

/** FLD-4 / T12: change what a field behaves as; values convert or are kept in `_retired`. */
export function migrateRetype(home: RecordStoreHome, fieldId: string, to: string) {
  return callGridDoor<{ changed: boolean; records_still_holding_a_value?: number; values_in_retired_for_this_field?: number }>(
    home,
    "migrate_retype",
    { p_id: fieldId, p_to: to },
  );
}
