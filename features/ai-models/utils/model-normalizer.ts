/**
 * Normalizes legacy model control keys and prompt settings keys to their
 * current backend equivalents.
 *
 * This runs once at the Redux boundary (hydrate / fetch) so downstream code
 * never encounters deprecated field names.
 *
 * Legacy → Current mapping:
 *   max_tokens      → max_output_tokens
 *   output_format   → response_format   ONLY when it carries text response
 *                     formats (text / json_object / json_schema); an image
 *                     model's output_format (png / jpeg / webp) is the file
 *                     format — its own LLMParams field — and is never renamed.
 *   n               → count
 */

const LEGACY_KEY_MAP: Record<string, string> = {
  max_tokens: "max_output_tokens",
  n: "count",
};

/** The text response formats a legacy `output_format` carries. */
const TEXT_RESPONSE_FORMATS = new Set(["text", "json_object", "json_schema"]);

function flattenFormat(option: unknown): string {
  return option !== null &&
    typeof option === "object" &&
    "type" in (option as Record<string, unknown>)
    ? String((option as Record<string, unknown>).type)
    : String(option);
}

/**
 * THE output_format rule — every parser of model controls and settings uses it.
 * `output_format` is ambiguous in the catalog: on a legacy text model it IS the
 * response format (text / json_object / json_schema) and reads as
 * `response_format`; on an image model (GPT Image 2: png / jpeg / webp) it is
 * the image FILE format, a real LLMParams field of its own. Renaming the image
 * one showed GPT Image 2 a "Response Format" row whose choices stored nothing,
 * and made a stored `output_format` read as an unknown key. A control with no
 * enum keeps the legacy (text) reading.
 */
export function outputFormatControlKey(key: string, control: unknown): string {
  if (key !== "output_format") return key;
  const options =
    control !== null && typeof control === "object" && "enum" in control
      ? (control as { enum?: unknown }).enum
      : undefined;
  if (!Array.isArray(options) || options.length === 0) return "response_format";
  return options.every((o) => TEXT_RESPONSE_FORMATS.has(flattenFormat(o)))
    ? "response_format"
    : "output_format";
}

function normalizeResponseFormat(value: unknown): unknown {
  if (typeof value === "string") {
    if (value === "text" || value === "") return undefined;
    return { type: value };
  }
  return value;
}

/**
 * Normalize a single model's `controls` JSONB blob in-place.
 *
 * For each top-level key in controls:
 * - Renames legacy keys (max_tokens, output_format, n)
 * - Converts output_format string defaults to { type: string } dicts
 *
 * If the target key already exists, the legacy key is silently dropped
 * (the modern key wins).
 */
function normalizeControls(
  controls: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(controls)) {
    if (key === "output_format") {
      if (outputFormatControlKey(key, value) === "output_format") {
        result[key] = value;
        continue;
      }
      if (!("response_format" in controls)) {
        const controlDef = value as Record<string, unknown> | null;
        if (controlDef && typeof controlDef === "object") {
          const normalized = { ...controlDef };
          if (normalized.default !== undefined) {
            const converted = normalizeResponseFormat(normalized.default);
            if (converted === undefined) {
              delete normalized.default;
            } else {
              normalized.default = converted;
            }
          }
          result["response_format"] = normalized;
        }
      }
      continue;
    }

    const mappedKey = LEGACY_KEY_MAP[key];
    if (mappedKey) {
      if (!(mappedKey in controls)) {
        result[mappedKey] = value;
      }
      continue;
    }

    result[key] = value;
  }

  return result;
}

interface HasControls {
  // Json from database.types.ts is a union that includes Record<string, Json>.
  // We widen to unknown here so the constraint accepts both hand-rolled types
  // and the generated DB Row type without requiring a cast at call sites.
  controls: unknown;
}

/**
 * Normalize a full model record fresh from the database.
 * Normalizes legacy keys inside `controls`.
 */
export function normalizeModel<T extends HasControls>(model: T): T {
  const normalized = { ...model };

  if (normalized.controls && typeof normalized.controls === "object") {
    normalized.controls = normalizeControls(
      normalized.controls as Record<string, unknown>,
    );
  }

  return normalized;
}

/**
 * Normalize a batch of models (array version of normalizeModel).
 */
export function normalizeModels<T extends HasControls>(models: T[]): T[] {
  return models.map(normalizeModel);
}

/**
 * Normalize a prompt settings object from the database.
 * Converts legacy keys so downstream code only sees modern names.
 */
export function normalizePromptSettings(
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(settings)) {
    if (key === "output_format") {
      // A stored file format ("png") is the image output format, not a
      // response format — keep it under its own key.
      if (typeof value === "string" && !TEXT_RESPONSE_FORMATS.has(value) && value !== "") {
        result[key] = value;
        continue;
      }
      if (!("response_format" in settings)) {
        const converted = normalizeResponseFormat(value);
        if (converted !== undefined) {
          result["response_format"] = converted;
        }
      }
      continue;
    }

    const mappedKey = LEGACY_KEY_MAP[key];
    if (mappedKey) {
      if (!(mappedKey in settings)) {
        result[mappedKey] = value;
      }
      continue;
    }

    result[key] = value;
  }

  return result;
}
