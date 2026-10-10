/**
 * The pure half of the scope detail surface (`ScopeDetailSurface.tsx`): how a context value reads
 * as text for an agent, which items can be set from text, and how an agent names an item.
 * No React, no store — unit-tested in `__tests__/scope-detail-values.test.ts`.
 */

import type { ScopeContextRow } from "@/features/scopes/redux/scopeContextView";

/** Value types a person sets through a structured control, never from plain text. */
const STRUCTURED_TYPES = new Set(["reference", "currency", "media", "document", "picklist", "json", "object", "array"]);

/** The cell as text (JSON for a structured value), or null when it holds nothing. */
export function scopeValueText(row: ScopeContextRow): string | null {
  if (!row.has_value) return null;
  if (row.value_text != null) return row.value_text;
  if (row.value_number != null) return String(row.value_number);
  if (row.value_boolean != null) return row.value_boolean ? "true" : "false";
  if (row.value_date != null) return row.value_date;
  if (row.value_timestamp != null) return row.value_timestamp;
  if (row.value_time != null) return row.value_time;
  if (row.value_document_url != null) return row.value_document_url;
  if (row.value_json != null) {
    try {
      return JSON.stringify(row.value_json);
    } catch {
      return null;
    }
  }
  return null;
}

/** An item an agent may set by text: no smart-input component, no structured value type. */
export function settableByText(row: Pick<ScopeContextRow, "custom_component" | "value_type">): boolean {
  return !row.custom_component && !STRUCTURED_TYPES.has(String(row.value_type));
}

/** The item an agent named by `item_id` or `slug` (id wins), or null. */
export function valueFor(rows: readonly ScopeContextRow[], itemId: unknown, slug: unknown): ScopeContextRow | null {
  if (typeof itemId === "string" && itemId) return rows.find((r) => r.item_id === itemId) ?? null;
  if (typeof slug === "string" && slug) return rows.find((r) => r.slug === slug || r.key === slug) ?? null;
  return null;
}
