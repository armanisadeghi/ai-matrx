// features/data-tables/data-source/record-store-shape.ts — THE RECORD STORE, IN THE GRID'S WORDS.
//
// Pure translation, no I/O. The grid speaks the older store's shapes (a
// `udt_dataset_fields` row per column, `{id, data}` per row, `metadata.format`
// for what a column MEANS); the record store speaks Fields and documents. This
// module is the dictionary between them, and it is the inverse of the mover that
// carried the older tables across (`aidream/packages/matrx-records/matrx_records/
// movers/typemap.py` + `user_tables.py`): a column the mover turned into
// `{type: "range", config: {kind: "number"}, format: "currency"}` comes back here
// as `data_type: "number"` with `metadata.format = {id: "currency"}` — which is
// what it was before it moved.
//
// WHAT IT NEVER DOES: invent a fact the store does not hold. A format option the
// move did not carry (a currency's code, a percent's scale) is absent here, not
// guessed, and `record-store.ts` names every such gap where a screen would see it.

import type { Field } from "@ai-matrx/records";

import type { FieldChoice, FieldFormatConfig, FieldFormatId } from "@/lib/field-formats/types";

import type { DatasetField, FieldDataType } from "../types";

/** The older store's shape of one column, reconstructed from the store's Field. */
export type OlderColumnShape = {
  data_type: FieldDataType;
  format: FieldFormatConfig | null;
};

const INTEGER_FORMATS = new Set<string>(["integer", "rating", "file_size"]);

/**
 * `config.kind` for a range, which the store keeps inside `config` and the older
 * store never had a word for (it was the storage type).
 */
function rangeKind(field: Pick<Field, "config">): string | null {
  const kind = (field.config ?? {})["kind"];
  return typeof kind === "string" ? kind : null;
}

/** The older storage type for a store Field. Total over the five behaviours plus boolean. */
export function olderDataType(field: Pick<Field, "type" | "config" | "format" | "multi">): FieldDataType {
  const behaviour = String(field.type);
  const format = field.format ?? null;
  switch (behaviour) {
    case "boolean":
      return "boolean";
    case "range": {
      const kind = rangeKind(field);
      if (kind === "date") return "date";
      if (kind === "datetime") return "datetime";
      return format && INTEGER_FORMATS.has(format) ? "integer" : "number";
    }
    case "list":
      return field.multi ? "array" : "string";
    case "text":
      if (field.multi) return "array";
      if (format === "json") return "json";
      return "string";
    // A relation stores a record id (text) and a formula stores nothing — the
    // older store typed both as strings, and so does the grid.
    case "relation":
    case "formula":
    default:
      return "string";
  }
}

/** Every format id the grid knows, so a store word the grid does not draw is dropped, never cast. */
const GRID_FORMAT_IDS = new Set<string>([
  "text", "long_text", "markdown", "email", "url", "address", "phone", "color",
  "number", "decimal", "currency", "percent", "progress", "duration",
  "integer", "rating", "file_size", "boolean", "choice", "multi_choice", "person",
  "relation", "date", "datetime", "time", "created_time", "modified_time",
  "autonumber", "relative_time", "json", "array", "tags", "attachment", "formula",
]);

/**
 * The column's display format, from the Field's own `format` word and the
 * pieces the store keeps elsewhere (a relation's target, a list's options, a
 * formula's text). `choices` is the list's option Table, already read.
 */
export function olderFormat(
  field: Pick<Field, "type" | "format" | "multi" | "relation_target" | "relation_max" | "on_target_delete"> & {
    expression?: unknown;
    config?: Record<string, unknown>;
  },
  choices: FieldChoice[] | null,
): FieldFormatConfig | null {
  const behaviour = String(field.type);
  const word = field.format ?? null;

  if (behaviour === "relation") {
    const options: NonNullable<FieldFormatConfig["options"]> = {};
    if (field.relation_target) options.relation_target = field.relation_target;
    if (typeof field.relation_max === "number") options.relation_max = field.relation_max;
    if (field.on_target_delete === "set_null" || field.on_target_delete === "restrict" || field.on_target_delete === "cascade") {
      options.on_delete = field.on_target_delete;
    }
    const id: FieldFormatId = word === "person" || word === "attachment" ? word : "relation";
    return { id, options };
  }
  if (behaviour === "list") {
    return {
      id: field.multi ? "multi_choice" : "choice",
      ...(choices ? { options: { choices } } : {}),
    };
  }
  const config = (field.config ?? {}) as Record<string, unknown>;
  const display = displayFormatOf(field);
  if (behaviour === "formula") {
    // G5: autonumber and the two record stamps are formula Fields with a system
    // expression; the grid draws them as the kinds they are.
    if (word === "autonumber" || word === "created_time" || word === "modified_time") return { id: word };
    // G3: the text a person typed is kept beside the expression the store runs.
    const expression =
      typeof config.formula_text === "string"
        ? config.formula_text
        : typeof field.expression === "string"
          ? field.expression
          : "";
    const resultFormat = display && display.id !== "formula" ? display.id : undefined;
    return { id: "formula", options: { formula: { expression, ...(resultFormat ? { resultFormat } : {}) } } };
  }
  // G5: a display format set on the store (`display_format: {id, options}`) is
  // the whole older format, options and all.
  if (display) return display;
  if (!word || !GRID_FORMAT_IDS.has(word)) return null;
  return { id: word as FieldFormatId };
}

/** `display_format: {id, options}` from the Field document, when it names a format the grid draws. */
function displayFormatOf(field: object): FieldFormatConfig | null {
  const raw = (field as { display_format?: unknown }).display_format;
  if (!raw || typeof raw !== "object") return null;
  const id = (raw as { id?: unknown }).id;
  if (typeof id !== "string" || !GRID_FORMAT_IDS.has(id)) return null;
  const options = (raw as { options?: unknown }).options;
  return options && typeof options === "object"
    ? { id: id as FieldFormatId, options: options as FieldFormatConfig["options"] }
    : { id: id as FieldFormatId };
}

/** The store's executable rules → the older `validation_rules` keys (`validation.ts`). */
export function olderValidationRules(rules: Field["rules"] | null | undefined): Record<string, unknown> | null {
  if (!Array.isArray(rules) || rules.length === 0) return null;
  const out: Record<string, unknown> = {};
  for (const rule of rules) {
    if (!rule || typeof rule !== "object") continue;
    switch (rule.kind) {
      case "min":
        out.min = rule.value;
        break;
      case "max":
        out.max = rule.value;
        break;
      case "pattern":
        out.pattern = rule.value;
        break;
      // The mover wrote the older `maxLength` as the store's `length`.
      case "length":
        out.maxLength = rule.value;
        break;
      default:
        // equals_field / differs_from_field have no older word; the store still
        // enforces them on every write, and its refusal names them.
        break;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** A store Field as the `udt_dataset_fields` row the grid draws a column from. */
export function olderColumnFromField(
  field: Field & { expression?: unknown },
  tableId: string,
  choices: FieldChoice[] | null,
): DatasetField {
  const format = olderFormat(field, choices);
  return {
    id: field.id,
    table_id: tableId,
    field_name: field.key,
    display_name: field.label || field.key,
    data_type: olderDataType(field),
    field_order: typeof field.sort === "number" ? field.sort : 0,
    is_required: Boolean(field.required),
    default_value: (field.default ?? null) as DatasetField["default_value"],
    validation_rules: olderValidationRules(field.rules) as DatasetField["validation_rules"],
    metadata: (format ? { format } : {}) as DatasetField["metadata"],
    organization_id: field.organization_id,
    user_id: (field.created_by ?? "") as string,
    created_by: (field.created_by ?? "") as string,
    updated_by: field.updated_by ?? null,
    created_at: field.created_at,
    updated_at: field.updated_at,
    version: field.version ?? 1,
    deleted_at: null,
    is_public: false,
    custom_fields: {},
  } as DatasetField;
}

/**
 * One option record of a list's option Table → one grid choice. `value` is what
 * the cell holds, and the store's read door answers a list cell with the option's
 * LABEL (its `_choices` side-map carries the id), so the label is the value.
 */
export function choiceFromOption(option: { data?: Record<string, unknown> | null }): FieldChoice | null {
  const data = option.data ?? {};
  const name = typeof data.name === "string" ? data.name : typeof data.label === "string" ? data.label : null;
  if (!name) return null;
  const color = typeof data.color === "string" && data.color.trim() !== "" ? data.color : undefined;
  return color ? { value: name, color } : { value: name };
}

/**
 * A record document as the older row's `data`. Keys the store adds for itself
 * (`_choices`, `_hidden`, `_alternates` …) are not columns and are left out; a
 * `json` column the store keeps as canonical JSON TEXT comes back as the object
 * the grid always held there.
 */
export function olderRowData(
  document: Record<string, unknown>,
  columns: ReadonlyArray<Pick<DatasetField, "field_name" | "data_type">>,
): Record<string, unknown> {
  const jsonKeys = new Set(columns.filter((c) => c.data_type === "json").map((c) => c.field_name));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(document)) {
    if (key.startsWith("_")) continue;
    if (jsonKeys.has(key) && typeof value === "string") {
      try {
        out[key] = JSON.parse(value);
        continue;
      } catch {
        // Not JSON after all — keep the text exactly as stored.
      }
    }
    out[key] = value;
  }
  return out;
}

/**
 * A value the grid wants written → what the store takes. A `json` column's
 * object is written as canonical JSON text (the store's `json` is a text Field
 * with format json — the mover did the same). Everything else goes as is; the
 * store's own guards judge it and refuse by name.
 */
export function storeValue(
  column: Pick<DatasetField, "data_type"> | undefined,
  value: unknown,
): unknown {
  if (column?.data_type === "json" && value !== null && typeof value === "object") {
    return JSON.stringify(value);
  }
  return value;
}

// ─── sort and search, exactly as the older page door did them ───────────────
//
// `public.get_user_table_data_paginated_v2` sorted IN SQL: a number/integer
// column numerically (text that is not a number sorts as null), a date/datetime
// column as an instant, anything else as LOWER(text); NULLS LAST both ways; `id`
// as the tie-breaker that makes the order total. It searched with
// `data::text ILIKE '%term%'`. The record store has no sort-by-column or
// search door, so the record-store page reads the table's rows through the read
// door and applies THESE — the same rules, so the same click orders the same way.

type Sortable = { id: string; data: Record<string, unknown> };

/** `data->>'key'` — the text a jsonb value reads as. */
function asText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return jsonbText(value);
}

const NUMERIC = /^-?[0-9]+\.?[0-9]*$/;

/**
 * The database's text order. `LOWER(text)` sorted under the cluster's
 * `en_US.UTF-8` collation, which orders words, not code points — `$6,000`
 * after `**Stipulations**` — and `Intl.Collator("en")` is the same order
 * (measured against the older door on a real table, lane GRID-PORT).
 */
const TEXT_ORDER = new Intl.Collator("en");

function sortKey(value: unknown, dataType: string | undefined): number | string | null {
  const text = asText(value);
  if (text === null) return null;
  if (dataType === "integer" || dataType === "number") {
    return NUMERIC.test(text) ? Number(text) : null;
  }
  if (dataType === "date" || dataType === "datetime") {
    if (text === "") return null;
    const at = Date.parse(text);
    return Number.isNaN(at) ? null : at;
  }
  return text.toLowerCase();
}

export function sortRowsLikeTheOlderStore<T extends Sortable>(
  rows: readonly T[],
  fieldName: string,
  direction: "asc" | "desc",
  dataType: string | undefined,
): T[] {
  const keyed = rows.map((row) => ({ row, key: sortKey(row.data[fieldName], dataType) }));
  keyed.sort((a, b) => {
    if (a.key === null && b.key !== null) return 1;
    if (b.key === null && a.key !== null) return -1;
    if (a.key !== null && b.key !== null && a.key !== b.key) {
      const cmp =
        typeof a.key === "string" && typeof b.key === "string"
          ? TEXT_ORDER.compare(a.key, b.key)
          : a.key < b.key
            ? -1
            : 1;
      if (cmp !== 0) return direction === "desc" ? -cmp : cmp;
    }
    return a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0;
  });
  return keyed.map((k) => k.row);
}

/**
 * Postgres's `jsonb::text`: keys ordered by length then bytes, `", "` between
 * members and `": "` after a key — so a search for `"stage": "On` matches here
 * exactly when it matched the older door.
 */
const UTF8 = new TextEncoder();

export function jsonbText(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(jsonbText).join(", ")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort((a, b) => {
      const la = UTF8.encode(a).length;
      const lb = UTF8.encode(b).length;
      if (la !== lb) return la - lb;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    return `{${keys
      .map((k) => `${JSON.stringify(k)}: ${jsonbText((value as Record<string, unknown>)[k])}`)
      .join(", ")}}`;
  }
  return "null";
}

export function searchRowsLikeTheOlderStore<T extends Sortable>(rows: readonly T[], term: string): T[] {
  const needle = term.toLowerCase();
  if (needle === "") return [...rows];
  return rows.filter((row) => jsonbText(row.data).toLowerCase().includes(needle));
}
