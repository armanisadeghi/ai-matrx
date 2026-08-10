/**
 * Canonical bounds + validators for the AUTHORED metadata on a
 * `tool.definition` row: the description, the category label, and the tag set.
 *
 * Promoted out of the admin editor's inline handling so there is ONE place
 * that says what a valid value is. Two consumers import from here and must not
 * re-type the numbers:
 *   - `features/surfaces/manifests/admin-tool-registry.manifest.ts` —
 *     interpolates these bounds into the `writeTargets` descriptions an agent
 *     reads, so the contract the model sees IS the contract enforced.
 *   - `ToolViewPage`'s surface write handlers — call the validators below
 *     before touching the canonical write path.
 *
 * Every validator THROWS on a bad shape rather than coercing. That is
 * deliberate: the surface writeback seam
 * (`features/surfaces/runtime/surface-writeback.ts`) converts a throw into a
 * safe error envelope the calling agent reads and can correct, whereas a
 * silent coercion writes something nobody asked for into the registry.
 *
 * The one normalization these DO perform is trimming, because the admin's own
 * editor trims too (`ToolEditPage` splits the tag input on commas and trims
 * each entry) — matching it keeps the agent path and the human path identical
 * instead of introducing a second notion of "the same tag".
 *
 * There is no vocabulary constant for category or tool group: both are free
 * text on `tool.definition` with no enum, lookup table, or check constraint.
 * The live category vocabulary is data, not code — the catalogue emitter
 * publishes it as the surface's `tool_categories` value.
 */

/** Max length of `tool.definition.description` after trimming. */
export const TOOL_DESCRIPTION_MAX_CHARS = 4000;

/** Max length of the `tool.definition.category` label after trimming. */
export const TOOL_CATEGORY_MAX_CHARS = 60;

/** Max length of a single entry in `tool.definition.tags` after trimming. */
export const TOOL_TAG_MAX_CHARS = 40;

/** Max number of entries in `tool.definition.tags`. */
export const TOOL_TAGS_MAX_COUNT = 20;

/**
 * Validate a proposed tool description. `tool.definition.description` is NOT
 * NULL and the admin editor refuses to save an empty one, so an empty string
 * is a rejection here too rather than a way to blank the field.
 */
export function normalizeToolDescription(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error(
      `tool_description expects a string, received ${describeType(value)}.`,
    );
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(
      "tool_description cannot be empty — a tool definition must carry a description.",
    );
  }
  if (trimmed.length > TOOL_DESCRIPTION_MAX_CHARS) {
    throw new Error(
      `tool_description is ${trimmed.length} characters; the maximum is ${TOOL_DESCRIPTION_MAX_CHARS}.`,
    );
  }
  return trimmed;
}

/**
 * Validate a proposed category label. Returns `null` for the empty string —
 * the column is nullable and the admin API maps `""` to `null`, so clearing
 * the category is a legitimate value, not a bad shape.
 */
export function normalizeToolCategory(value: unknown): string | null {
  if (typeof value !== "string") {
    throw new Error(
      `tool_category expects a string, received ${describeType(value)}.`,
    );
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > TOOL_CATEGORY_MAX_CHARS) {
    throw new Error(
      `tool_category is ${trimmed.length} characters; the maximum is ${TOOL_CATEGORY_MAX_CHARS}.`,
    );
  }
  if (/[\n\r\t]/.test(trimmed)) {
    throw new Error(
      "tool_category must be a single-line label — it cannot contain newlines or tabs.",
    );
  }
  return trimmed;
}

/**
 * Validate a proposed tag set. The whole array replaces the current tags, so
 * this rejects rather than repairs: a dropped bad entry would silently ship a
 * tag set the caller did not ask for.
 *
 * Commas are rejected because the admin's tag editor is a comma-separated
 * single input — a tag containing a comma would split into two the next time a
 * human edits the tool.
 */
export function normalizeToolTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `tool_tags expects an array of strings, received ${describeType(value)}.`,
    );
  }
  if (value.length > TOOL_TAGS_MAX_COUNT) {
    throw new Error(
      `tool_tags has ${value.length} entries; the maximum is ${TOOL_TAGS_MAX_COUNT}.`,
    );
  }
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") {
      throw new Error(
        `tool_tags entries must be strings; found ${describeType(entry)}.`,
      );
    }
    const tag = entry.trim();
    if (tag.length === 0) {
      throw new Error("tool_tags cannot contain an empty tag.");
    }
    if (tag.length > TOOL_TAG_MAX_CHARS) {
      throw new Error(
        `tool_tags entry "${tag}" is ${tag.length} characters; the maximum is ${TOOL_TAG_MAX_CHARS}.`,
      );
    }
    if (tag.includes(",")) {
      throw new Error(
        `tool_tags entry "${tag}" contains a comma; the admin tag editor is comma-separated, so pass each tag as its own array entry.`,
      );
    }
    if (seen.has(tag)) {
      throw new Error(`tool_tags contains the duplicate tag "${tag}".`);
    }
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

function describeType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}
