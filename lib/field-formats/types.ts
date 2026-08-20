/**
 * lib/field-formats — THE platform field-format registry.
 *
 * A **format** is a UI-layer semantic type layered on top of a plain storage
 * type. `currency` is not a database type: it is a `number` that the UI knows
 * to display as `$1,234.56`, edit with a currency-aware input, and right-align.
 * Same for `percent`, `email`, `url`, `rating`, `duration`, `tags`, …
 *
 * THE FALLBACK LAW — a format may never blank a cell or throw. If the stored
 * value cannot be interpreted under the declared format, `formatFieldValue`
 * returns `ok: false` together with the **base-type** rendering of the value.
 * The UI then shows that base rendering in amber so the user can SEE that
 * something does not fit, instead of staring at an empty cell. Formats are
 * always additive and always non-breaking: strip the format and you are back
 * to exactly what the database holds.
 *
 * Consumers:
 *   - user data tables (`udt_dataset_fields.metadata.format`)
 *   - scope context items (`ContextValueType` → `contextValueTypeToFormat`)
 * Add a consumer by mapping its own type vocabulary onto `FieldFormatId`;
 * never fork a second formatter table.
 */

/** The storage types a format can sit on. Mirrors the `field_data_type` enum. */
export type FieldBaseType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "date"
  | "datetime"
  | "json"
  | "array";

export type FieldFormatId =
  // string-backed
  | "text"
  | "long_text"
  | "markdown"
  | "email"
  | "url"
  | "phone"
  | "color"
  // number-backed
  | "number"
  | "decimal"
  | "currency"
  | "percent"
  | "duration"
  // integer-backed
  | "integer"
  | "rating"
  | "file_size"
  // boolean-backed
  | "boolean"
  // choice-backed — options are a UI layer, never a database constraint
  | "choice"
  | "multi_choice"
  // temporal
  | "date"
  | "datetime"
  | "relative_time"
  // structured
  | "json"
  | "array"
  | "tags";

/**
 * A binding from a choice format to a user structured list (a "pick list").
 *
 * THE SAME SHAPE the agent-variable system already uses (aidream's
 * `PicklistBinding`, written by the FE as `customComponent.structured_list`) —
 * a column and an agent variable must speak ONE option vocabulary, or the same
 * list means two things depending on which surface reads it. Never fork this.
 *
 * `groupName` is what makes tiering free: a list's items already carry a
 * `group_name`, so binding to one group of a list yields a narrower set with no
 * second list to maintain, and the ungrouped binding yields sections for free.
 */
export type StructuredListBinding = {
  /** `workbench.udt_structured_lists.id` the options are hydrated from. */
  listId: string;
  /** Optional FIXED group filter within the list. */
  groupName?: string;
  /**
   * DEPENDENT COLUMNS — the group filter comes from another column's cell
   * instead of being fixed. Holds that column's MACHINE field name.
   *
   * Picking "North America" in Continent narrows Country to the list's
   * "North America" group, because the list's items already carry the group.
   * Nothing is declared on the controlling column: the dependency is stated
   * once, here, by the column that is constrained.
   *
   * Chains are free and need no graph: each column reads its controller's
   * CURRENT cell value at render time, so A → B → C works with no traversal,
   * and a cycle cannot loop (a cell value is data, not a computation).
   *
   * Two behaviours this must always keep, both of them the fallback law:
   *   - the controlling cell empty means ALL groups are offered as sections,
   *     never an empty dropdown;
   *   - changing the controller NEVER rewrites or clears the dependent cell.
   *     A value that no longer fits renders in amber, exactly like any other
   *     off-list value, and the user decides.
   *
   * Ignored when `groupName` is set — a fixed group wins over a derived one.
   */
  groupFromField?: string;
  /** Multi-select. Mirrors the agent-variable flag; `multi_choice` implies it. */
  multiple?: boolean;
};

/**
 * One option offered by a choice format.
 *
 * `value` is EXACTLY what the cell stores — the human-readable label, not an
 * id. That is deliberate: it keeps raw data readable, lets an existing column
 * adopt a choice format with zero rewriting, and keeps the fallback law
 * meaningful (a value not in the list is still legible in the cell).
 */
export type FieldChoice = {
  value: string;
  /** Display text when it should differ from the stored value. */
  label?: string;
  /** Section heading — carried over from a structured list item's group_name. */
  group?: string;
  /** Chip tint. A name from the shared choice palette, never a raw hex. */
  color?: string;
  /** Hover help, carried over from a structured list item's help_text. */
  help?: string;
};

/** Per-field options. Every key is optional; every format has sane defaults. */
export type FieldFormatOptions = {
  /** `currency` — ISO 4217 code. Default "USD". */
  currency?: string;
  /** `currency` / `decimal` / `percent` — fixed decimal places. */
  precision?: number;
  /**
   * `percent` — how the number is STORED.
   *  - "whole"    (default): 45 means 45%
   *  - "fraction": 0.45 means 45%
   */
  percentScale?: "whole" | "fraction";
  /** `duration` — unit the number is stored in. Default "seconds". */
  durationUnit?: "seconds" | "minutes" | "hours" | "milliseconds";
  /** `rating` — top of the scale. Default 5. */
  ratingMax?: number;
  /** `number` / `decimal` / `integer` — thousands separators. Default true. */
  useGrouping?: boolean;
  /** `date` / `datetime` — Intl date style. Default "medium". */
  dateStyle?: "short" | "medium" | "long";
  /** Text shown after the value (e.g. "kg", "req/s"). */
  suffix?: string;
  /** Text shown before the value. */
  prefix?: string;
  /**
   * `choice` / `multi_choice` — the options offered inline. Ignored when
   * `structuredList` is set; that binding is the source of truth for options.
   */
  choices?: FieldChoice[];
  /**
   * `choice` / `multi_choice` — hydrate options from a shared pick list instead
   * of holding a private copy, so "Status" means one thing across every table.
   */
  structuredList?: StructuredListBinding;
  /**
   * `choice` / `multi_choice` — may a value outside the option list be entered
   * and kept? Default TRUE, because a format may never take away a working
   * input, and because a column always adopts a format over data that predates
   * it. Off-list values are never rejected or blanked — they render in amber.
   */
  allowOther?: boolean;
};

/** What a field declares. Persisted as `metadata.format` on the field row. */
export type FieldFormatConfig = {
  id: FieldFormatId;
  options?: FieldFormatOptions;
};

/**
 * Result of formatting one value.
 *
 * `ok: false` means the value did not fit the declared format — `text` still
 * carries a readable base-type rendering so the cell is never blank, and
 * `reason` explains what went wrong (surfaced as a tooltip).
 */
export type FormatResult = {
  ok: boolean;
  /** Always populated. Empty string only for genuinely empty values. */
  text: string;
  /** Set when `ok` is false. */
  reason?: string;
  /** True when the raw value is null/undefined/"" — not a mismatch. */
  empty: boolean;
};

/** How a value should be edited. Maps to a concrete input in the UI layer. */
export type FieldEditorKind =
  | "text"
  | "textarea"
  | "number"
  | "checkbox"
  | "date"
  | "datetime"
  | "email"
  | "url"
  | "tel"
  | "color"
  | "rating"
  | "json"
  | "select"
  | "multiselect";

export type FieldFormatDef = {
  id: FieldFormatId;
  label: string;
  description: string;
  /** Grouping for the picker UI. */
  group: "Text" | "Numbers" | "Dates" | "Choice" | "Structured";
  /** The storage type this format requires. */
  base: FieldBaseType;
  /** Extra base types this format tolerates (read-only leniency). */
  alsoAccepts?: FieldBaseType[];
  editor: FieldEditorKind;
  /** Right-align in a grid (numeric-ish). */
  numericAlign?: boolean;
  /** Rendered richly by `<FormattedFieldValue>` (link, swatch, chips, …). */
  rich?: boolean;
  /** Which options this format actually reads — drives the options UI. */
  optionKeys?: (keyof FieldFormatOptions)[];
  /**
   * Turn a stored value into display text. Return `null` to signal the value
   * does not fit this format (the caller then falls back to base rendering).
   */
  format: (value: unknown, options: FieldFormatOptions) => string | null;
  /**
   * Turn raw editor input into the value to store. Must return a value valid
   * for `base`, or `null` to store nothing.
   */
  parse: (raw: unknown, options: FieldFormatOptions) => unknown;
};
