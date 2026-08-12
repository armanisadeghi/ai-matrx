/**
 * Tool Registry Bundles vocabulary — the runtime constants behind the bundle
 * editors' name rule and the write targets' bounds.
 *
 * Deliberately a PURE module (no "use client", no React, no supabase): the
 * surface manifest imports these to spell the rules out in its write-target
 * descriptions, and a manifest must stay importable without dragging the
 * page's client graph along with it.
 *
 * `BUNDLE_NAME_RULE` was INLINE in `NewBundleDialog` as `NAME_RE`. It moved
 * here so the regex a human's typing is validated against, the regex an
 * agent's `new_bundle_draft` write is checked against, and the rule the
 * manifest TELLS the agent about are one definition and cannot drift.
 */

/**
 * Fields the `new_bundle_draft` write target accepts. Anything else is
 * refused by name rather than silently dropped.
 */
export const NEW_BUNDLE_DRAFT_FIELDS = ["name", "description"] as const;
export type NewBundleDraftField = (typeof NEW_BUNDLE_DRAFT_FIELDS)[number];

/**
 * The bundle name rule, exactly as `NewBundleDialog` enforces it for a human.
 *
 * This is stricter than it looks: the name is not a label. `tool.bundle` has
 * `UNIQUE (name)`, and `create_bundle_with_lister` derives the bundle's lister
 * TOOL name from it as `bundle:list_<name>` — the identifier a model actually
 * calls. See the manifest docblock for why that makes the name unwritable on
 * an EXISTING bundle.
 */
export const BUNDLE_NAME_RULE = {
  pattern: /^[a-z0-9][a-z0-9_-]*$/,
  describe:
    "lowercase letters, digits, hyphens and underscores, starting with a letter or digit (e.g. `browser-tools`, `search_pack`)",
} as const;

/** How a bundle's lister tool is named from the bundle name. */
export function listerToolNameFor(bundleName: string): string {
  return `bundle:list_${bundleName}`;
}

/**
 * Agent-facing bound on a staged bundle name. The column is unbounded `text`,
 * so this is a sanity ceiling on the write path, not a schema constraint — a
 * bundle name longer than this is a mistake, not a long name. Real names are
 * short slugs (`agent-core`, `google-workspace`).
 */
export const BUNDLE_NAME_MAX_CHARS = 80;

/**
 * Agent-facing bound on a staged bundle description. The column is NOT NULL
 * `text` with a `''` default and no length constraint; live descriptions run
 * roughly 40-200 characters, so this ceiling leaves generous room while still
 * rejecting an essay pasted into a one-paragraph field.
 */
export const BUNDLE_DESCRIPTION_MAX_CHARS = 600;
