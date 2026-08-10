/**
 * Canonical bounds + validators for the AUTHORED IDENTITY metadata on an
 * `agent.definition` row: the display name, the description prose, the
 * category label, and the tag set.
 *
 * Promoted out of inline handler code so there is ONE place that says what a
 * valid value is. Two consumers import from here and must not re-type the
 * numbers:
 *   - `features/surfaces/manifests/admin-system-agents.manifest.ts` —
 *     interpolates these bounds into the `writeTargets` descriptions an agent
 *     reads, so the contract the model SEES is the contract that is ENFORCED.
 *   - `useSystemAgentWriteHandlers` — calls the validators below before the
 *     value reaches the canonical `saveAgentField` write path.
 *
 * Every validator THROWS on a bad shape rather than coercing. That is
 * deliberate: the surface writeback seam
 * (`features/surfaces/runtime/surface-writeback.ts`) converts a throw into a
 * safe error envelope the calling agent reads and can correct, whereas a
 * silent coercion writes something nobody asked for onto a SYSTEM agent that
 * every user of the platform sees.
 *
 * The one normalization these DO perform is trimming, because the admin's own
 * editor trims too (`AgentSettingsForm` splits the tag input on commas and
 * trims each entry) — matching it keeps the agent path and the human path
 * identical instead of introducing a second notion of "the same tag".
 *
 * WHY THESE BOUNDS EXIST AT ALL: `agent.definition.name` / `description` /
 * `category` are plain `text` with no length constraint, and `tags` is a
 * NOT NULL `text[]`. The database will accept a 100k-character name; the UI
 * that has to render it will not. These are the first written-down bounds for
 * these columns, so they are sized to the fields that display them (the name
 * renders in a fixed 45px single-line box in `AgentSettingsForm` and in every
 * agent card and header) rather than back-derived from a constraint that does
 * not exist.
 *
 * NULLABILITY, and why "clear it" is not uniformly allowed:
 *   - `name` is NOT NULL and labels the agent everywhere, so empty is a
 *     rejection.
 *   - `description` and `category` are nullable and a human CAN blank them in
 *     the settings form, but blanking is not the outcome of any authoring ask
 *     ("write a better description" never means "delete it"). An agent that
 *     passes "" has made a mistake, so it hears about it. Clearing stays a
 *     human action in the form.
 *   - `tags` is NOT NULL with `[]` as its natural empty state, and emptying
 *     the comma-separated input is exactly how a human clears them. Retagging
 *     down to nothing is a normal curation outcome, so `[]` IS accepted.
 *
 * There is no vocabulary constant for category. It is free text on
 * `agent.definition` with no enum, lookup table, or check constraint — the
 * picker in `AgentSettingsForm` suggests the DISTINCT categories already in
 * use, so the live vocabulary is data, not code.
 */

/** Max length of `agent.definition.name` after trimming. */
export const AGENT_NAME_MAX_CHARS = 120;

/** Max length of `agent.definition.description` after trimming. */
export const AGENT_DESCRIPTION_MAX_CHARS = 4000;

/** Max length of the `agent.definition.category` label after trimming. */
export const AGENT_CATEGORY_MAX_CHARS = 60;

/** Max length of a single entry in `agent.definition.tags` after trimming. */
export const AGENT_TAG_MAX_CHARS = 40;

/** Max number of entries in `agent.definition.tags`. */
export const AGENT_TAGS_MAX_COUNT = 20;

/**
 * Validate a proposed display name. Single-line: the name renders in a fixed
 * one-line box and in every card, header, and picker, so an embedded newline
 * would silently break that layout everywhere the agent is offered.
 */
export function normalizeAgentName(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error(
      `agent_name expects a string, received ${describeType(value)}.`,
    );
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(
      "agent_name cannot be empty — an agent must carry a name. Renaming to a blank label is not a valid edit.",
    );
  }
  if (trimmed.length > AGENT_NAME_MAX_CHARS) {
    throw new Error(
      `agent_name is ${trimmed.length} characters; the maximum is ${AGENT_NAME_MAX_CHARS}.`,
    );
  }
  if (/[\n\r\t]/.test(trimmed)) {
    throw new Error(
      "agent_name must be a single-line label — it cannot contain newlines or tabs.",
    );
  }
  return trimmed;
}

/**
 * Validate a proposed description. Empty is a rejection, not a way to blank
 * the field — see the nullability note in the module docblock.
 */
export function normalizeAgentDescription(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error(
      `agent_description expects a string, received ${describeType(value)}.`,
    );
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(
      "agent_description cannot be empty. Clearing the description is a human action in the agent settings form, not an authoring edit.",
    );
  }
  if (trimmed.length > AGENT_DESCRIPTION_MAX_CHARS) {
    throw new Error(
      `agent_description is ${trimmed.length} characters; the maximum is ${AGENT_DESCRIPTION_MAX_CHARS}.`,
    );
  }
  return trimmed;
}

/**
 * Validate a proposed category label. Single-line free text; empty is a
 * rejection for the same reason as the description.
 */
export function normalizeAgentCategory(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error(
      `agent_category expects a string, received ${describeType(value)}.`,
    );
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(
      "agent_category cannot be empty. Uncategorising an agent is a human action in the agent settings form.",
    );
  }
  if (trimmed.length > AGENT_CATEGORY_MAX_CHARS) {
    throw new Error(
      `agent_category is ${trimmed.length} characters; the maximum is ${AGENT_CATEGORY_MAX_CHARS}.`,
    );
  }
  if (/[\n\r\t]/.test(trimmed)) {
    throw new Error(
      "agent_category must be a single-line label — it cannot contain newlines or tabs.",
    );
  }
  return trimmed;
}

/**
 * Validate a proposed tag set. The whole array REPLACES the current tags, so
 * this rejects rather than repairs: a dropped bad entry would silently ship a
 * tag set the caller did not ask for.
 *
 * Commas are rejected because the settings form's tag editor is a single
 * comma-separated input (`AgentSettingsForm` does
 * `tagsInput.split(",").map(trim)`) — a tag containing a comma would split
 * into two the next time a human opens that form.
 */
export function normalizeAgentTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `agent_tags expects an array of strings, received ${describeType(value)}.`,
    );
  }
  if (value.length > AGENT_TAGS_MAX_COUNT) {
    throw new Error(
      `agent_tags has ${value.length} entries; the maximum is ${AGENT_TAGS_MAX_COUNT}.`,
    );
  }
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") {
      throw new Error(
        `agent_tags entries must be strings; found ${describeType(entry)}.`,
      );
    }
    const tag = entry.trim();
    if (tag.length === 0) {
      throw new Error(
        "agent_tags cannot contain an empty tag (pass [] to clear all tags).",
      );
    }
    if (tag.length > AGENT_TAG_MAX_CHARS) {
      throw new Error(
        `agent_tags entry "${tag}" is ${tag.length} characters; the maximum is ${AGENT_TAG_MAX_CHARS}.`,
      );
    }
    if (tag.includes(",")) {
      throw new Error(
        `agent_tags entry "${tag}" contains a comma; the agent settings tag editor is comma-separated, so pass each tag as its own array entry.`,
      );
    }
    if (seen.has(tag)) {
      throw new Error(`agent_tags contains the duplicate tag "${tag}".`);
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
