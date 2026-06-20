"use client";

/**
 * Matrx Envelope — reference resolver registry.
 *
 * The data-driven mirror of the renderer registry, for the `reference` kind:
 * one entry per reference `type` describes (a) how to fetch the LIVE value from
 * Supabase and (b) which underlying entity clicking opens (reusing the
 * item-presentation opener via its `KnownItemType` discriminant).
 *
 * Adding a new reference type later = one entry here. No switch to edit, no new
 * opener if the item-presentation registry already has the entity's window.
 *
 * Every resolver is defensive: it NEVER throws (the chip wraps it too), and a
 * missing row / soft error returns `undefined` so the chip falls back to the
 * item's display hint. UUID-guarding happens at the call site (`ReferenceChip`).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { KnownItemType } from "@/features/item-presentation/types";
import type { ReferenceItem } from "@/features/matrx-envelope/envelope";

export interface ReferenceResolver {
  /**
   * Fetch the live, human-readable value for this reference from Supabase.
   * Returns `undefined` on miss / soft error (chip falls back to display.label).
   * Keep defensive — never throw.
   */
  resolveValue: (
    supabase: SupabaseClient,
    ref: Record<string, string>,
  ) => Promise<string | undefined>;
  /** The item-presentation type to reuse for opening the underlying entity. */
  openItemType: KnownItemType;
  /** The id of the underlying entity to open (the picklist / dataset, not the cell). */
  openId: (ref: Record<string, string>) => string | undefined;
}

const stringify = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : undefined;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return undefined;
  }
};

/** Live value of a single dataset-row cell: `udt_dataset_rows.data[column]`. */
async function resolveCell(
  supabase: SupabaseClient,
  rowId: string | undefined,
  column: string | undefined,
): Promise<string | undefined> {
  if (!rowId || !column) return undefined;
  const { data, error } = await supabase
    .from("udt_dataset_rows")
    .select("data")
    .eq("id", rowId)
    .maybeSingle();
  if (error || !data) return undefined;
  const cells = (data as { data?: Record<string, unknown> | null }).data;
  if (!cells || typeof cells !== "object") return undefined;
  return stringify(cells[column]);
}

/**
 * The 7-type reference resolver registry (+ the `dataset_cell` legacy alias).
 * Every `ref` passed in is the FLAT canonical item (string-coerced): identity
 * ids live at the top level (`ref.list_id`, `ref.table_id`, …), NOT under a
 * nested `ref` object.
 */
const RESOLVERS: Record<string, ReferenceResolver> = {
  // ── Picklist family ────────────────────────────────────────────────────────
  /** `picklist` → { list_id }. Live value = the list name. */
  picklist: {
    openItemType: "picklist",
    openId: (ref) => ref.list_id,
    resolveValue: async (supabase, ref) => {
      if (!ref.list_id) return undefined;
      const { data, error } = await supabase
        .from("udt_picklists")
        .select("list_name, description")
        .eq("id", ref.list_id)
        .maybeSingle();
      if (error || !data) return undefined;
      const row = data as { list_name?: string | null; description?: string | null };
      return stringify(row.list_name) ?? stringify(row.description);
    },
  },

  /** `picklist_group` → { list_id, group_name }. Live value = the group name. */
  picklist_group: {
    openItemType: "picklist",
    openId: (ref) => ref.list_id,
    resolveValue: async (_supabase, ref) => stringify(ref.group_name),
  },

  /**
   * `picklist_item` → { list_id, item_id }. Live value = the item's description
   * (fallback to its label). Opens the picklist (`list_id`).
   */
  picklist_item: {
    openItemType: "picklist",
    openId: (ref) => ref.list_id,
    resolveValue: async (supabase, ref) => {
      if (!ref.item_id) return undefined;
      const { data, error } = await supabase
        .from("udt_picklist_items")
        .select("description, label")
        .eq("id", ref.item_id)
        .maybeSingle();
      if (error || !data) return undefined;
      const row = data as { description?: string | null; label?: string | null };
      return stringify(row.description) ?? stringify(row.label);
    },
  },

  // ── Table (udt dataset) family ─────────────────────────────────────────────
  /** `table` → { table_id }. Live value = the table name. */
  table: {
    openItemType: "table",
    openId: (ref) => ref.table_id,
    resolveValue: async (supabase, ref) => {
      if (!ref.table_id) return undefined;
      const { data, error } = await supabase
        .from("udt_datasets")
        .select("table_name, description")
        .eq("id", ref.table_id)
        .maybeSingle();
      if (error || !data) return undefined;
      const row = data as { table_name?: string | null; description?: string | null };
      return stringify(row.table_name) ?? stringify(row.description);
    },
  },

  /**
   * `table_column` → { table_id, column_name }. Live value = the column's
   * display name (fallback to its raw field name).
   */
  table_column: {
    openItemType: "table",
    openId: (ref) => ref.table_id,
    resolveValue: async (supabase, ref) => {
      if (!ref.table_id || !ref.column_name) return undefined;
      const { data, error } = await supabase
        .from("udt_dataset_fields")
        .select("display_name, field_name")
        .eq("table_id", ref.table_id)
        .eq("field_name", ref.column_name)
        .maybeSingle();
      if (error || !data) return stringify(ref.column_name);
      const row = data as { display_name?: string | null; field_name?: string | null };
      return stringify(row.display_name) ?? stringify(row.field_name) ?? stringify(ref.column_name);
    },
  },

  /**
   * `table_row` → { table_id, row_id }. Live value = a compact preview of the
   * row's cell values (first few), enough to identify it in a chip.
   */
  table_row: {
    openItemType: "table",
    openId: (ref) => ref.table_id,
    resolveValue: async (supabase, ref) => {
      if (!ref.row_id) return undefined;
      const { data, error } = await supabase
        .from("udt_dataset_rows")
        .select("data")
        .eq("id", ref.row_id)
        .maybeSingle();
      if (error || !data) return undefined;
      const cells = (data as { data?: Record<string, unknown> | null }).data;
      if (!cells || typeof cells !== "object") return undefined;
      const preview = Object.values(cells)
        .map((v) => stringify(v))
        .filter((v): v is string => !!v)
        .slice(0, 3)
        .join(" · ");
      return preview.length > 0 ? preview : undefined;
    },
  },

  /**
   * `table_cell` → { table_id, row_id, column_name }. Live value = the row's
   * `data[column_name]` cell. Opens the table (`table_id`).
   */
  table_cell: {
    openItemType: "table",
    openId: (ref) => ref.table_id,
    resolveValue: async (supabase, ref) =>
      resolveCell(supabase, ref.row_id, ref.column_name),
  },

  /**
   * `dataset_cell` — LEGACY alias of `table_cell`. Old ids were
   * `{ dataset_id, row_id, field_name }`; tolerate the canonical
   * `{ table_id, row_id, column_name }` too.
   */
  dataset_cell: {
    openItemType: "table",
    openId: (ref) => ref.dataset_id ?? ref.table_id,
    resolveValue: async (supabase, ref) =>
      resolveCell(supabase, ref.row_id, ref.field_name ?? ref.column_name),
  },
};

/** Resolve a reference `type` to its resolver, or `undefined` (graceful chip). */
export function getReferenceResolver(type: string): ReferenceResolver | undefined {
  return RESOLVERS[type];
}

/**
 * Coerce a model-produced `ref` into the `Record<string, string>` the resolvers
 * assume. The envelope is LLM JSON, so a value can arrive as a number/bool/null
 * — `.eq("id", 123)` would then silently miss. We stringify scalars (loud-on-
 * malformed per the recovery doctrine) and drop non-scalars.
 */
export function coerceRefToStrings(
  ref: unknown,
  context: string,
): Record<string, string> {
  if (!ref || typeof ref !== "object" || Array.isArray(ref)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(ref as Record<string, unknown>)) {
    if (typeof v === "string") {
      out[k] = v;
    } else if (typeof v === "number" || typeof v === "boolean") {
      // A non-string id is recoverable but a sign the producer is off-contract.
      console.warn(`[matrx-reference] ${context}: ref.${k} was ${typeof v}, coerced to string`);
      out[k] = String(v);
    }
  }
  return out;
}

const humanizeType = (type: string): string =>
  type
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

/**
 * The display hint an item carries (flat: `label`, else a few other readable
 * hints), trimmed; else a humanized type. The canonical item is flat — there is
 * no nested `display`.
 */
export function referenceFallbackLabel(item: ReferenceItem, type: string): string {
  const hints = item as unknown as Record<string, unknown>;
  for (const key of ["label", "column_display_name", "table_name", "list_name", "description"]) {
    const v = hints[key];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return humanizeType(type);
}
