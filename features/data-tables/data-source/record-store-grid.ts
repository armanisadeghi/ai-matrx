// features/data-tables/data-source/record-store-grid.ts — THE GRID PRIMITIVES' DOORS, CALLED BY NAME.
//
// `@ai-matrx/records` 0.57.0 carries a typed method for every grid primitive (colors,
// layout, row actions, autonumber, recordChangeTrigger) and `record-store.ts` calls them there.
// Two doors are left here because the client has no method for them yet, called the way
// `features/record-change-approvals/applyRecordChange.ts` calls `work_approval_*`: through
// the SAME data source the records client uses, schema `custom`, with the store's refusal
// mapped by the package's own `mapPgError`:
//   custom.record_change_actions  — lane GRID-PORT's presence door for G8 (not in the catalogue)
//   custom.migrate_retype         — in the catalogue, no client method
// 🚨 SWAP WHEN WRAPPED: each becomes a one-line client call and this file goes away.
//
// A door that is not on the database this browser talks to (production before
// the 01:00–04:00 PT apply) answers PGRST202; that is mapped to ONE sentence a
// person can read, and the grid shows the capability as absent — never a dead
// control that fails when pressed.

import { mapPgError } from "@ai-matrx/records/core";
import type { RecordsError } from "@ai-matrx/records";
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

// ─── G8: a row change can start an agent ─────────────────────────────────────

export type RecordChangeActions = {
  entity_type: string;
  table_id: string;
  actions: Array<{ value: string; label: string }>;
};

/**
 * The changes an `event` schedule on this Table may listen for
 * (`custom.record_change_actions`, lane GRID-PORT, applied right after G8). The door being
 * there IS the signal that G8 is: before it, a record-store row change reaches no schedule,
 * so the grid offers nothing rather than a schedule that never fires.
 */
export function recordChangeActions(home: RecordStoreHome, tableId: string) {
  return callGridDoor<RecordChangeActions>(home, "record_change_actions", { p_table_id: tableId });
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
