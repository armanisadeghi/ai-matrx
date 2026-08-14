/**
 * THE FALLBACK LAW, implemented.
 *
 * `formatFieldValue` never blanks a cell and never throws. When the declared
 * format cannot interpret the stored value it returns `ok: false` with the
 * **base-type** rendering of that same value plus a human `reason`. The UI
 * renders that text in amber (see `<FormattedFieldValue>`), so a mismatch is
 * visible instead of invisible.
 */
import {
  defaultFormatForBase,
  getFieldFormat,
  FIELD_FORMATS,
} from "./registry";
import type {
  FieldFormatConfig,
  FieldFormatOptions,
  FormatResult,
} from "./types";

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/** Last-resort rendering — the raw value, readable, never empty-by-accident. */
function baseText(value: unknown): string {
  if (isEmpty(value)) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Read a field's declared format off its `metadata` JSONB. Returns null when
 * the field declares none (or declares one we don't know) — the caller then
 * falls back to the storage type's identity format, so an unknown or removed
 * format id degrades to plain, never to broken.
 */
export function readFieldFormatConfig(
  metadata: unknown,
): FieldFormatConfig | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as Record<string, unknown>).format;
  if (!raw || typeof raw !== "object") return null;
  const id = (raw as Record<string, unknown>).id;
  if (typeof id !== "string" || !getFieldFormat(id)) return null;
  const options = (raw as Record<string, unknown>).options;
  return {
    id: id as FieldFormatConfig["id"],
    options:
      options && typeof options === "object"
        ? (options as FieldFormatOptions)
        : undefined,
  };
}

/**
 * Resolve the format a field actually renders with: its declared one, or the
 * identity format for its storage type.
 */
export function resolveFieldFormat(
  dataType: string,
  metadata: unknown,
): FieldFormatConfig {
  const declared = readFieldFormatConfig(metadata);
  if (declared) return declared;
  return { id: defaultFormatForBase(dataType) };
}

export function formatFieldValue(
  value: unknown,
  config: FieldFormatConfig | null | undefined,
  /** The column's storage type — used for the fallback rendering. */
  dataType?: string,
): FormatResult {
  if (isEmpty(value)) return { ok: true, text: "", empty: true };

  const def = config ? getFieldFormat(config.id) : null;
  const effective =
    def ?? FIELD_FORMATS[defaultFormatForBase(dataType ?? "string")];

  let formatted: string | null;
  try {
    formatted = effective.format(value, config?.options ?? {});
  } catch {
    formatted = null;
  }

  if (formatted !== null) return { ok: true, text: formatted, empty: false };

  // Mismatch. Show what IS stored, flagged.
  return {
    ok: false,
    text: baseText(value),
    empty: false,
    reason: `This value is not a valid ${effective.label.toLowerCase()} — showing the stored value instead.`,
  };
}

/** Turn raw editor input into the value to store under a format. */
export function parseFieldInput(
  raw: unknown,
  config: FieldFormatConfig | null | undefined,
  dataType?: string,
): unknown {
  const def = config ? getFieldFormat(config.id) : null;
  const effective =
    def ?? FIELD_FORMATS[defaultFormatForBase(dataType ?? "string")];
  try {
    return effective.parse(raw, config?.options ?? {});
  } catch {
    return raw;
  }
}

/**
 * Would this stored value survive its declared format? Used to count mismatches
 * so a column can warn ("4 values don't fit Currency") instead of silently
 * showing amber cells.
 */
export function valueFitsFormat(
  value: unknown,
  config: FieldFormatConfig | null | undefined,
  dataType?: string,
): boolean {
  return formatFieldValue(value, config, dataType).ok;
}
