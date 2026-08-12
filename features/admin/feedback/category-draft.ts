/**
 * The category-draft contract for the Feedback & Announcements admin surface
 * (`matrx-admin/feedback`) — the vocabulary, bounds, and validation for the
 * surface's `category_draft` write target.
 *
 * Pure and outside `CategoriesTab` for the same reasons as its announcement
 * sibling (`./announcement-draft.ts`): the manifest interpolates these
 * constants into the model-facing description while the console's handler runs
 * `parseCategoryDraftPatch`, so the advertised contract and the enforced one
 * are one source; and the seam needs a SYNCHRONOUS throw, before any React
 * setter runs, so the whole payload can be rejected without leaving a
 * half-opened editor behind.
 *
 * This module governs the DRAFT only. Nothing here writes to
 * `/api/admin/feedback/categories` — that is the admin pressing Save.
 */

/** The keys `category_draft` accepts, in the order the form shows them. */
export const CATEGORY_DRAFT_KEYS = ["name", "description"] as const;

export type CategoryDraftKey = (typeof CATEGORY_DRAFT_KEYS)[number];

/**
 * Sanity ceiling on a staged category name. A category name is a BADGE on
 * every feedback row that carries it — long enough to be descriptive, short
 * enough that the badge is still a badge.
 */
export const CATEGORY_NAME_MAX_CHARS = 80;

/** Sanity ceiling on a staged category description (a one-or-two-line hint). */
export const CATEGORY_DESCRIPTION_MAX_CHARS = 500;

/** A validated partial patch — at least one key present, both optional. */
export interface CategoryDraftPatch {
  name?: string;
  description?: string;
}

function describeReceived(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}

/**
 * Validate a `category_draft` payload and return the patch to apply.
 *
 * THROWS (never coerces) on any bad shape. As with the announcement contract,
 * the messages say "plain text, not JSON and not JSON-encoded" because the
 * inline-tool layer parses a JSON-looking argument before the handler sees it,
 * and an agent told only "expected a string" tends to double-encode.
 */
export function parseCategoryDraftPatch(value: unknown): CategoryDraftPatch {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(
      `category_draft expects an object with at least one of { ${CATEGORY_DRAFT_KEYS.join(", ")} }; received ${describeReceived(value)}. Send the fields you want to change as an object — a bare string is not enough, because the target carries two fields.`,
    );

  const patch = value as Record<string, unknown>;

  const unsupported = Object.keys(patch).filter(
    (key) => !(CATEGORY_DRAFT_KEYS as readonly string[]).includes(key),
  );
  if (unsupported.length > 0)
    throw new Error(
      `category_draft got unsupported key(s): ${unsupported.join(", ")}. Accepted keys: ${CATEGORY_DRAFT_KEYS.join(" | ")}. The slug (derived from the name on save), the badge colour, sort order, and deleting a category are NOT writable on this surface.`,
    );

  if (Object.keys(patch).length === 0)
    throw new Error(
      `category_draft needs at least one of: ${CATEGORY_DRAFT_KEYS.join(" | ")}.`,
    );

  const result: CategoryDraftPatch = {};

  if ("name" in patch) {
    const name = patch.name;
    if (typeof name !== "string")
      throw new Error(
        `category_draft.name expects a plain-text string, not JSON and not JSON-encoded; received ${describeReceived(name)}.`,
      );
    if (!name.trim())
      throw new Error(
        "category_draft.name expects a non-empty name. To leave the name exactly as the admin has it, omit the key instead of sending an empty string.",
      );
    // The name renders as a single-line badge, and on save an empty slug is
    // derived from it — a line break would land in that derived slug.
    if (/[\r\n]/.test(name))
      throw new Error(
        "category_draft.name must be a single line — it renders as a badge and the URL slug is derived from it. Put the explanation in description instead.",
      );
    if (name.length > CATEGORY_NAME_MAX_CHARS)
      throw new Error(
        `category_draft.name is ${name.length} characters; the maximum is ${CATEGORY_NAME_MAX_CHARS}.`,
      );
    result.name = name;
  }

  if ("description" in patch) {
    const description = patch.description;
    if (typeof description !== "string")
      throw new Error(
        `category_draft.description expects a plain-text string, not JSON and not JSON-encoded; received ${describeReceived(description)}.`,
      );
    if (!description.trim())
      throw new Error(
        "category_draft.description expects a non-empty description. To leave the description exactly as the admin has it, omit the key instead of sending an empty string.",
      );
    if (description.length > CATEGORY_DESCRIPTION_MAX_CHARS)
      throw new Error(
        `category_draft.description is ${description.length} characters; the maximum is ${CATEGORY_DESCRIPTION_MAX_CHARS}.`,
      );
    result.description = description;
  }

  return result;
}
