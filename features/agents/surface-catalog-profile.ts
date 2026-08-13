/**
 * features/agents/surface-catalog-profile.ts
 *
 * The ONE definition of the composite "agent catalog profile" write contract —
 * `{description?, category?, tags?}` — shared by every surface that lets an
 * agent rewrite how ANOTHER agent is described and filed.
 *
 * WHY THIS FILE EXISTS. Two surfaces edit the same three columns on the same
 * `agent.definition` row from two different windows:
 *
 *   - `matrx-user/agent-advanced-editor` — the floating Agent Advanced Editor
 *     (`AgentContentWindow`), which shipped this contract first as
 *     `editor_catalog_profile`.
 *   - `matrx-user/agent-settings` — the floating Agent Settings window
 *     (`AgentSettingsWindow` → `AgentSettingsForm`), as
 *     `settings_catalog_profile`.
 *
 * Two target definitions over the same fields is a defect, not a coincidence:
 * the campaign's own precedent is `matrx-user/lists` / `matrx-user/list-manager`,
 * whose shared targets were lifted into `features/user-lists/`. So the CONTRACT
 * — the accepted keys, the per-field bounds, the replace-vs-patch semantics,
 * and the model-facing prose that states them — is defined exactly once, here.
 *
 * WHAT IS **NOT** SHARED, AND WHY. The lists precedent shares the target NAME
 * and the HANDLER as well. This one deliberately cannot, for two structural
 * reasons that do not apply there:
 *
 *  1. **The two mounts have different draft containers.** The advanced editor
 *     stages into the `agent-definition` Redux slice (`setAgentField`) and
 *     commits on its own footer Save. `AgentSettingsForm` stages into REACT
 *     COMPONENT STATE (`draft` / `tagsInput` `useState`) and commits by
 *     dispatching `saveAgentField` per changed field. There is no one handler
 *     that serves both — one dispatches an action, the other calls a setState.
 *     `ListDetailClient`, by contrast, is literally the same component driving
 *     the same server actions from both of its mounts.
 *  2. **A shared NAME would land the write in the wrong window.** These are
 *     both floating windows, they can be open at once — `AgentSettingsForm`'s
 *     own Messages / Variables / Tools tiles OPEN the advanced editor — and
 *     each has its own agent picker, so the agent open in one is frequently not
 *     the agent open in the other. `applySurfaceWrite` resolves a bare target
 *     name DEEPEST-FIRST across the mounted stack
 *     (`features/surfaces/runtime/surface-writeback.ts`), so one shared name
 *     would be captured by whichever window happened to be deeper and stage the
 *     text into a record the user who pressed Apply cannot see. That is the
 *     exact hazard `agent-advanced-editor` invented its `editor_` prefix for;
 *     re-using its name here would re-open it.
 *
 * So: one contract, two names, two handlers. The names differ because they must;
 * everything a model is told and everything that is enforced comes from here, so
 * the two cannot drift.
 *
 * BOUNDS COME FROM `agent-identity-metadata.ts`, the canonical validators for
 * these columns (already used by `matrx-admin/system-agents`). This module adds
 * the composite envelope around them and nothing else — it does not re-type a
 * single bound, and the prose below interpolates the real constants so the
 * contract the model SEES is the contract that is ENFORCED.
 *
 * Deliberately React-free and Redux-free: surface manifests import it for the
 * description prose, and the manifest registry is loaded by
 * `scripts/check-surface-drift.ts` outside any React/Next runtime.
 */

import {
  AGENT_CATEGORY_MAX_CHARS,
  AGENT_DESCRIPTION_MAX_CHARS,
  AGENT_TAGS_MAX_COUNT,
  AGENT_TAG_MAX_CHARS,
  normalizeAgentCategory,
  normalizeAgentDescription,
  normalizeAgentTags,
} from "@/features/agents/constants/agent-identity-metadata";

/** The patch a catalog-profile target produces. Every key is optional; at
 * least one is always present (an empty patch throws). */
export interface AgentCatalogProfilePatch {
  description?: string;
  category?: string;
  tags?: string[];
}

/** The ONLY keys any catalog-profile target accepts. */
export const AGENT_CATALOG_PROFILE_KEYS = [
  "description",
  "category",
  "tags",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Name the type we actually received, so the agent can correct itself. */
function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}

/**
 * Re-address a canonical validator's message at the composite target.
 *
 * `agent-identity-metadata`'s validators speak in terms of the FIELD
 * (`agent_description is 5000 characters; …`) because their first consumer
 * declared one target per field. Inside a composite the agent needs to know
 * which KEY of which target it got wrong, so the leading field token is
 * rewritten to `<target>.<key>` and the rest of the sentence — the part that
 * carries the actual bound — is passed through untouched. One message text,
 * addressed two ways.
 */
function rethrowAsProfileKey(error: unknown, targetName: string): never {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(
    message.replace(/^agent_(description|category|tags)/, `${targetName}.$1`),
  );
}

/**
 * Validate a catalog-profile value, WHOLE, before any of it is applied.
 *
 * Nothing here mutates page state: the caller dispatches only after this
 * returns, so a bad `tags` array can never leave a new description already
 * staged. One confirm, one all-or-nothing write.
 *
 * Unknown keys THROW and are named in the message rather than being dropped.
 * An agent reaching for `is_public` or `name` inside this object must hear a
 * refusal — silently ignoring it would let the model report a change it never
 * made.
 */
export function parseAgentCatalogProfile(
  value: unknown,
  targetName: string,
): AgentCatalogProfilePatch {
  if (!isPlainObject(value)) {
    throw new Error(
      `${targetName} expects an OBJECT like ` +
        `{"description": "...", "category": "...", "tags": ["..."]} — ` +
        `received ${describe(value)}. Send structured JSON, not a ` +
        `JSON-encoded string, and not the description on its own.`,
    );
  }

  const unknownKeys = Object.keys(value).filter(
    (key) => !(AGENT_CATALOG_PROFILE_KEYS as readonly string[]).includes(key),
  );
  if (unknownKeys.length > 0) {
    throw new Error(
      `${targetName} does not accept ${unknownKeys
        .map((key) => `"${key}"`)
        .join(", ")}. The only accepted keys are description, category and ` +
        `tags. The agent's name, model, tools, visibility and lifecycle ` +
        `flags are not writable from this surface.`,
    );
  }

  const patch: AgentCatalogProfilePatch = {};

  if (value.description !== undefined) {
    try {
      patch.description = normalizeAgentDescription(value.description);
    } catch (error) {
      rethrowAsProfileKey(error, targetName);
    }
  }
  if (value.category !== undefined) {
    try {
      patch.category = normalizeAgentCategory(value.category);
    } catch (error) {
      rethrowAsProfileKey(error, targetName);
    }
  }
  if (value.tags !== undefined) {
    try {
      patch.tags = normalizeAgentTags(value.tags);
    } catch (error) {
      rethrowAsProfileKey(error, targetName);
    }
  }

  if (Object.keys(patch).length === 0) {
    throw new Error(
      `${targetName} needs at least one of description, category or tags. ` +
        `An empty object changes nothing.`,
    );
  }

  return patch;
}

/**
 * The model-facing contract prose for a catalog-profile target.
 *
 * `tagsReadTwin` names the surface's own read value for the current tag set,
 * because `tags` is a FULL replacement and an agent that does not re-read first
 * will silently drop the tags it did not think to re-send. `landing` is the one
 * sentence that differs per surface: WHERE the staged value shows up and what
 * the user presses to commit it.
 */
export function agentCatalogProfileTargetDescription(options: {
  tagsReadTwin: string;
  landing: string;
}): string {
  return (
    "Updates how the agent is described and filed in the catalog, in ONE " +
    "atomic write. Value: an OBJECT (structured JSON, never a JSON-encoded " +
    "string) with at least one of " +
    '{"description": "a few sentences of plain prose, no markdown headings, ' +
    `up to ${AGENT_DESCRIPTION_MAX_CHARS} characters", ` +
    '"category": "a single short free-text label on one line, up to ' +
    `${AGENT_CATEGORY_MAX_CHARS} characters — reuse an existing category ` +
    'rather than inventing a near-duplicate", ' +
    `"tags": ["short", "free-text"]}. Keys you omit are left alone. ` +
    `\`tags\` is a FULL replacement of the tag set, so read the ` +
    `\`${options.tagsReadTwin}\` value first and include every tag you want ` +
    `kept (pass [] to clear them all); at most ${AGENT_TAGS_MAX_COUNT} tags, ` +
    `each up to ${AGENT_TAG_MAX_CHARS} characters, no duplicates and no ` +
    `commas inside a tag. Empty strings are rejected rather than treated as ` +
    `"clear this field" — blanking a description or a category stays a human ` +
    `edit. No other keys are accepted: the agent's name, model, tools, ` +
    `visibility and lifecycle flags are not writable here. ` +
    options.landing
  );
}
