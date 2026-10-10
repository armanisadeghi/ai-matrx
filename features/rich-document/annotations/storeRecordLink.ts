// features/rich-document/annotations/storeRecordLink.ts
//
// "LINK A RECORD…" BETWEEN TWO STORE RECORDS (CHAIR-UI-STORE item 3, 2026-10-03).
//
// The store refuses a free record → record edge — every edge out of a record names the relation
// column it belongs to (`custom._store_relation_edge_names_its_field`) — so the picker used to leave
// store records out whenever the target was itself a store record, and a person on a Patient could
// not find "Crown fitting" in Appointments by name. A link between two tables IS a link column, so
// this does what a person expects:
//   · the two tables already share a link column (either side) → the link is written through it
//     (`custom.record_update`, the ordinary write; the store makes the edge);
//   · they share none → the caller asks once, "Link through a new column on <table>", then this
//     declares the relation column (`custom.field_declare`, many records) and writes through it.
// Nothing is refused in silence: every refusal the store gives comes back as its own sentence.

import { storeDoors } from "@ai-matrx/records/core";
import { createClient } from "@/utils/supabase/client";

/** The table kernel's id: a constant of the store (records `KERNEL_TABLES`, "Table"). */
const TABLE_KERNEL = "11111111-0000-4000-8000-000000000001";

export interface StoreLinkEnd {
  recordId: string;
  tableId: string;
  tableName: string;
}

export type StoreLinkPlan =
  | {
      kind: "through";
      organizationId: string;
      /** The record whose link column is written. */
      holder: StoreLinkEnd;
      /** The record it will point at. */
      pointsAt: StoreLinkEnd;
      field: { key: string; label: string; multi: boolean };
      /** What the column holds now (ids), so a many column appends and a single one replaces. */
      current: string[];
    }
  | {
      kind: "new_column";
      organizationId: string;
      holder: StoreLinkEnd;
      pointsAt: StoreLinkEnd;
    };

interface FieldRow {
  id: string;
  data: { key?: string; label?: string; type?: string; relation_target?: string; multi?: boolean; deleted_at?: string | null };
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await storeDoors(createClient()).rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

function linkColumnTo(fields: FieldRow[], tableId: string): FieldRow | undefined {
  return fields.find((f) => f.data?.type === "relation" && f.data?.relation_target === tableId);
}

function idsIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return typeof value === "string" && value !== "" ? [value] : [];
}

async function tableNames(organizationId: string, tableIds: string[]): Promise<Record<string, string>> {
  const rows = await rpc<Array<{ id: string; document: { name?: string } | null }>>("read_records_by_ids", {
    p_organization_id: organizationId,
    p_table_id: TABLE_KERNEL,
    p_record_ids: tableIds,
  });
  return Object.fromEntries((rows ?? []).map((r) => [r.id, r.document?.name ?? "that table"]));
}

/**
 * HOW THE LINK WOULD BE MADE — read only. `target` is the record "Link a record…" was opened on;
 * `picked` the record chosen in the picker (its organization comes from the store's search row).
 */
export async function planStoreRecordLink(args: {
  organizationId: string;
  target: { recordId: string; tableId?: string | null };
  picked: { recordId: string };
}): Promise<StoreLinkPlan> {
  const { organizationId } = args;
  const [targetTable, pickedTable] = await Promise.all([
    args.target.tableId ?? rpc<string>("record_table", { p_organization_id: organizationId, p_record_id: args.target.recordId }),
    rpc<string>("record_table", { p_organization_id: organizationId, p_record_id: args.picked.recordId }),
  ]);
  if (!targetTable || !pickedTable) throw new Error("Those two records are not in tables this organization keeps, so they cannot be linked.");
  const [targetFields, pickedFields, names] = await Promise.all([
    rpc<FieldRow[]>("applicable_fields", { p_organization_id: organizationId, p_table_id: targetTable }),
    targetTable === pickedTable
      ? Promise.resolve<FieldRow[] | null>(null)
      : rpc<FieldRow[]>("applicable_fields", { p_organization_id: organizationId, p_table_id: pickedTable }),
    tableNames(organizationId, [...new Set([targetTable, pickedTable])]),
  ]);
  const target: StoreLinkEnd = { recordId: args.target.recordId, tableId: targetTable, tableName: names[targetTable] ?? "this table" };
  const picked: StoreLinkEnd = { recordId: args.picked.recordId, tableId: pickedTable, tableName: names[pickedTable] ?? "that table" };

  // The target's own column first (the link lands on the record the person is looking at), then
  // the picked table's column pointing back.
  const own = linkColumnTo(targetFields ?? [], pickedTable);
  const back = own ? undefined : linkColumnTo(pickedFields ?? targetFields ?? [], targetTable);
  const chosen = own ? { field: own, holder: target, pointsAt: picked } : back ? { field: back, holder: picked, pointsAt: target } : null;
  if (!chosen) return { kind: "new_column", organizationId, holder: target, pointsAt: picked };

  const rows = await rpc<Array<{ id: string; document: Record<string, unknown> | null }>>("read_records_by_ids", {
    p_organization_id: organizationId,
    p_table_id: chosen.holder.tableId,
    p_record_ids: [chosen.holder.recordId],
  });
  const key = String(chosen.field.data.key ?? "");
  return {
    kind: "through",
    organizationId,
    holder: chosen.holder,
    pointsAt: chosen.pointsAt,
    field: { key, label: chosen.field.data.label || key, multi: chosen.field.data.multi === true },
    current: idsIn(rows?.[0]?.document?.[key]),
  };
}

/** A single link column that already points somewhere else: writing replaces what it holds. */
export function linkReplaces(plan: StoreLinkPlan): boolean {
  return plan.kind === "through" && !plan.field.multi && plan.current.length > 0 && !plan.current.includes(plan.pointsAt.recordId);
}

/** Already linked through that column: nothing to write. */
export function alreadyLinked(plan: StoreLinkPlan): boolean {
  return plan.kind === "through" && plan.current.includes(plan.pointsAt.recordId);
}

/** The column a new link column is called: the table it points at. */
export function newColumnLabel(plan: StoreLinkPlan): string {
  return plan.pointsAt.tableName;
}

/** Make the link the plan describes. Throws the store's own sentence when it refuses. */
export async function writeStoreRecordLink(plan: StoreLinkPlan): Promise<void> {
  if (alreadyLinked(plan)) return;
  let key: string;
  let next: string[] | string;
  if (plan.kind === "new_column") {
    const fieldId = await rpc<string>("field_declare", {
      p_organization_id: plan.organizationId,
      p_table_id: plan.holder.tableId,
      p_spec: {
        label: newColumnLabel(plan),
        type: "relation",
        relation_target: plan.pointsAt.tableId,
        multi: true,
        on_target_delete: "set_null",
      },
    });
    const fields = await rpc<FieldRow[]>("applicable_fields", { p_organization_id: plan.organizationId, p_table_id: plan.holder.tableId });
    const made = (fields ?? []).find((f) => f.id === fieldId);
    if (!made?.data?.key) throw new Error("The store made the link column and the table does not show it yet. Nothing was linked; try again.");
    key = made.data.key;
    next = [plan.pointsAt.recordId];
  } else {
    key = plan.field.key;
    next = plan.field.multi ? [...plan.current, plan.pointsAt.recordId] : plan.pointsAt.recordId;
  }
  await rpc<number>("record_update", {
    p_organization_id: plan.organizationId,
    p_record_id: plan.holder.recordId,
    p_patch: { [key]: next },
  });
}
