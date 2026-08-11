/**
 * Canonical bounds + validators for the AUTHORED COPY on an
 * `ai.model_definition` row: the human display name (`common_name`) and the
 * registry description (`description`).
 *
 * These are the only two columns on a model row that are PROSE — text a person
 * writes for other people to read. Everything else on the row is either a
 * dispatch key (`name`), a capability/limit the platform enforces
 * (`context_window`, `max_tokens`, `capabilities`), or a governance flag that
 * changes what the platform DOES with the model (`is_deprecated`,
 * `is_primary`, `is_premium`, the fallback FKs, the ratings). The write
 * targets on `matrx-admin/ai-models` cover exactly these two and nothing else;
 * the manifest's `writeTargets` doc comment says why, field by field.
 *
 * Two consumers import from here and must not re-type the numbers:
 *   - `features/surfaces/manifests/admin-ai-models.manifest.ts` — interpolates
 *     these bounds into the `writeTargets` descriptions an agent reads, so the
 *     contract the model sees IS the contract enforced.
 *   - `AiModelDetailPanel`'s surface write handlers — call the validators
 *     below before touching `aiModelService.update`, the same canonical write
 *     path the panel's own Save button uses.
 *
 * Every validator THROWS on a bad shape rather than coercing. The surface
 * writeback seam (`features/surfaces/runtime/surface-writeback.ts`) converts a
 * throw into a safe error envelope the calling agent reads and can correct,
 * whereas a silent coercion writes something nobody asked for into the model
 * registry — a registry the whole platform dispatches against.
 *
 * The one normalization these DO perform is trimming, because the panel's own
 * save trims too (`handleSave` calls `.trim()` on the form fields) — matching
 * it keeps the agent path and the human path identical rather than
 * introducing a second notion of "the same value".
 *
 * Neither column has a length constraint in Postgres (both are unbounded
 * `text`/`varchar`). The caps below are PRODUCT bounds, not schema bounds:
 * `common_name` renders on one line in the model pickers and the admin table,
 * and `description` renders as the secondary line of a picker row
 * (`features/ai-models/components/lab/ModelListDropdown.tsx`), so an
 * unbounded string is a layout break rather than a database error.
 */

/** Max length of `ai.model_definition.common_name` after trimming. */
export const MODEL_COMMON_NAME_MAX_CHARS = 80;

/** Max length of `ai.model_definition.description` after trimming. */
export const MODEL_DESCRIPTION_MAX_CHARS = 2000;

/**
 * Validate a proposed model description. The column is nullable and the admin
 * form maps an empty input to `null`, so clearing the description is a
 * legitimate value rather than a bad shape — it returns `null`, not a throw.
 */
export function normalizeModelDescription(value: unknown): string | null {
  if (typeof value !== "string") {
    throw new Error(
      `model_description expects a string, received ${describeType(value)}.`,
    );
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MODEL_DESCRIPTION_MAX_CHARS) {
    throw new Error(
      `model_description is ${trimmed.length} characters; the maximum is ${MODEL_DESCRIPTION_MAX_CHARS}.`,
    );
  }
  return trimmed;
}

/**
 * Validate a proposed common name. Unlike the description this REJECTS the
 * empty string: `common_name` is nullable in the schema, but every picker and
 * table in the product falls back to the raw provider-facing `name` when it is
 * blank, so clearing it silently swaps a curated label for a wire id. That is
 * a change an admin should make deliberately in the form, not something an
 * agent should be able to do by passing "".
 */
export function normalizeModelCommonName(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error(
      `model_common_name expects a string, received ${describeType(value)}.`,
    );
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(
      "model_common_name cannot be empty — clearing the display name makes every picker fall back to the raw provider model id, so blank it in the admin form if that is really what you want.",
    );
  }
  if (trimmed.length > MODEL_COMMON_NAME_MAX_CHARS) {
    throw new Error(
      `model_common_name is ${trimmed.length} characters; the maximum is ${MODEL_COMMON_NAME_MAX_CHARS}.`,
    );
  }
  if (/[\n\r\t]/.test(trimmed)) {
    throw new Error(
      "model_common_name must be a single-line label — it cannot contain newlines or tabs.",
    );
  }
  return trimmed;
}

function describeType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}
