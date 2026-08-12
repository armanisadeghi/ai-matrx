/**
 * Pure validation core for the `matrx-admin/agent-apps` write targets that the
 * EDIT mount (`/administration/agents/agent-apps/edit/[id]`) registers:
 * `app_metadata`, `app_category`, `app_tags`.
 *
 * Kept free of React and of the service layer for two reasons. First, the
 * failure mode worth proving in unit tests is a validation hole, not a render
 * bug: `PATCH /api/agent-apps/[id]` is a raw `.update(body)` passthrough with
 * NO server-side column allow-list, so whatever object leaves this module is
 * written to `app.definition` verbatim — the allow-list here IS the guard.
 * Second, a throw raised out here lands synchronously inside the writeback
 * seam (`applySurfaceWrite`), which turns it into the safe error envelope the
 * agent reads, instead of escaping from inside an async React updater.
 *
 * Contract (mirrors the manifest target descriptions exactly):
 * - `app_metadata` is a PARTIAL `{ name?, tagline?, description? }`. Omitted
 *   fields keep their current value; an empty string CLEARS `tagline` /
 *   `description` (→ null). `name` may never be blanked — the row requires it.
 *   Unknown keys throw: `slug`, `status`, `is_featured`, `is_verified`,
 *   `is_public`, the rate limits and `component_code` are NOT authored copy and
 *   are deliberately unreachable from here.
 * - `app_category` is ONE system category name from `platform.categories`
 *   (`dimension = 'app'`), matched case-insensitively and resolved to that
 *   row's canonical casing. The human picker
 *   (`AgentAppCategoryPicker`) also accepts free text; the agent path does not
 *   — an agent inventing a category fragments a taxonomy that apps reference
 *   by loose text.
 * `app_tags` has NO validator here on purpose: `app.definition.tags` already
 * has one canonical contract in `features/agent-apps/route/agent-app-entity-writes.ts`
 * (written for the user-facing `matrx-user/agent-apps` surface), and the admin
 * console writes the same column with the same meaning. The edit shell imports
 * `validateAppTags` from there so one column keeps one contract.
 *
 * `app_category` is the one place the admin console is deliberately STRICTER
 * than the user-facing surface: `validateAppCategory` there accepts any
 * non-empty string, because a user's own picker offers free-text categories.
 * On the moderation console an agent must choose from the system vocabulary —
 * an agent inventing a category fragments the taxonomy it is here to govern.
 */

/** Authored copy on `app.definition` an agent may write from the edit shell. */
export const AGENT_APP_METADATA_WRITE_KEYS = [
  "name",
  "tagline",
  "description",
] as const;

export type AgentAppMetadataWriteKey =
  (typeof AGENT_APP_METADATA_WRITE_KEYS)[number];

export interface AgentAppMetadataPatch {
  name?: string;
  tagline?: string | null;
  description?: string | null;
}
function asRecord(value: unknown, target: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${target} expects an object value.`);
  }
  return value as Record<string, unknown>;
}

/**
 * Validate an `app_metadata` write value into an `UpdateAgentAppInput` patch.
 * Throws on any contract break — including the identity/governance fields that
 * are reachable on the DB row but not through this target.
 */
export function validateAgentAppMetadataWrite(
  value: unknown,
): AgentAppMetadataPatch {
  const obj = asRecord(value, "app_metadata");
  const allowed = new Set<string>(AGENT_APP_METADATA_WRITE_KEYS);
  const unknown = Object.keys(obj).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new Error(
      `app_metadata: unknown field(s) ${unknown.join(", ")}. Allowed: ${AGENT_APP_METADATA_WRITE_KEYS.join(", ")}. The slug, status, featured/verified/public flags and rate limits are not authored copy and are not writable by an agent.`,
    );
  }

  const patch: AgentAppMetadataPatch = {};
  for (const key of AGENT_APP_METADATA_WRITE_KEYS) {
    const raw = obj[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== "string") {
      throw new Error(`app_metadata: ${key} must be a string.`);
    }
    const trimmed = raw.trim();
    if (key === "name") {
      if (!trimmed) {
        throw new Error(
          "app_metadata: name cannot be empty — every agent app must keep a display name.",
        );
      }
      patch.name = trimmed;
    } else {
      // Empty string is the documented "clear this field" signal → null.
      patch[key] = trimmed || null;
    }
  }

  if (Object.keys(patch).length === 0) {
    throw new Error(
      `app_metadata: provide at least one of ${AGENT_APP_METADATA_WRITE_KEYS.join(", ")}.`,
    );
  }
  return patch;
}

/**
 * Validate an `app_category` write value against the LIVE system vocabulary
 * (the `platform.categories` rows the edit shell loaded and published as
 * `available_app_categories`). Returns the canonical casing of the matched
 * category name. Throws — listing the real vocabulary — on anything else.
 */
export function validateAgentAppCategoryWrite(
  value: unknown,
  systemCategoryNames: readonly string[],
): string {
  if (typeof value !== "string") {
    throw new Error("app_category expects a string value.");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(
      "app_category cannot be empty — clearing an app's category is a human decision, not an agent write.",
    );
  }
  if (systemCategoryNames.length === 0) {
    throw new Error(
      "app_category: the system category list has not loaded on this page, so the value cannot be validated. Try again once the page has finished loading.",
    );
  }
  const match = systemCategoryNames.find(
    (name) => name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (!match) {
    throw new Error(
      `app_category: "${trimmed}" is not a system category. Choose exactly one of: ${systemCategoryNames.join(", ")}.`,
    );
  }
  // Case-insensitive match resolved to the vocabulary's own casing — the same
  // matching rule AgentAppCategoryPicker uses. Documented in the manifest so
  // this is a stated normalization, not a silent coercion of a wrong value.
  return match;
}
