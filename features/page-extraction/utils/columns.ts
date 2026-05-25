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
 *  result row, and return its `properties` map. */
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
    hint: "Filled from the extraction agent's output.",
    editable: false,
  },
  validation: {
    label: "Validation",
    hint: "Filled by a later validation/dedup pass (Push 2).",
    editable: false,
  },
  manual: {
    label: "Manual",
    hint: "Filled by a human in the Results table.",
    editable: true,
  },
  system: {
    label: "System",
    hint: "Filled automatically by the pipeline.",
    editable: false,
  },
};
