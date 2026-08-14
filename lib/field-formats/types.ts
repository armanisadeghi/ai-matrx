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
  // temporal
  | "date"
  | "datetime"
  | "relative_time"
  // structured
  | "json"
  | "array"
  | "tags";

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
  | "json";

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
