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

import { getFieldFormat } from "@ai-matrx/design-system/field-formats";
import type { FieldChoice, FieldFormatConfig, FieldFormatId } from "@ai-matrx/design-system/field-formats";

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

  const config = (field.config ?? {}) as Record<string, unknown>;
  const display = displayFormatOf(field);
  // SEAM HONESTY: the settings a kind's own keys do not hold (an autonumber's prefix, a
  // choice's colours, a relation's suffix …) ride the Field's `display_format`, which the
  // store keeps verbatim; they come back here, beside the kind's own keys.
  const displayed = (id: string): Record<string, unknown> =>
    display && display.id === id && display.options ? { ...(display.options as Record<string, unknown>) } : {};

  if (behaviour === "relation") {
    const id: FieldFormatId = word === "person" || word === "attachment" ? word : "relation";
    const options: NonNullable<FieldFormatConfig["options"]> = displayed(id);
    if (field.relation_target) options.relation_target = field.relation_target;
    if (typeof field.relation_max === "number") options.relation_max = field.relation_max;
    if (field.on_target_delete === "set_null" || field.on_target_delete === "restrict" || field.on_target_delete === "cascade") {
      options.on_delete = field.on_target_delete;
    }
    // The older grid names ONE column of the target; a store spec of several is not drawn here
    // (and never written back unless the person picks one).
    const shown = (field as { display?: { columns?: unknown } | null }).display?.columns;
    if (Array.isArray(shown) && shown.length === 1 && typeof shown[0] === "string") options.display = shown[0];
    return { id, options };
  }
  if (behaviour === "list") {
    const id: FieldFormatId = field.multi ? "multi_choice" : "choice";
    const extra = displayed(id);
    const looks = Array.isArray(extra.choices) ? (extra.choices as FieldChoice[]) : [];
    delete extra.choices;
    delete extra.allowOther;
    // The option Table is the vocabulary; a choice's colour, label, group and hover help are
    // presentation kept on the Field — over the option's own colour, which the mover carried.
    const merged = choices?.map((c) => {
      const look = looks.find((l) => l && l.value === c.value);
      return look ? { ...c, ...choiceLook(look) } : c;
    });
    return {
      id,
      options: {
        ...extra,
        ...(merged ? { choices: merged } : {}),
        // Said out loud: the grid's default is "on", the store's is "off".
        allowOther: config.allow_other === true,
      },
    };
  }
  if (behaviour === "formula") {
    // G5: autonumber and the two record stamps are formula Fields with a system
    // expression; the grid draws them as the kinds they are.
    if (word === "autonumber" || word === "created_time" || word === "modified_time") {
      const options = displayed(word);
      return Object.keys(options).length > 0 ? { id: word, options } : { id: word };
    }
    // G3: the text a person typed is kept beside the expression the store runs.
    const expression =
      typeof config.formula_text === "string"
        ? config.formula_text
        : typeof field.expression === "string"
          ? field.expression
          : "";
    const resultFormat = display && display.id !== "formula" ? display.id : undefined;
    const shownAs = display ? { ...((display.options ?? {}) as Record<string, unknown>) } : {};
    delete shownAs.formula;
    return { id: "formula", options: { ...shownAs, formula: { expression, ...(resultFormat ? { resultFormat } : {}) } } };
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
export function olderValidationRules(
  rules: Field["rules"] | null | undefined,
  unique?: boolean | null,
): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  // "No two rows the same" is a setting ON the Field, not a rule; the older grid kept it with them.
  if (unique === true) out.unique = true;
  for (const rule of Array.isArray(rules) ? rules : []) {
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
        if (typeof rule.example === "string" && rule.example !== "") out.patternHint = rule.example;
        break;
      // The mover wrote the older `maxLength` as the store's `length`; its `min` is `minLength`.
      case "length":
        if (rule.value !== undefined && rule.value !== null) out.maxLength = rule.value;
        if (typeof rule.min === "number") out.minLength = rule.min;
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
    validation_rules: olderValidationRules(field.rules, (field as { unique?: boolean | null }).unique) as DatasetField["validation_rules"],
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

// ─── SEAM HONESTY: what a column-settings save sends the store ──────────────
//
// Every setting the Sheet saves is either CARRIED through the store's own field door
// (`custom.field_update`) or REFUSED before anything is written, naming the setting and saying
// nothing changed. A save that answers "Saved" while the store keeps less is the silent failure
// the Doctrine forbids (v2 readiness audit, blocker 4). Where the store keeps a setting:
//
//   choice words            the list's option Table (settings arm `options`)
//   choice colour / label /  `display_format.options.choices` — presentation, kept verbatim;
//     group / hover help     the option Table stays the one vocabulary
//   allow other values      `allow_other` (config.allow_other)
//   relation settings       relation_target · relation_max · on_target_delete · display
//   autonumber prefix, and  `display_format: {id, options}` of the column's own kind
//     any other option
//   rules                   `rules`, MERGED — a rule the older grid has no word for stays
//
// What it cannot keep is refused: a choice list fed by a shared pick list (and the dependent
// choices that narrow it by another column), re-worded choices on a list the mover carried
// across (the door matches words by `title`; those options say `name`), a list of allowed
// values on a column that is not a choice column.

/** The store's kind word for a format that changes what a column IS, not how it shows. */
export const KIND_FOR_FORMAT: Partial<Record<string, string>> = {
  choice: "select",
  multi_choice: "multi_select",
  relation: "relation",
  person: "member",
  attachment: "attachment",
  autonumber: "autonumber",
  created_time: "created_time",
  modified_time: "modified_time",
};

/** An older storage type → the store's plain kind word (`field_update` type). */
const PLAIN_KIND_FOR_BASE: Partial<Record<string, string>> = {
  string: "text",
  json: "text",
  number: "number",
  integer: "number",
  boolean: "checkbox",
  date: "datetime",
  datetime: "datetime",
};

type FieldForWrite = Pick<Field, "type" | "format" | "multi" | "key" | "label" | "relation_target" | "config"> & {
  display?: unknown;
};

/** The kind word a column already is (`select`, `member`, `autonumber` …); null for a plain column. */
export function storeKindOf(field: Pick<Field, "type" | "format" | "multi">): string | null {
  const behaviour = String(field.type);
  if (behaviour === "list") return field.multi ? "multi_select" : "select";
  if (behaviour === "relation") return field.format === "person" ? "member" : field.format === "attachment" ? "attachment" : "relation";
  if (behaviour === "formula") {
    return field.format === "autonumber" || field.format === "created_time" || field.format === "modified_time"
      ? field.format
      : "formula";
  }
  return null;
}

const LOOK_KEYS = ["label", "group", "color", "help"] as const;

/** A choice's presentation — what the option Table does not hold. A label equal to the value says nothing. */
export function choiceLook(choice: FieldChoice): Partial<FieldChoice> {
  const out: Partial<FieldChoice> = {};
  for (const k of LOOK_KEYS) {
    const v = choice[k];
    if (typeof v !== "string" || v.trim() === "") continue;
    if (k === "label" && v === choice.value) continue;
    out[k] = v;
  }
  return out;
}

function hasKeys(o: object | null | undefined): boolean {
  return !!o && Object.keys(o).length > 0;
}

export type StoreFormatWrite = { ok: true; patches: Array<Record<string, unknown>> } | { ok: false; says: string };

/**
 * A column's display format, as the patches `custom.field_update` takes — in order — or the
 * sentence that refuses it. `current` is what the column's option Table holds now.
 */
export function storeFormatWrite(
  field: FieldForWrite,
  format: FieldFormatConfig | null,
  current: { choices: FieldChoice[] | null; optionsKeyedByName: boolean },
): StoreFormatWrite {
  const name = field.label || field.key;
  const nothing = `Nothing about "${name}" was changed.`;
  const kindNow = storeKindOf(field);
  const kind = format ? KIND_FOR_FORMAT[format.id] : undefined;

  // ── the formula a person typed ──
  if (format?.id === "formula") {
    const { formula, ...shownAs } = { ...(format.options ?? {}) };
    const expression = formula?.expression ?? "";
    const resultFormat = formula?.resultFormat;
    const patch: Record<string, unknown> = kindNow === "formula" ? { formula_text: expression } : { type: "formula", formula_text: expression };
    patch.display_format = resultFormat || hasKeys(shownAs)
      ? { id: resultFormat ?? "formula", ...(hasKeys(shownAs) ? { options: shownAs } : {}) }
      : null;
    return { ok: true, patches: [patch] };
  }

  // ── a plain display format (or none) ──
  if (!kind) {
    const display = format ? { id: format.id, ...(hasKeys(format.options ?? null) ? { options: format.options } : {}) } : null;
    if (kindNow === null) return { ok: true, patches: [{ display_format: display }] };
    // The column IS a list, a link or a worked-out column; showing it plainly means it stops being one.
    const base = format ? getFieldFormat(format.id)?.base : olderDataType(field);
    const plain = base ? PLAIN_KIND_FOR_BASE[base] : undefined;
    if (!plain) {
      return {
        ok: false,
        says: `The record store cannot turn "${name}" into a plain ${format ? `${format.id.replace(/_/g, " ")} ` : ""}column from here; change what it stores first (Stores, in its settings). ${nothing}`,
      };
    }
    return { ok: true, patches: [{ type: plain, display_format: display }] };
  }

  const options = { ...(format!.options ?? {}) } as Record<string, unknown>;
  const sameKind = kindNow === kind;
  const patches: Array<Record<string, unknown>> = [];
  const main: Record<string, unknown> = sameKind ? {} : { type: kind };

  if (kind === "select" || kind === "multi_select") {
    const list = options.structuredList as { listId?: string; groupName?: string; groupFromField?: string } | undefined;
    if (list) {
      return {
        ok: false,
        says: `"${name}" takes its choices from a shared pick list${
          list.groupFromField ? `, narrowed by what the "${list.groupFromField}" column holds` : list.groupName ? ` (the "${list.groupName}" group)` : ""
        }. The record store keeps a column's choices as the column's own list; it cannot take them from a pick list or narrow them by another column yet. Type the choices into the column instead. ${nothing}`,
      };
    }
    const choices = (Array.isArray(options.choices) ? options.choices : []) as FieldChoice[];
    const words: string[] = [];
    for (const c of choices) {
      const w = typeof c?.value === "string" ? c.value.trim() : "";
      if (w && !words.includes(w)) words.push(w);
    }
    const held = current.choices?.map((c) => c.value) ?? null;
    const wordsChanged = held === null || held.length !== words.length || held.some((w, i) => w !== words[i]);
    const wasAList = kindNow === "select" || kindNow === "multi_select";
    if (wasAList && wordsChanged && current.optionsKeyedByName) {
      return {
        ok: false,
        says: `"${name}" keeps the choices it was moved across with, and the record store cannot re-word or add to them from here yet (their colours and the other settings can still be changed). ${nothing}`,
      };
    }
    // An existing list's words are edited through the SETTINGS arm; the behaviour arm (a `type`
    // word) reads words only for a list it is making. So a list that stays a list never sends a
    // type for its words, and one → several sends its words first, then the type.
    const settings: Record<string, unknown> = {};
    if (wasAList && wordsChanged) settings.options = words;
    if (!wasAList && words.length) main.options = words;
    // The older grid's default is "other values allowed"; the store's is "off" — so it is said.
    (wasAList ? settings : main).allow_other = options.allowOther !== false;
    const looks = choices
      .map((c) => ({ value: typeof c?.value === "string" ? c.value.trim() : "", ...choiceLook(c) }))
      .filter((c) => c.value && Object.keys(c).length > 1);
    const rest = { ...options };
    delete rest.choices;
    delete rest.allowOther;
    delete rest.structuredList;
    const display = looks.length || hasKeys(rest) ? { id: format!.id, options: { ...rest, ...(looks.length ? { choices: looks } : {}) } } : null;
    (wasAList ? settings : main).display_format = display;
    if (wasAList) patches.push(settings);
    if (!sameKind) patches.push(main);
    return { ok: true, patches };
  }

  if (kind === "relation" || kind === "member" || kind === "attachment") {
    const { relation_target, relation_max, on_delete, display, ...rest } = options as {
      relation_target?: string;
      relation_max?: number;
      on_delete?: string;
      display?: unknown;
    } & Record<string, unknown>;
    const settings: Record<string, unknown> = {};
    const into = sameKind ? settings : main;
    if (typeof relation_target === "string" && relation_target && (!sameKind || relation_target !== field.relation_target)) {
      into.relation_target = relation_target;
    }
    if (typeof relation_max === "number") into.relation_max = relation_max;
    if (typeof on_delete === "string") into.on_target_delete = on_delete;
    // The behaviour arm's spec has no `display`, so it always goes through the settings arm.
    if (typeof display === "string" && display) settings.display = display;
    into.display_format = hasKeys(rest) ? { id: format!.id, options: rest } : null;
    if (!sameKind) patches.push(main);
    if (hasKeys(settings)) patches.push(settings);
    return { ok: true, patches };
  }

  // autonumber · created_time · modified_time: their options (a prefix, a date style) are shown-as settings.
  main.display_format = hasKeys(options) ? { id: format!.id, options } : { id: format!.id };
  return { ok: true, patches: [main] };
}

/** The older rule keys the store keeps as a Rule, and the one it keeps ON the Field. */
const OLDER_RULE_KINDS = new Set(["min", "max", "pattern", "length"]);

/**
 * The older `validation_rules` object → the store's `rules`, MERGED with what the column holds:
 * a rule the older grid has no word for (`equals_field`, `differs_from_field`, anything newer) is
 * kept exactly where it was, and a kept rule's own extras (`applies_to_types`) ride along.
 * `refused` names what the store cannot enforce, in plain words.
 */
export function storeRulesFromOlder(
  older: Record<string, unknown>,
  held: ReadonlyArray<Record<string, unknown>> | null | undefined,
): { rules: Array<Record<string, unknown>>; unique: boolean; refused: string[] } {
  const refused: string[] = [];
  const given = (k: string) => older[k] !== undefined && older[k] !== null && older[k] !== "";
  const want = new Map<string, Record<string, unknown>>();
  if (given("min")) want.set("min", { value: older.min });
  if (given("max")) want.set("max", { value: older.max });
  if (given("pattern")) want.set("pattern", { value: older.pattern, ...(given("patternHint") ? { example: older.patternHint } : {}) });
  if (given("maxLength") || given("minLength")) {
    want.set("length", { ...(given("maxLength") ? { value: older.maxLength } : {}), ...(given("minLength") ? { min: older.minLength } : {}) });
  }
  if (Array.isArray(older.allowedValues) && older.allowedValues.length > 0) refused.push("a list of allowed values");
  for (const key of Object.keys(older)) {
    if (!["min", "max", "pattern", "patternHint", "maxLength", "minLength", "allowedValues", "unique", "required"].includes(key) && given(key)) {
      refused.push(`"${key}"`);
    }
  }
  const rules: Array<Record<string, unknown>> = [];
  const placed = new Set<string>();
  for (const rule of held ?? []) {
    const kind = String(rule?.kind ?? "");
    if (!OLDER_RULE_KINDS.has(kind)) {
      rules.push(rule as Record<string, unknown>);
      continue;
    }
    const next = want.get(kind);
    if (!next || placed.has(kind)) continue;
    const kept = { ...rule } as Record<string, unknown>;
    delete kept.value;
    delete kept.example;
    delete kept.min;
    rules.push({ ...kept, kind, ...next });
    placed.add(kind);
  }
  for (const [kind, next] of want) if (!placed.has(kind)) rules.push({ kind, ...next });
  return { rules, unique: older.unique === true, refused };
}

/**
 * One option record of a list's option Table → one grid choice. `value` is what
 * the cell holds, and the store's read door answers a list cell with the option's
 * LABEL (its `_choices` side-map carries the id), so the label is the value.
 */
export function choiceFromOption(option: { data?: Record<string, unknown> | null }): FieldChoice | null {
  const data = option.data ?? {};
  // An option Table the MOVER made keys its words `name`; one the store makes itself for a
  // `select` column (custom._options_table_for) keys them `title`. Both are the option's words.
  const words = [data.name, data.title, data.label].find((w) => typeof w === "string" && w.trim() !== "");
  const name = typeof words === "string" ? words : null;
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
  // TEXT THAT IS A NUMBER, INTO A NUMBER COLUMN (lane INTEG-CLIENTS, found by the seat walk). A
  // table pasted from a chat answer, a CSV or a scrape is all text; the older store coerced "3"
  // into an integer column, the record store refuses it ("Qty takes a number, and it was given a
  // string"). Only text the older door itself read as a number (its NUMERIC rule) is converted;
  // anything else goes as it is and the store's refusal is shown — never a silent guess.
  if ((column?.data_type === "number" || column?.data_type === "integer") && typeof value === "string") {
    const t = value.trim();
    if (NUMERIC.test(t)) return Number(t);
  }
  if (column?.data_type === "boolean" && typeof value === "string") {
    const t = value.trim().toLowerCase();
    if (t === "true") return true;
    if (t === "false") return false;
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

/**
 * THE TABLE'S DEFAULT SORT, IN THE STORE'S OWN WORDS: `default_sort: [{field, direction}]`.
 * That is what the store's table declaration and the mover write (TABLE-PARITY gap 3 found
 * the seam reading and writing `{key}`, so a moved table's saved sort never applied). A
 * `{key}` entry — written by this seam before the fix — is still read, so no saved sort is lost.
 */
export function olderRowOrdering(
  defaultSort: unknown,
  fields: readonly Pick<Field, "key">[],
): { default_sort: { field: string; direction: "asc" | "desc" } } | null {
  const first = Array.isArray(defaultSort)
    ? (defaultSort[0] as { field?: unknown; key?: unknown; direction?: unknown } | undefined)
    : undefined;
  const name = typeof first?.field === "string" ? first.field : typeof first?.key === "string" ? first.key : null;
  if (!name || !fields.some((f) => f.key === name)) return null;
  return { default_sort: { field: name, direction: first?.direction === "desc" ? "desc" : "asc" } };
}

/** The grid's "Save as default" as the store's `default_sort` value (empty = no saved sort). */
export function storeDefaultSort(
  sortField: string | undefined,
  sortDirection: "asc" | "desc" | undefined,
): Array<{ field: string; direction: "asc" | "desc" }> {
  return sortField ? [{ field: sortField, direction: sortDirection ?? "asc" }] : [];
}

/** What the store said about a Table's hand-set order (G13): "served", or why it cannot keep one. */
export type StoreHandOrder = { status: string; enabled: boolean; order: string[] };

/**
 * THE OLDER `row_ordering_config` FOR A STORE TABLE (ORDER-FIX): `{enabled, order}` when the Table's
 * view keeps a hand-set order — that order IS the sort, so the Table's saved sort is NOT handed on
 * beside it (it drew over the order on production: VERIFIER-19 finding 2). Otherwise the saved sort
 * only; where the store cannot keep an order the grid then draws no Reorder.
 */
export function withHandOrder(
  sort: Record<string, unknown> | null,
  hand: StoreHandOrder,
): Record<string, unknown> | null {
  if (hand.status !== "served" || !hand.enabled) return sort;
  return { enabled: true, order: [...hand.order] };
}
