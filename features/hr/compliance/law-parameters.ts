// features/hr/compliance/law-parameters.ts
//
// READING AND WRITING A RULE'S PARAMETERS WITHOUT PRETENDING TO UNDERSTAND THEM.
//
// A rule class ships a JSON Schema, and the shipped schemas range from four scalar
// keys (`pto-carryover-legality`) to nested objects with `$defs` and `$ref`
// (`final-pay-deadline`). Two honest behaviours follow, and this file draws the line
// between them:
//
//   • FLAT — every property is a scalar or an enum. A real form can be built, so it is.
//   • ANYTHING ELSE — the editor falls back to a JSON field and SAYS SO. A form that
//     silently drops the half of a schema it could not render would write a rule the
//     author did not describe, which is worse than asking them for JSON.
//
// `_unverified` is never an org input. It is the platform's own marker for parameter
// keys nobody has verified yet, so it is stripped from both the form and the display
// summary and surfaces as the "pending verification" badge instead.

/** The platform's marker key, never an org-authored parameter. */
export const LAW_UNVERIFIED_KEY = "_unverified";

export type LawParamFieldKind = "string" | "number" | "boolean" | "enum";

export type LawParamField = {
  key: string;
  label: string;
  kind: LawParamFieldKind;
  /** Enum choices, already stripped of `null`. */
  options: string[];
  required: boolean;
};

/** `daily_threshold_hours` → `Daily threshold hours`. Never invents a word. */
export function humanizeLawKey(key: string): string {
  const words = key.replace(/[_.]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function typeNames(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * The form this schema can honestly produce, or `null` when it cannot produce one.
 *
 * `null` is not a failure — it is the answer that sends the editor to its JSON
 * field. Returning a partial field list instead would be the silent-drop bug.
 */
export function flatParameterFields(
  schema: Record<string, unknown> | null,
): LawParamField[] | null {
  if (!schema) return null;
  const properties = asObject(schema.properties);
  if (!properties) return null;
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((entry): entry is string => typeof entry === "string")
      : [],
  );

  const fields: LawParamField[] = [];
  for (const [key, raw] of Object.entries(properties)) {
    if (key === LAW_UNVERIFIED_KEY) continue;
    const property = asObject(raw);
    if (!property) return null;

    if (Array.isArray(property.enum)) {
      const options = property.enum.filter(
        (entry): entry is string => typeof entry === "string",
      );
      if (options.length === 0) return null;
      fields.push({
        key,
        label: humanizeLawKey(key),
        kind: "enum",
        options,
        required: required.has(key),
      });
      continue;
    }

    const types = typeNames(property.type).filter((name) => name !== "null");
    if (types.length !== 1) return null;
    const [type] = types;
    const kind: LawParamFieldKind | null =
      type === "string"
        ? "string"
        : type === "number" || type === "integer"
          ? "number"
          : type === "boolean"
            ? "boolean"
            : null;
    if (!kind) return null;
    fields.push({
      key,
      label: humanizeLawKey(key),
      kind,
      options: [],
      required: required.has(key),
    });
  }

  return fields.length > 0 ? fields : null;
}

/**
 * A scalar or a list, in words. Returns `null` for anything that needs a nested
 * rendering — the caller recurses rather than flattening an object into a string.
 */
export function describeLawValue(value: unknown): string | null {
  if (value === null || value === undefined) return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value === "" ? "Not set" : value;
  if (Array.isArray(value)) {
    if (value.length === 0) return "None";
    const scalars = value.every(
      (entry) =>
        typeof entry === "string" ||
        typeof entry === "number" ||
        typeof entry === "boolean",
    );
    return scalars ? value.map((entry) => String(entry)).join(", ") : null;
  }
  return null;
}

/** The parameter pairs a person should read — the platform's own marker removed. */
export function displayableParameters(
  parameters: Record<string, unknown>,
): [string, unknown][] {
  return Object.entries(parameters).filter(([key]) => key !== LAW_UNVERIFIED_KEY);
}
