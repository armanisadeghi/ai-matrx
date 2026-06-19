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
 * missing row / soft error returns `undefined` so the chip falls back to
 * `display.label`. UUID-guarding happens at the call site (`ReferenceChip`).
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

const RESOLVERS: Record<string, ReferenceResolver> = {
  /**
   * `picklist_item` → ref { list_id, item_id }. Live value is the picklist
   * item's description (fallback to its label). The entity to open is the
   * picklist (`list_id`).
   */
  picklist_item: {
    openItemType: "picklist",
    openId: (ref) => ref.list_id,
    resolveValue: async (supabase, ref) => {
      const itemId = ref.item_id;
      if (!itemId) return undefined;
      const { data, error } = await supabase
        .from("udt_picklist_items")
        .select("description, label")
        .eq("id", itemId)
        .maybeSingle();
      if (error || !data) return undefined;
      const row = data as { description?: string | null; label?: string | null };
      return stringify(row.description) ?? stringify(row.label);
    },
  },

  /**
   * `dataset_cell` → ref { dataset_id, row_id, field_name }. Live value is the
   * row's `data[field_name]` cell. The entity to open is the dataset/table
   * (`dataset_id`). The row table FK column is `table_id` (= dataset id), and
   * the row is keyed by its own `id` (= `row_id`).
   */
  dataset_cell: {
    openItemType: "table",
    openId: (ref) => ref.dataset_id,
    resolveValue: async (supabase, ref) => {
      const rowId = ref.row_id;
      const fieldName = ref.field_name;
      if (!rowId || !fieldName) return undefined;
      const { data, error } = await supabase
        .from("udt_dataset_rows")
        .select("data")
        .eq("id", rowId)
        .maybeSingle();
      if (error || !data) return undefined;
      const cells = (data as { data?: Record<string, unknown> | null }).data;
      if (!cells || typeof cells !== "object") return undefined;
      return stringify(cells[fieldName]);
    },
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

/** The label an item carries (agent-provided), trimmed; else a humanized type. */
export function referenceFallbackLabel(item: ReferenceItem, type: string): string {
  const label = item?.display?.label;
  return typeof label === "string" && label.trim().length > 0
    ? label.trim()
    : humanizeType(type);
}
