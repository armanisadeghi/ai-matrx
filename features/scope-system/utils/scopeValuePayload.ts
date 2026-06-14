import type { ContextValueType } from "@/features/scope-system/redux/contextItemsSlice";

/** The value_* columns a context-item cell can write to. */
export interface ScopeValueColumns {
  value_text?: string | null;
  value_number?: number | null;
  value_boolean?: boolean | null;
  value_json?: unknown;
  value_date?: string | null;
  value_document_url?: string | null;
}

/**
 * Route a value emitted by an input (string from a textarea/date, or a structured
 * object/array from a custom Smart-Input component) into the correct `value_*` column.
 * The ONE place this mapping lives — shared by inline autosave (`useScopeAutoSave`) and
 * the advanced editor (`EditScopeValueSheet`) so they can never disagree.
 *
 * Structured values (MediaRef, PicklistRefEnvelope, multi-select arrays) are stored
 * verbatim in `value_json`. Strings route by the item's `value_type`.
 */
export function buildScopeValuePayload(
  raw: unknown,
  valueType: ContextValueType,
): ScopeValueColumns {
  if (raw != null && typeof raw === "object") {
    return { value_json: raw };
  }

  const next = String(raw ?? "").trim();
  switch (valueType) {
    case "number": {
      const n = Number(next);
      if (next === "" || Number.isNaN(n)) return { value_text: next || null };
      return { value_number: n };
    }
    case "boolean": {
      const lower = next.toLowerCase();
      if (lower === "true" || lower === "yes" || lower === "1") {
        return { value_boolean: true };
      }
      if (lower === "false" || lower === "no" || lower === "0") {
        return { value_boolean: false };
      }
      return { value_text: next || null };
    }
    case "date":
      return { value_date: next || null };
    case "document":
      return { value_document_url: next || null };
    case "object":
    case "array":
      if (!next) return { value_json: null };
      try {
        return { value_json: JSON.parse(next) };
      } catch {
        return { value_text: next || null };
      }
    default:
      return { value_text: next || null };
  }
}
