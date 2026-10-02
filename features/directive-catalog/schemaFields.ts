/**
 * schemaFields — turn a directive's published JSON Schema into form fields, and
 * the person's answers back into the item payload. PURE: no React, no I/O.
 *
 * WHY: the server publishes, per writable noun and verb, the exact item schema
 * it accepts (`NounDirectives.schemas[verb]`). Generating the form from that
 * schema means every writable type works with zero per-type code, and a type
 * the server adds tomorrow works the day it lands — the same principle that
 * lets one reference renderer serve every noun. Consumers: the "Add a
 * reference" picker (Create / Update) and the admin directive builder.
 *
 * Rules that shape the form, all derived from the schema, never from a list of
 * field names:
 *   - EVERY property becomes a field. Nothing is silently dropped; a shape the
 *     form cannot express as a control falls back to a JSON field.
 *   - "essential" = required fields + the noun's title column. Everything else
 *     is "more", ordered by kind (pick-lists and records first, raw JSON last)
 *     and then by the schema's own property order.
 *   - Update sends ONLY what the person set: an action button that sets a
 *     task's status must not also overwrite every other column with blanks.
 *     A blank field is never sent — not as "", not as null.
 *   - The noun's title column is always labelled "Title" (a note's is stored
 *     as `label`; people never see storage names).
 *   - Validation OFFERS, never blocks (common-docs/policies/
 *     validation-offers-never-blocks.md): `buildSchemaPayload` returns
 *     warnings next to the payload and never refuses to build one.
 */

import type { EntityTypeToken } from "@ai-matrx/associations";
import {
  sentenceCaseValue,
  type ValueVocabulary,
} from "@/features/directive-catalog/valueVocabulary";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";

export type SchemaFieldKind =
  | "text"
  | "number"
  | "integer"
  | "boolean"
  | "enum"
  | "date"
  | "datetime"
  | "time"
  | "record"
  | "recurrence"
  | "json";

export type SchemaFieldTier = "essential" | "more";

export interface SchemaField {
  key: string;
  label: string;
  kind: SchemaFieldKind;
  required: boolean;
  /**
   * The schema accepts `null`. On an UPDATE schema every field is optional this
   * way, so it says nothing about whether the column may be emptied — never
   * read it as "clearable".
   */
  nullable: boolean;
  /**
   * Allowed values when `kind === "enum"` — one per meaning: a legacy value the
   * record's vocabulary folds onto another listed value is left out.
   */
  enumValues: string[];
  /**
   * The word a person reads for each stored value (every published value,
   * legacy ones included, so a legacy DEFAULT still reads in words).
   */
  enumLabels: Readonly<Record<string, string>>;
  /** The entity a `kind === "record"` field points at. */
  recordToken: EntityTypeToken | null;
  description: string | null;
  /** The server's default, shown as a hint; never sent unless the person sets it. */
  defaultValue: unknown;
  tier: SchemaFieldTier;
}

/** One answer. `raw` is what the control holds; `touched` = the person set it. */
export interface SchemaFieldValue {
  raw: string | boolean;
  touched: boolean;
  /** Display title of a picked record, so the control can show a name, not an id. */
  recordTitle?: string | null;
}

export type SchemaFieldValues = Readonly<Record<string, SchemaFieldValue>>;

export type SchemaFormMode = "create" | "update";

export interface DeriveSchemaFieldsOptions {
  /** The noun's title column (catalog `title_column`) — always essential. */
  titleColumn?: string | null;
  /** Keys the caller supplies itself (the picker supplies an update's `id`). */
  exclude?: readonly string[];
  /** Maps an id-shaped key to the entity it points at; null = plain text. */
  resolveRecordToken?: (key: string) => EntityTypeToken | null;
  /**
   * The record's own words for a pick-list's values (`valueVocabularyFor`);
   * null = sentence case of the stored value.
   */
  resolveValueVocabulary?: (key: string) => ValueVocabulary | null;
}

export interface SchemaFieldWarning {
  /** The field the warning is about, or null for the whole payload. */
  key: string | null;
  message: string;
  /**
   * Where the offer belongs. `value`: a field the person filled in oddly — shown
   * beside that field. `required` / `no-change`: about what is MISSING — shown
   * beside the action button, where the decision is made, never as an alarm on a
   * form nobody has touched yet.
   */
  kind: "value" | "required" | "no-change";
}

export interface BuiltSchemaPayload {
  payload: Record<string, unknown>;
  warnings: SchemaFieldWarning[];
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function resolveRef(node: JsonObject, root: JsonObject): JsonObject {
  const ref = node.$ref;
  if (typeof ref !== "string" || !ref.startsWith("#/")) return node;
  let cursor: unknown = root;
  for (const part of ref.slice(2).split("/")) {
    cursor = asObject(cursor)?.[part];
  }
  return asObject(cursor) ?? node;
}

function isNullBranch(node: JsonObject): boolean {
  return node.type === "null";
}

/**
 * Collapse wrappers to the one branch that carries the type: `$ref`,
 * single-branch `allOf`, and the `anyOf: [X, null]` shape every optional
 * column is generated with. Two or more non-null branches (a JSON-any column
 * is six) cannot be one control, so they are reported as `ambiguous`.
 */
function unwrap(
  node: JsonObject,
  root: JsonObject,
): { node: JsonObject; nullable: boolean; ambiguous: boolean } {
  let current = resolveRef(node, root);
  let nullable = false;
  for (let depth = 0; depth < 8; depth += 1) {
    const allOf = Array.isArray(current.allOf) ? current.allOf : null;
    if (allOf && allOf.length === 1 && asObject(allOf[0])) {
      current = resolveRef(asObject(allOf[0])!, root);
      continue;
    }
    const union = Array.isArray(current.anyOf)
      ? current.anyOf
      : Array.isArray(current.oneOf)
        ? current.oneOf
        : null;
    if (!union) break;
    const branches = union
      .map((b) => asObject(b))
      .filter((b): b is JsonObject => b !== null)
      .map((b) => resolveRef(b, root));
    const nonNull = branches.filter((b) => !isNullBranch(b));
    if (nonNull.length !== branches.length) nullable = true;
    if (nonNull.length !== 1) {
      return { node: current, nullable, ambiguous: nonNull.length > 1 };
    }
    current = nonNull[0]!;
  }
  if (Array.isArray(current.type) && current.type.includes("null")) {
    nullable = true;
  }
  return { node: current, nullable, ambiguous: false };
}

function primaryType(node: JsonObject): string | null {
  if (typeof node.type === "string") return node.type;
  if (Array.isArray(node.type)) {
    const t = node.type.find((x) => x !== "null");
    return typeof t === "string" ? t : null;
  }
  return null;
}

function isIdShaped(key: string): boolean {
  return key === "id" || key.endsWith("_id");
}

function classify(
  key: string,
  node: JsonObject,
  ambiguous: boolean,
  resolveRecordToken: DeriveSchemaFieldsOptions["resolveRecordToken"],
): {
  kind: SchemaFieldKind;
  enumValues: string[];
  recordToken: EntityTypeToken | null;
} {
  const none = { enumValues: [] as string[], recordToken: null };
  if (ambiguous) return { kind: "json", ...none };
  if (Array.isArray(node.enum)) {
    const values = node.enum.filter((v): v is string => typeof v === "string");
    if (values.length === node.enum.length && values.length > 0) {
      return { kind: "enum", enumValues: values, recordToken: null };
    }
    return { kind: "json", ...none };
  }
  const type = primaryType(node);
  if (type === "boolean") return { kind: "boolean", ...none };
  if (type === "integer") return { kind: "integer", ...none };
  if (type === "number") return { kind: "number", ...none };
  if (type === "string") {
    if (node.format === "date") return { kind: "date", ...none };
    if (node.format === "date-time") return { kind: "datetime", ...none };
    if (node.format === "time") return { kind: "time", ...none };
    if (isIdShaped(key)) {
      const token = resolveRecordToken?.(key) ?? null;
      if (token) return { kind: "record", enumValues: [], recordToken: token };
    }
    // An RRULE ("FREQ=WEEKLY;BYDAY=MO") is chosen from repeat presets, never typed.
    if (key === "recurrence_rule") return { kind: "recurrence", ...none };
    return { kind: "text", ...none };
  }
  // object / array / untyped ("Any JSON value") → edited as JSON.
  return { kind: "json", ...none };
}

/** Kind order inside the "more" tier. Lower sorts first. */
const KIND_RANK: Record<SchemaFieldKind, number> = {
  enum: 0,
  record: 1,
  date: 2,
  datetime: 2,
  time: 2,
  recurrence: 2,
  boolean: 3,
  number: 4,
  integer: 4,
  text: 5,
  json: 6,
};

function humanize(key: string): string {
  const bare = key.replace(/_id$/, "");
  return humanizeIdentifier(bare) || key;
}

/**
 * Derive the form's fields from an item schema. Returns [] for anything that
 * is not an object schema — the caller shows that honestly, never an empty form
 * pretending to be complete.
 */
export function deriveSchemaFields(
  schemaValue: unknown,
  options: DeriveSchemaFieldsOptions = {},
): SchemaField[] {
  const root = asObject(schemaValue);
  if (!root) return [];
  const schema = resolveRef(root, root);
  const properties = asObject(schema.properties);
  if (!properties) return [];
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((k): k is string => typeof k === "string")
      : [],
  );
  const exclude = new Set(options.exclude ?? []);
  const titleColumn = options.titleColumn ?? null;

  const fields: Array<SchemaField & { order: number }> = [];
  Object.entries(properties).forEach(([key, raw], order) => {
    if (exclude.has(key)) return;
    const propNode = asObject(raw) ?? {};
    const { node, nullable, ambiguous } = unwrap(propNode, root);
    const { kind, enumValues, recordToken } = classify(
      key,
      node,
      ambiguous,
      options.resolveRecordToken,
    );
    const title =
      typeof propNode.title === "string"
        ? propNode.title
        : typeof node.title === "string" && node.title !== "JSON"
          ? node.title
          : null;
    const description =
      typeof propNode.description === "string"
        ? propNode.description
        : typeof node.description === "string"
          ? node.description
          : null;
    const isRequired = required.has(key);
    const vocabulary =
      kind === "enum" ? (options.resolveValueVocabulary?.(key) ?? null) : null;
    const canonical = vocabulary?.canonical ?? ((v: string) => v);
    const enumLabels = Object.fromEntries(
      enumValues.map((v) => {
        const c = canonical(v);
        return [v, vocabulary?.labels[c] ?? vocabulary?.labels[v] ?? sentenceCaseValue(v)];
      }),
    );
    // A legacy value that means another listed value is not a second choice.
    const offered = enumValues.filter((v) => {
      const c = canonical(v);
      return c === v || !enumValues.includes(c);
    });
    fields.push({
      key,
      label:
        key === titleColumn
          ? "Title"
          : // The task editor's own word for its repeat control.
            kind === "recurrence"
            ? "Repeat"
          : // The record an update/delete acts on is named by its type ("Task"),
            // never by the storage word "id".
            key === "id" && recordToken
            ? humanize(recordToken)
            : title && title !== "JSON"
              ? title.replace(/ Id$/, "")
              : humanize(key),
      kind,
      required: isRequired,
      nullable,
      enumValues: offered,
      enumLabels,
      recordToken,
      description,
      defaultValue: "default" in propNode ? propNode.default : undefined,
      tier: isRequired || key === titleColumn ? "essential" : "more",
      order,
    });
  });

  // The target record leads (an update says WHICH before WHAT), then the title.
  const essentialRank = (f: SchemaField) =>
    f.key === "id" ? 0 : f.key === titleColumn ? 1 : 2;
  fields.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === "essential" ? -1 : 1;
    if (a.tier === "essential") {
      const r = essentialRank(a) - essentialRank(b);
      return r !== 0 ? r : a.order - b.order;
    }
    const r = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    return r !== 0 ? r : a.order - b.order;
  });

  return fields.map(({ order: _order, ...field }) => field);
}

function isBlank(raw: string | boolean): boolean {
  return typeof raw === "string" && raw.trim().length === 0;
}

function coerce(
  field: SchemaField,
  raw: string | boolean,
  warnings: SchemaFieldWarning[],
): unknown {
  if (field.kind === "boolean") return raw === true;
  const text = typeof raw === "string" ? raw : String(raw);
  switch (field.kind) {
    case "number":
    case "integer": {
      const n = Number(text.trim());
      if (!Number.isFinite(n)) {
        warnings.push({
          key: field.key,
          kind: "value",
          message: `${field.label} is not a number — it will be sent exactly as typed.`,
        });
        return text;
      }
      if (field.kind === "integer" && !Number.isInteger(n)) {
        warnings.push({
          key: field.key,
          kind: "value",
          message: `${field.label} expects a whole number.`,
        });
      }
      return n;
    }
    case "datetime": {
      const d = new Date(text);
      if (Number.isNaN(d.getTime())) {
        warnings.push({
          key: field.key,
          kind: "value",
          message: `${field.label} is not a valid date and time — it will be sent as typed.`,
        });
        return text;
      }
      return d.toISOString();
    }
    case "json": {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        warnings.push({
          key: field.key,
          kind: "value",
          message: `${field.label} is not valid JSON — it will be sent as plain text.`,
        });
        return text;
      }
    }
    default:
      return text;
  }
}

/**
 * Build one item payload from the answers. `base` is merged first (the
 * picker's update supplies `{ id }` from the record the person searched for).
 *
 * Never throws and never withholds the payload: every problem is a warning
 * the UI shows beside the field, and the person's Insert always goes ahead.
 */
export function buildSchemaPayload(
  fields: readonly SchemaField[],
  values: SchemaFieldValues,
  mode: SchemaFormMode,
  base: Record<string, unknown> = {},
): BuiltSchemaPayload {
  const payload: Record<string, unknown> = { ...base };
  const warnings: SchemaFieldWarning[] = [];
  let changed = 0;

  for (const field of fields) {
    const value = values[field.key];
    const touched = value?.touched === true;

    if (!touched || value === undefined) {
      if (field.required && !(field.key in base)) {
        warnings.push({
          key: field.key,
          kind: "required",
          message: `${field.label} is required — the button will fail when clicked without it.`,
        });
      }
      continue;
    }

    // Blank never sends — not even null on an update. A published update schema
    // marks EVERY field optional (`| None` means "may be left out", not "the
    // column accepts null"), so a blank-means-clear rule sent `metadata: null`
    // into a NOT NULL column (live 2026-09-30). Clearing a value is an explicit
    // act, available in the admin builder's JSON view.
    if (isBlank(value.raw)) {
      if (field.required) {
        warnings.push({
          key: field.key,
          kind: "required",
          message: `${field.label} is required — the button will fail when clicked without it.`,
        });
      }
      continue;
    }

    payload[field.key] = coerce(field, value.raw, warnings);
    // The record's own id says WHICH row, not what changes.
    if (field.key !== "id") changed += 1;
  }

  if (mode === "update" && changed === 0) {
    warnings.push({
      key: null,
      kind: "no-change",
      message: "No fields are set — this button would change nothing.",
    });
  }

  return { payload, warnings };
}

/**
 * Best-effort inverse of `buildSchemaPayload`: turn an existing payload (the
 * admin builder's JSON view) back into answers, so switching views never loses
 * what the person typed. Keys the schema does not know are left to the JSON
 * view — the caller keeps that text.
 */
export function valuesFromPayload(
  fields: readonly SchemaField[],
  payload: Record<string, unknown>,
): Record<string, SchemaFieldValue> {
  const values: Record<string, SchemaFieldValue> = {};
  for (const field of fields) {
    if (!(field.key in payload)) continue;
    const v = payload[field.key];
    if (field.kind === "boolean") {
      values[field.key] = { raw: v === true, touched: true };
    } else if (field.kind === "json") {
      values[field.key] = {
        raw: typeof v === "string" ? v : JSON.stringify(v, null, 2),
        touched: true,
      };
    } else if (field.kind === "datetime" && typeof v === "string") {
      const d = new Date(v);
      values[field.key] = {
        raw: Number.isNaN(d.getTime()) ? v : toDatetimeLocal(d),
        touched: true,
      };
    } else {
      values[field.key] = { raw: v === null ? "" : String(v), touched: true };
    }
  }
  return values;
}

/**
 * Where each warning is shown. A field the person touched owns its warnings;
 * what is still MISSING (an untouched required field, an update that sets
 * nothing) is said once, beside the action button — so an untouched form is
 * calm and the offer sits exactly where the person decides.
 */
export function splitWarnings(
  warnings: readonly SchemaFieldWarning[],
  values: SchemaFieldValues,
): { field: SchemaFieldWarning[]; action: string[] } {
  const field: SchemaFieldWarning[] = [];
  const action: string[] = [];
  for (const w of warnings) {
    const touched = w.key !== null && values[w.key]?.touched === true;
    if (w.kind === "value" || (w.kind === "required" && touched)) field.push(w);
    else action.push(w.message);
  }
  return { field, action };
}

/**
 * The fields a non-technical person is offered. Raw JSON is never a human
 * control, and an id with no record search would ask them to type an id —
 * both stay available in the admin builder, which shows every field. This
 * narrows CONTROLS on a human form; it never narrows what a type can do.
 */
export function humanFormFields(fields: readonly SchemaField[]): SchemaField[] {
  const keys = new Set(fields.map((f) => f.key));
  // A REQUIRED field always stays: dropping one would insert a button that
  // can never succeed.
  return fields.filter(
    (f) =>
      f.required ||
      (f.kind !== "json" &&
        !(f.kind === "text" && (f.key === "id" || f.key.endsWith("_id"))) &&
        !isSetByTheSystem(f) &&
        !isDerived(f, keys)),
  );
}

/** Integer keys that hold a row's place in a list — set by dragging, never typed. */
const ORDERING_KEYS: ReadonlySet<string> = new Set([
  "position",
  "sort_order",
  "display_order",
  "order_index",
  "sort_index",
]);

/**
 * A field whose value comes from ANOTHER field or from where the row sits, so
 * asking for it twice is asking a person to keep two copies in step (G6B
 * review, 2026-10-02: Note offered "Folder" AND "Folder Name" AND "Position";
 * Project offered "Slug"):
 *   - `X_name` beside `X_id` (or `X`): a stored copy of the chosen record's
 *     name — the record control already sets it;
 *   - `slug`: the URL form of the title;
 *   - an ordering integer (`position`, `sort_order`, …): the row's place in a
 *     list.
 * Signals are the schema's own keys and types — no per-table list. The admin
 * builder still shows all three.
 */
function isDerived(field: SchemaField, keys: ReadonlySet<string>): boolean {
  if (field.key === "slug" && field.kind === "text") return true;
  if (
    ORDERING_KEYS.has(field.key) &&
    (field.kind === "integer" || field.kind === "number")
  ) {
    return true;
  }
  if (field.kind === "text" && field.key.endsWith("_name")) {
    const stem = field.key.slice(0, -"_name".length);
    if (keys.has(`${stem}_id`) || keys.has(stem)) return true;
  }
  return false;
}

/**
 * A field the record fills in itself, so a person is never asked for it:
 *   - a lifecycle stamp — a date-time named `…_at` (`completed_at`,
 *     `archived_at`, `published_at`): it is set by DOING the thing (completing
 *     the task), never typed on a form (G5 review: "Completed At" on Task
 *     create);
 *   - `timezone` — it follows the person's own setting.
 * The admin builder still shows both: this narrows controls, never capability.
 */
function isSetByTheSystem(field: SchemaField): boolean {
  if (field.kind === "datetime" && field.key.endsWith("_at")) return true;
  return field.key === "timezone";
}

/** Apply one control change; `null` returns the field to "not set / unchanged". */
export function applyFieldChange(
  prev: SchemaFieldValues,
  key: string,
  value: SchemaFieldValue | null,
): Record<string, SchemaFieldValue> {
  const next = { ...prev };
  if (value) next[key] = value;
  else delete next[key];
  return next;
}

/** `Date` → the `YYYY-MM-DDTHH:mm` a `datetime-local` input holds, local time. */
export function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
