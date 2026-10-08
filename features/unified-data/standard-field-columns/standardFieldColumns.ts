// features/unified-data/standard-field-columns/standardFieldColumns.ts
//
// CUSTOM FIELDS ON A STANDARD TABLE ARE LIST COLUMNS (lane 7 STANDARD-TABLES, wave 2, T2.1/T2.2).
//
// The pure half of the one column source every standard list uses. A field an organization added
// to a CRM person, a deal, an employee — any registry token whose rows carry `custom_fields` — is
// a column, a filter, a sort and a group, by naming the token. Nothing here knows what a party is.
// Champion: HubSpot (a property is a list column and a filter at once, on every object) and
// Salesforce list views.
//
// THE SERVER DOES THE WORK. Filters, sort and search over a custom field are PostgREST predicates
// on the row's own `custom_fields` document (`custom_fields->>key`), applied by the list's own
// query builder — so they run over every row the seat can see, never over the loaded page.
//
// THE FIELD RULE IS NEVER BYPASSED. A field the seat may not read is not a column: only fields the
// store's `custom.entity_fields` door hands back become columns, and a `confidential` or
// `restricted` field is dropped here as well (the store is refusing those levels on standard
// tables; reading one needs more than the row — `iam.field_sensitivity_level`). Relation and
// formula fields are left out until their values have a readable form on a standard row.

import type {
  ColumnFilterValue,
  ColumnFiltersState,
} from "@ai-matrx/design-system/data-table/types";

/** A list column id that names a custom field: `cf:<key>`. */
export const CUSTOM_COLUMN_PREFIX = "cf:";

/** The "has no value" sentinel the canonical list uses (lib/entity-list NONE_VALUE). */
export const CUSTOM_NONE_VALUE = "__none__";

/** A field key the store makes from a name: a lowercase slug. Anything else never reaches a query. */
const KEY_SHAPE = /^[a-z0-9_]{1,63}$/;

export type StandardFieldBehavior = "text" | "boolean" | "range" | "list";

export interface StandardFieldOption {
  /** The stable key a cell holds. */
  key: string;
  /** What a person reads. */
  label: string;
}

/** One custom field as a list column — merged across the organizations the list spans. */
export interface StandardFieldColumn {
  key: string;
  label: string;
  behavior: StandardFieldBehavior;
  multi: boolean;
  /** A range of dates rather than numbers (sorted and filtered as text). */
  isDate: boolean;
  options: StandardFieldOption[];
  /** The definitions this column merges, one per organization. */
  fieldIds: string[];
}

/** What a field definition looks like when a door hands it back (the parts this uses). */
export interface StandardFieldDefinition {
  id: string;
  key?: unknown;
  label?: unknown;
  name?: unknown;
  type?: unknown;
  multi?: unknown;
  sensitivity?: unknown;
  config?: unknown;
  options_table_id?: unknown;
  deleted_at?: unknown;
}

/** Custom-field filters, keyed by FIELD KEY (not column id), in the table's own filter vocabulary. */
export type CustomFieldFilters = Record<string, ColumnFilterValue>;

const READABLE_SENSITIVITY = new Set(["public", "internal", ""]);
const LISTED_BEHAVIORS = new Set<StandardFieldBehavior>(["text", "boolean", "range", "list"]);

export function isFieldKey(key: unknown): key is string {
  return typeof key === "string" && KEY_SHAPE.test(key);
}

export function columnIdFor(key: string): string {
  return `${CUSTOM_COLUMN_PREFIX}${key}`;
}

/** The field key a column id names, or null when it is not a custom-field column. */
export function keyOfColumnId(columnId: string): string | null {
  if (!columnId.startsWith(CUSTOM_COLUMN_PREFIX)) return null;
  const key = columnId.slice(CUSTOM_COLUMN_PREFIX.length);
  return isFieldKey(key) ? key : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isDateRange(config: unknown): boolean {
  if (!config || typeof config !== "object") return false;
  const c = config as Record<string, unknown>;
  const kind = text(c.kind ?? c.range_kind ?? c.value_kind);
  return kind === "date" || kind === "datetime";
}

/**
 * A Field's live choices from `custom.entity_fields_across`, in the order the person declared them.
 * The door answers them as a jsonb OBJECT, which keeps no order (Postgres stores keys shortest
 * first), so the order rides each option's `position`; unpositioned options follow, as answered.
 */
export function optionsInDeclaredOrder(
  options: Readonly<Record<string, { label: string; retired?: boolean; position?: number | null }>>,
): StandardFieldOption[] {
  return Object.entries(options)
    .filter(([, o]) => !o.retired)
    .sort(([, a], [, b]) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER))
    .map(([key, o]) => ({ key, label: o.label }));
}

/**
 * The definitions a door returned (any number of organizations) → one column per key.
 * Two organizations that both add "Preferred clinic location" are ONE column, because the
 * value lives under the same key in every row; the first definition names it.
 */
export function mergeFieldDefinitions(
  definitions: readonly StandardFieldDefinition[],
  optionsByField: ReadonlyMap<string, StandardFieldOption[]> = new Map(),
): StandardFieldColumn[] {
  const byKey = new Map<string, StandardFieldColumn>();
  for (const def of definitions) {
    if (def.deleted_at) continue;
    if (!isFieldKey(def.key)) continue;
    if (!READABLE_SENSITIVITY.has(text(def.sensitivity))) continue;
    const behavior = text(def.type) as StandardFieldBehavior;
    if (!LISTED_BEHAVIORS.has(behavior)) continue;
    const label = text(def.label) || text(def.name) || def.key;
    const existing = byKey.get(def.key);
    const options = optionsByField.get(def.id) ?? [];
    if (existing) {
      existing.fieldIds.push(def.id);
      for (const option of options) {
        if (!existing.options.some((o) => o.key === option.key)) existing.options.push(option);
      }
      continue;
    }
    byKey.set(def.key, {
      key: def.key,
      label,
      behavior,
      multi: def.multi === true,
      isDate: behavior === "range" && isDateRange(def.config),
      options: [...options],
      fieldIds: [def.id],
    });
  }
  return [...byKey.values()];
}

/** The words a cell shows for a stored value: an option's label, Yes/No, or the value itself. */
export function displayCustomValue(column: StandardFieldColumn, raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "";
  if (Array.isArray(raw)) return raw.map((v) => displayCustomValue(column, v)).filter(Boolean).join(", ");
  if (column.behavior === "boolean") {
    if (raw === true || raw === "true") return "Yes";
    if (raw === false || raw === "false") return "No";
  }
  if (column.behavior === "list") {
    // A choice cell holds the option's KEY (the store resolves every write to it).
    const option = column.options.find((o) => o.key === raw);
    if (option) return option.label;
  }
  if (typeof raw === "object") return JSON.stringify(raw);
  return String(raw);
}


/** Table filter state → (custom-field filters, everything else). */
export function splitCustomFilters(state: ColumnFiltersState): {
  custom: CustomFieldFilters;
  rest: ColumnFiltersState;
} {
  const custom: CustomFieldFilters = {};
  const rest: ColumnFiltersState = {};
  for (const [id, value] of Object.entries(state)) {
    const key = keyOfColumnId(id);
    if (key) {
      if (value && isApplied(value)) custom[key] = value;
    } else {
      rest[id] = value;
    }
  }
  return { custom, rest };
}

/** Custom-field filters → the table's controlled `columnFilters` entries. */
export function customFiltersToTable(custom: CustomFieldFilters | undefined): ColumnFiltersState {
  const out: ColumnFiltersState = {};
  for (const [key, value] of Object.entries(custom ?? {})) {
    if (isFieldKey(key)) out[columnIdFor(key)] = value;
  }
  return out;
}

function isApplied(value: ColumnFilterValue): boolean {
  switch (value.kind) {
    case "text":
      return value.value.trim() !== "";
    case "select": {
      const values = value.values ?? (value.value ? [value.value] : []);
      return value.values !== undefined || values.length > 0;
    }
    case "boolean":
      return true;
    case "number":
      return (
        value.op === "empty" ||
        value.op === "not_empty" ||
        value.min !== undefined ||
        value.max !== undefined
      );
    default:
      return false;
  }
}

/** A stored filter bag (a saved view) read defensively: unknown shapes are dropped. */
export function parseCustomFieldFilters(raw: unknown): CustomFieldFilters | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: CustomFieldFilters = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isFieldKey(key) || !value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    if (v.kind === "text" && typeof v.value === "string" && v.value.trim()) {
      out[key] = { kind: "text", value: v.value.trim(), ...(v.negated === true ? { negated: true } : {}) };
    } else if (v.kind === "select" && Array.isArray(v.values)) {
      const values = v.values.filter((x): x is string => typeof x === "string");
      out[key] = { kind: "select", value: values[0] ?? "", values, ...(v.negated === true ? { negated: true } : {}) };
    } else if (v.kind === "boolean" && typeof v.value === "boolean") {
      out[key] = { kind: "boolean", value: v.value };
    } else if (v.kind === "number") {
      const min = typeof v.min === "number" ? v.min : undefined;
      const max = typeof v.max === "number" ? v.max : undefined;
      const op = typeof v.op === "string" ? (v.op as Extract<ColumnFilterValue, { kind: "number" }>["op"]) : undefined;
      if (min !== undefined || max !== undefined || op === "empty" || op === "not_empty") {
        out[key] = { kind: "number", min, max, ...(op ? { op } : {}) };
      }
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/** The PostgREST builder methods the predicates use, structurally (every builder returns itself). */
export type CustomFieldPredicateBuilder<Q> = {
  is(column: string, value: null): Q;
  not(column: string, operator: string, value: unknown): Q;
  eq(column: string, value: unknown): Q;
  neq(column: string, value: unknown): Q;
  in(column: string, values: readonly unknown[]): Q;
  ilike(column: string, pattern: string): Q;
  gte(column: string, value: unknown): Q;
  lte(column: string, value: unknown): Q;
  gt(column: string, value: unknown): Q;
  lt(column: string, value: unknown): Q;
  or(filters: string): Q;
};

/** PostgREST list literal: every value double-quoted, so commas and parentheses stay inside. */
function postgrestList(values: readonly string[]): string {
  return `(${values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")})`;
}

/** Strip PostgREST `or()` metacharacters and LIKE wildcards a person did not mean. */
function likeTerm(term: string): string {
  return term.replace(/[,()*%]/g, " ").trim();
}

/**
 * Apply custom-field filters to a list's own PostgREST builder — real server predicates over the
 * row's `custom_fields` document. `columns` says which fields are multi-choice (an array cell).
 */
export function applyCustomFieldFilters<Q extends CustomFieldPredicateBuilder<Q>>(
  builder: Q,
  filters: CustomFieldFilters | undefined,
  columns: readonly StandardFieldColumn[] = [],
): Q {
  let q = builder;
  for (const [key, filter] of Object.entries(filters ?? {})) {
    if (!isFieldKey(key)) continue;
    const textPath = `custom_fields->>${key}`;
    const jsonPath = `custom_fields->${key}`;
    const column = columns.find((c) => c.key === key);
    switch (filter.kind) {
      case "text": {
        const term = likeTerm(filter.value);
        if (!term) break;
        q = filter.negated
          ? q.or(`${textPath}.is.null,${textPath}.not.ilike.*${term}*`)
          : q.ilike(textPath, `%${term}%`);
        break;
      }
      case "select": {
        const chosen = filter.values ?? (filter.value ? [filter.value] : []);
        const wantsNone = chosen.includes(CUSTOM_NONE_VALUE);
        // "ALL" IS NO FILTER. The picker's All ticks every choice; matching every choice would hide
        // the rows that hold none, so a selection of every option (and no exclusion) narrows nothing.
        if (
          !filter.negated &&
          !wantsNone &&
          column &&
          column.options.length > 0 &&
          column.options.every((o) => chosen.includes(o.key))
        ) {
          break;
        }
        const values = chosen.filter((v) => v !== CUSTOM_NONE_VALUE);
        // A choice cell holds its option KEY, and the picker offers keys: matched exactly.
        const spellings = [...new Set(values)];
        if (column?.multi) {
          // A multi-choice cell is an array: a row matches when it holds any chosen value.
          const clauses = spellings.map((v) => `${jsonPath}.cs.${JSON.stringify([v])}`);
          if (wantsNone) clauses.push(`${jsonPath}.is.null`);
          if (filter.negated) {
            for (const v of spellings) q = q.not(jsonPath, "cs", JSON.stringify([v]));
            if (wantsNone) q = q.not(jsonPath, "is", null);
          } else {
            q = clauses.length ? q.or(clauses.join(",")) : q.in("id", []);
          }
          break;
        }
        if (filter.negated) {
          if (spellings.length) q = q.or(`${textPath}.is.null,${textPath}.not.in.${postgrestList(spellings)}`);
          if (wantsNone) q = q.not(textPath, "is", null);
        } else if (wantsNone && spellings.length) {
          q = q.or(`${textPath}.is.null,${textPath}.in.${postgrestList(spellings)}`);
        } else if (wantsNone) {
          q = q.is(textPath, null);
        } else {
          // An explicit empty set matches no rows (the table's own contract).
          q = q.in(textPath, spellings);
        }
        break;
      }
      case "boolean":
        q = filter.negated
          ? q.or(`${textPath}.is.null,${textPath}.neq.${String(filter.value)}`)
          : q.eq(textPath, String(filter.value));
        break;
      case "number": {
        const { op, min, max } = filter;
        if (op === "empty") q = q.is(jsonPath, null);
        else if (op === "not_empty") q = q.not(jsonPath, "is", null);
        else if (op === "eq" && min !== undefined) q = q.eq(jsonPath, min);
        else if (op === "ne" && min !== undefined) q = q.neq(jsonPath, min);
        else if (op === "lt" && max !== undefined) q = q.lt(jsonPath, max);
        else if (op === "gt" && min !== undefined) q = q.gt(jsonPath, min);
        else {
          if (min !== undefined) q = q.gte(jsonPath, min);
          if (max !== undefined) q = q.lte(jsonPath, max);
        }
        break;
      }
      default:
        break;
    }
  }
  return q;
}

/** `or()` clauses that let a list's search reach the custom fields' words. */
export function customFieldSearchClauses(
  columns: readonly StandardFieldColumn[],
  term: string,
): string[] {
  const clean = likeTerm(term);
  if (!clean) return [];
  return columns
    .filter((c) => c.behavior === "text" || c.behavior === "list" || c.isDate)
    .map((c) => `custom_fields->>${c.key}.ilike.%${clean}%`);
}

/**
 * The ORDER BY column for a sort id that names a custom field, or null. Ordered on the jsonb
 * value itself (`custom_fields->key`), so numbers sort as numbers and words as words.
 */
export function customFieldOrderColumn(sortId: string): string | null {
  const key = keyOfColumnId(sortId);
  return key ? `custom_fields->${key}` : null;
}
