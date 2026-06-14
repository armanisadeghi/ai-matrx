/**
 * features/page-extraction/utils/columns.ts
 *
 * The template column schema is the durable table definition. These
 * helpers parse it, seed it from an agent's structured-output schema, and
 * resolve a column's value from a result row according to the column's
 * source.
 *
 * Storage shape on `page_extraction_jobs.output_schema`:
 *   { kind: "extraction_columns", columns: ExtractionColumn[] }
 *
 * Anything else (the legacy bare JSON-schema, or an empty
 * `{type:"object",properties:{}}`) is treated as "no template schema" —
 * the table inherits the agent's schema / infers from data instead.
 */

import type {
  ColumnSource,
  ColumnType,
  ExtractionColumn,
  Json,
  PageExtractionResult,
  TemplateColumnsSchema,
} from "@/features/page-extraction/types";

export const SYSTEM_PAGE_COLUMN_KEY = "__page__";

// ───────────────────────────────────────────────────────────────────────────
// The wrapping rule — THE single source of truth.
//
// LLM providers disagree about how to return a list: some emit a bare array
// (`[ {...}, {...} ]`), others require it wrapped under one key
// (`{ "items": [ ... ] }`, `{ "results": [ ... ] }`, …). Every surface in this
// feature that has to make sense of that ambiguity goes through the helpers
// below so the rule can never drift between two places:
//
//   • schema side  → `findItemProperties` (the template editor's
//     "Import columns from agent" path) derives COLUMNS from the agent's
//     JSON Schema, unwrapping the same single-array-of-objects shape.
//   • data side    → `coerceToRowList` turns a parsed RESPONSE value into the
//     list of result rows. It is the exact frontend twin of the backend's
//     `_coerce_to_row_list` (aidream/api/routers/page_extraction.py); both
//     implement one contract so the layers can never disagree about what a
//     row is.
// ───────────────────────────────────────────────────────────────────────────

/** True for a non-null, non-array object. */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Turn a parsed LLM value into the canonical list of result rows.
 *
 * Accepts, in order:
 *   - an array            → its plain-object elements
 *   - an object wrapping exactly ONE array-of-objects property
 *                         → that inner array (e.g. `{ items: [...] }`)
 *   - any other object    → `[object]` (treated as a single row)
 *   - null / primitives   → `[]`
 *
 * Behaviorally identical to the backend `_coerce_to_row_list`. Keep them in
 * lock-step: a change here without the same change there reintroduces the
 * "results never show up" class of bug.
 */
export function coerceToRowList(value: unknown): Record<string, unknown>[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.filter(isPlainObject);
  }
  if (isPlainObject(value)) {
    const arrayProps = Object.values(value).filter(
      (v) => Array.isArray(v) && v.every(isPlainObject),
    ) as Record<string, unknown>[][];
    if (arrayProps.length === 1) return arrayProps[0].slice();
    return [value];
  }
  return [];
}

/**
 * A STORED result row should always be a single flat object (the backend
 * unwraps before persisting). This narrowly detects a row that slipped
 * through still wrapped — exactly one own key whose value is an
 * array-of-objects, e.g. `{ items: [...] }`. The single-key guard is what
 * keeps a legitimate flat row that merely *contains* a nested array
 * (`{ DATE: "…", diagnoses: [ {...} ] }`) from being mistaken for a wrapper.
 */
function isPureRowWrapper(payload: Record<string, Json>): boolean {
  const keys = Object.keys(payload);
  if (keys.length !== 1) return false;
  const v = payload[keys[0]];
  return Array.isArray(v) && v.every(isPlainObject);
}

/**
 * Defensive normalization for the Results table. With today's backend every
 * row is already flat, so this is a no-op — but if a wrapper ever reaches the
 * display (a backend regression, a different extraction microservice), this
 * unwraps it via the shared rule and reports how many rows it had to recover
 * so the caller can scream. A wrapped row expands into one display row per
 * inner item; an empty wrapper (`{ items: [] }`) contributes none.
 */
export function normalizeResultRows(results: PageExtractionResult[]): {
  rows: PageExtractionResult[];
  unwrappedCount: number;
} {
  let unwrappedCount = 0;
  const rows: PageExtractionResult[] = [];
  for (const r of results) {
    const payload = (r.payload ?? {}) as Record<string, Json>;
    if (!isPureRowWrapper(payload)) {
      rows.push(r);
      continue;
    }
    unwrappedCount++;
    const inner = coerceToRowList(payload) as Record<string, Json>[];
    inner.forEach((p, i) => {
      rows.push({
        ...r,
        id: inner.length === 1 ? r.id : `${r.id}#${i}`,
        payload: p,
      });
    });
  }
  return { rows, unwrappedCount };
}

/**
 * Infer ordered column keys from result rows (union of payload keys, by first
 * appearance). The single fallback used by both the single-template and
 * All-extractions tables when there is no template column schema.
 */
export function inferColumnsFromRows(
  results: PageExtractionResult[],
): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    const payload = (r.payload ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(payload)) {
      if (!seen.has(key)) {
        seen.add(key);
        ordered.push(key);
      }
    }
  }
  return ordered;
}

/** Human-friendly label from a snake/kebab/camel key. */
export function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Parse the template's output_schema into a column list, or null when
 *  there's no usable template schema. */
export function parseTemplateColumns(
  outputSchema: unknown,
): ExtractionColumn[] | null {
  if (!outputSchema || typeof outputSchema !== "object") return null;
  const s = outputSchema as Partial<TemplateColumnsSchema>;
  if (s.kind === "extraction_columns" && Array.isArray(s.columns)) {
    return s.columns.filter(
      (c): c is ExtractionColumn =>
        !!c && typeof c.key === "string" && c.key.length > 0,
    );
  }
  return null;
}

export function buildTemplateSchema(
  columns: ExtractionColumn[],
): TemplateColumnsSchema {
  return { kind: "extraction_columns", columns };
}

/**
 * Pull the per-item property definitions out of an agent's structured
 * output_schema and turn them into agent-source columns.
 *
 * Handles the common shapes:
 *   - OpenAI json_schema: { name, schema: {...}, strict }
 *   - object with a single array-of-objects property (e.g. { items: [...] })
 *   - a bare object schema (treated as one row's shape)
 */
export function importColumnsFromAgentSchema(
  agentOutputSchema: unknown,
): ExtractionColumn[] {
  const itemProps = findItemProperties(agentOutputSchema);
  if (!itemProps) return [];
  const out: ExtractionColumn[] = [];
  for (const [key, propRaw] of Object.entries(itemProps)) {
    const prop = (propRaw ?? {}) as {
      type?: string;
      description?: string;
    };
    out.push({
      key,
      label: humanizeKey(key),
      type: normalizeType(prop.type),
      description: prop.description,
      source: "agent",
      agentField: key,
    });
  }
  return out;
}

function normalizeType(t: string | undefined): ColumnType {
  if (t === "number") return "number";
  if (t === "integer") return "integer";
  if (t === "boolean") return "boolean";
  return "string";
}

/** Walk a possibly-wrapped JSON schema to the object that describes ONE
 *  result row, and return its `properties` map. This is the schema-side twin
 *  of `coerceToRowList` (which does the same unwrapping on response DATA):
 *  both understand the "array, or array wrapped under one key" shape so the
 *  template editor's columns and the actual rows can never disagree. */
function findItemProperties(schema: unknown): Record<string, unknown> | null {
  if (!schema || typeof schema !== "object") return null;
  // Unwrap the OpenAI json_schema envelope: { name, schema, strict }.
  const env = schema as { schema?: unknown };
  const root = (env.schema ?? schema) as {
    type?: string;
    properties?: Record<string, unknown>;
    items?: unknown;
  };
  if (!root || typeof root !== "object") return null;

  // Array of objects → use the element's properties.
  if (root.type === "array" && root.items) {
    const items = root.items as { properties?: Record<string, unknown> };
    if (items.properties) return items.properties;
  }

  if (root.type === "object" && root.properties) {
    // If the object wraps a single array-of-objects property, descend.
    const arrayChild = Object.values(root.properties).find((p) => {
      const pp = p as { type?: string; items?: unknown };
      return pp?.type === "array" && pp.items;
    }) as { items?: { properties?: Record<string, unknown> } } | undefined;
    if (arrayChild?.items?.properties) return arrayChild.items.properties;
    // Otherwise treat the object itself as one row's shape.
    return root.properties;
  }
  return null;
}

/**
 * Resolve a column's display/edit value from a result row.
 *
 * - agent      → payload[agentField ?? key]
 * - validation → payload[key]
 * - manual     → payload[key]
 * - system     → derived from row fields (page anchor today)
 */
export function cellValueFor(
  row: PageExtractionResult,
  col: ExtractionColumn,
): unknown {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  switch (col.source) {
    case "agent":
      return payload[col.agentField ?? col.key];
    case "system":
      // Only one system column today: the page anchor.
      return row.canonical_page ?? (row.source_pages ?? []).join(", ");
    case "validation":
    case "manual":
    default:
      return payload[col.key];
  }
}

/**
 * Build the "merge view" from a result set that a validation pass has
 * soft-flagged for duplicates.
 *
 * A duplicate row carries `payload.is_duplicate === true` and
 * `payload.canonical_entry === <canonical result id>`. Rather than just
 * hiding duplicates, the merge view ABSORBS each duplicate into its
 * canonical row: any field the canonical row is missing (null / "" /
 * undefined) is back-filled from a duplicate that has it. This is the
 * "take the complete copy's details" behavior — e.g. a report split
 * across a chunk boundary leaves the canonical entry missing some
 * details that its duplicate captured.
 *
 * Returns the canonical/standalone rows (duplicates removed) with merged
 * payloads, plus a map of canonicalId → how many duplicates folded in
 * (for the "+N merged" badge).
 */
export function buildMergedDuplicateView(results: PageExtractionResult[]): {
  rows: PageExtractionResult[];
  mergedCountById: Map<string, number>;
} {
  const dupesByCanonical = new Map<string, PageExtractionResult[]>();
  for (const r of results) {
    const p = r.payload ?? {};
    if (p.is_duplicate && typeof p.canonical_entry === "string") {
      const arr = dupesByCanonical.get(p.canonical_entry) ?? [];
      arr.push(r);
      dupesByCanonical.set(p.canonical_entry, arr);
    }
  }

  const rows: PageExtractionResult[] = [];
  const mergedCountById = new Map<string, number>();

  for (const r of results) {
    const p = r.payload ?? {};
    if (p.is_duplicate) continue; // absorbed into its canonical row

    const dupes = dupesByCanonical.get(r.id);
    if (!dupes || dupes.length === 0) {
      rows.push(r);
      continue;
    }

    const merged: Record<string, Json> = { ...p };
    for (const d of dupes) {
      const dp = d.payload ?? {};
      for (const [k, v] of Object.entries(dp)) {
        if (k === "is_duplicate" || k === "canonical_entry") continue;
        const cur = merged[k];
        if (cur == null || cur === "") merged[k] = v;
      }
    }
    rows.push({ ...r, payload: merged });
    mergedCountById.set(r.id, dupes.length);
  }

  return { rows, mergedCountById };
}

export const COLUMN_SOURCE_META: Record<
  ColumnSource,
  { label: string; hint: string; editable: boolean }
> = {
  agent: {
    label: "Agent",
    hint: "Filled from the extraction agent's output. Double-click to override.",
    editable: true,
  },
  validation: {
    label: "Validation",
    hint: "Filled by a later validation/dedup pass. Double-click to override.",
    editable: true,
  },
  manual: {
    label: "Manual",
    hint: "Filled by a human in the Results table. Double-click to edit.",
    editable: true,
  },
  system: {
    label: "System",
    hint: "Page anchor filled automatically by the pipeline. Read-only.",
    editable: false,
  },
};

/**
 * The payload key a cell edit must WRITE to for a given column. Reads
 * (`cellValueFor`) and writes have to agree: `agent` columns read from
 * `payload[agentField ?? key]`, everything else from `payload[key]`. System
 * columns are not writable (the page anchor isn't a payload field).
 */
export function editKeyFor(col: ExtractionColumn): string | null {
  if (col.source === "system") return null;
  if (col.source === "agent") return col.agentField ?? col.key;
  return col.key;
}
