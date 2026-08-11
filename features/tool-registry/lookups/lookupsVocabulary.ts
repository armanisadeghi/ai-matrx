/**
 * Tool Registry Lookups vocabulary — the runtime constants behind the three
 * lookup editors' enums and name rules.
 *
 * Deliberately a PURE module (no "use client", no React, no supabase): the
 * surface manifest imports these to spell the rules out in its write-target
 * description, and a manifest must stay importable without dragging the
 * page's client graph along with it.
 *
 * The name patterns here were INLINE in `LookupsAdminPage`'s three dialogs.
 * They moved here so the regex a human's typing is validated against, the
 * regex an agent's `lookup_draft` write is checked against, and the rule the
 * manifest TELLS the agent about are one definition and cannot drift.
 */

/** The three lookup tables, one per tab. Order matches the TabsList. */
export const LOOKUP_TABS = ["clients", "surfaces", "executors"] as const;
export type LookupTab = (typeof LOOKUP_TABS)[number];

/** The physical table each tab edits — used in agent-facing error prose. */
export const LOOKUP_TAB_TABLE: Record<LookupTab, string> = {
  clients: "ui.ui_client",
  surfaces: "ui.ui_surface",
  executors: "tool.executor",
};

/** Whether an open editor is authoring a NEW row or changing an existing one. */
export const LOOKUP_EDITOR_MODES = ["create", "edit"] as const;
export type LookupEditorMode = (typeof LOOKUP_EDITOR_MODES)[number];

/**
 * Fields the `lookup_draft` write target accepts. Anything else is refused by
 * name rather than silently dropped.
 */
export const LOOKUP_DRAFT_FIELDS = ["name", "description"] as const;
export type LookupDraftField = (typeof LOOKUP_DRAFT_FIELDS)[number];

/**
 * Name rules per tab, as the dialogs enforce them.
 *
 * `clients` and `executors` validate the WHOLE primary key. `surfaces` is
 * different by construction: its dialog composes the PK as
 * `<client_name>/<local>` and only the LOCAL part is an input, so the pattern
 * here is the local part alone — which is also all `lookup_draft.name` may
 * ever set on that tab.
 */
export const LOOKUP_NAME_RULES: Record<
  LookupTab,
  { pattern: RegExp; describe: string }
> = {
  clients: {
    pattern: /^[a-z][a-z0-9-]*$/,
    describe:
      "lowercase letters, digits and hyphens, starting with a letter (e.g. `matrx-mobile`)",
  },
  surfaces: {
    pattern: /^[a-z0-9-]+$/,
    describe:
      "the LOCAL part only — lowercase letters, digits and hyphens (e.g. `notes`). The client prefix is the admin's own Client select and is never set through this target; the saved primary key becomes `<client>/<local>`",
  },
  executors: {
    pattern: /^[a-z][a-z0-9._-]*$/,
    describe:
      "lowercase letters, digits, `.`, `_` and `-`, starting with a letter. Convention: `mcp.<slug>` for MCP-backed executors; `aidream`, `matrx-ai-core`, `matrx-local`, `chrome-extension`, `matrx-user` for first-party",
  },
};

/**
 * Agent-facing bound on a staged name. The columns are unbounded `text`, so
 * this is a sanity ceiling on the write path, not a schema constraint — a
 * lookup key longer than this is a mistake, not a long name.
 */
export const LOOKUP_NAME_MAX_CHARS = 120;

/**
 * Agent-facing bound on a staged description. These are one-line reference
 * labels (the client dialog's own placeholder reads "Short, human-readable
 * label"), and the column is NOT NULL `text` with a `''` default.
 */
export const LOOKUP_DESCRIPTION_MAX_CHARS = 500;
