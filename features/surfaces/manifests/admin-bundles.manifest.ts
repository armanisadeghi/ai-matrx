/**
 * Surface manifest — Tool Registry Bundles admin (`matrx-admin/bundles`).
 *
 * ADMIN SURFACE. Drives `/administration/agents/bundles` — a single-page
 * master/detail admin for `tool_bundle` rows (system + personal), their
 * lister tool, and their `tool_bundle_member` rows. Backed by
 * `features/tool-registry/bundles/components/BundlesAdminPage.tsx`.
 *
 * What an agent bound here may safely do: read the bundle list/filter state,
 * the selected bundle's identity and metadata, and its member tools — then
 * help the admin name/describe a new bundle, draft member aliases, or
 * explain what a bundle's lister tool does. It must NOT assume a create/
 * add/remove action has happened; those are the admin clicking Save/Add/
 * Remove in the dialogs.
 *
 * Emitters (real, wired): `BundlesAdminPage` mounts this surface's FIRST
 * `SurfaceRuntimeProvider`, fed by
 * `features/tool-registry/bundles/components/BundlesSurfaceRuntime.tsx` — a
 * page-scoped store the list, the detail panel and the create dialog publish
 * into, because the two editors are owned by children that only mount while
 * they are on screen and there was no shared scope-building point before.
 *
 * ── WRITE TARGETS: what earns one here, and what does not ─────────────────
 *
 * This is an admin console over the REAL tool registry, so the judgment bar
 * is not "is this an input" but "would renaming or reshaping this break a
 * call site". Two things pass, and they are the only two.
 *
 * YES — `new_bundle_draft` ({name?, description?}) and `bundle_description`
 * (the selected bundle's description). A bundle description is authored copy
 * whose whole job is to explain what the bundle groups together; it is shown
 * to admins and in the agent bundle picker, and an agent drafts it well. A
 * NEW bundle's name is safe for the same reason an existing one is not:
 * nothing references it yet, and `create_bundle_with_lister` mints the
 * lister FROM it atomically when the admin presses Create.
 *
 * TWO TARGETS, NOT ONE PARTIAL-PATCH OBJECT. The two live precedents pull in
 * opposite directions and this surface sits with the second. `email_draft`
 * and `lookup_draft` are ONE object because a single open dialog is the
 * review unit and one Save commits every field in it. `matrx-admin/tool-
 * registry` splits into three targets because they are independent decisions
 * an admin declines independently. Here the fields do not even share a
 * RECORD: `new_bundle_draft` stages a bundle that does not exist yet, behind
 * a modal, committed by "Create bundle"; `bundle_description` rewrites copy
 * on a row that already exists, in the inline detail panel, committed by
 * "Save". Collapsing them would mean one target whose destination — and
 * whose acceptance of `name` — flips on whether a URL param happens to be
 * set, so a mis-inference would pop a stray create form while the admin's
 * selected bundle sat untouched beside it. Keeping them apart makes the
 * agent's CHOICE OF TARGET its declaration of intent, and that choice is
 * what the admin reads in the confirm dialog. (`lookup_draft` could collapse
 * because its destination genuinely lived in page state — a row dialog was
 * already open. Here both destinations are nameable up front.)
 *
 * NO, deliberately, and each for a reason:
 *
 *  - **A bundle's NAME on an EXISTING row** is a DISPATCH KEY, not a label.
 *    `tool.bundle` has `UNIQUE (name)`, and every bundle's lister tool is
 *    named `bundle:list_<name>` — verified live: `agent-core` →
 *    `bundle:list_agent-core`, `google-workspace` →
 *    `bundle:list_google-workspace`. That lister name is the identifier a
 *    MODEL calls. `updateBundle` PATCHes `tool.bundle` only, so renaming a
 *    bundle leaves its lister still called `bundle:list_<old-name>`: the
 *    convention silently desyncs and every agent already holding that
 *    lister's id keeps calling the old name. This is exactly why
 *    `matrx-admin/tool-registry` refused `tool_name` and `matrx-admin/lookups`
 *    refused `name` on an existing row.
 *  - **The Active toggle** is capability, not copy. `listAgentBundleOptions`
 *    filters `is_active = true`, so flipping it adds or removes the bundle
 *    from what agents can be given.
 *  - **The System bundle switch** is ownership/visibility — platform-wide vs
 *    personal — which is the identity/permissions class the bar excludes.
 *  - **The Metadata JSON** carries dispatch pointers, not prose:
 *    `listAgentBundleOptions` reads `server_slug` out of it to decide whether
 *    a bundle is an auto-managed MCP bundle, and the panel's own empty-state
 *    hint tells admins to link `lister_tool_id` through it.
 *  - **MEMBERSHIP — adding or removing a tool** is a capability decision: it
 *    changes what an agent loading this bundle can call. A member's LOCAL
 *    ALIAS is refused for the same reason as the bundle name — the alias is
 *    the identifier the model invokes once `bundle_lister` hot-swaps members
 *    in, so renaming one breaks call sites mid-run.
 *  - **The bundle search box and the Active/All filter** are browse state.
 *  - **CREATE and DELETE** stay human. Note that this console has no delete
 *    at all: `bundles.service.ts` exposes no `deleteBundle` and the page
 *    renders no delete control (only *member* removal), so nothing here can
 *    orphan a bundle. If one were ever added it would need care rather than
 *    a target — agents reference a bundle by putting its lister tool's UUID
 *    in their own `tools` array, so a deleted bundle would leave those agent
 *    rows pointing at a lister whose members no longer resolve. The table
 *    carries a `deleted_at` column for exactly that reason.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  BUNDLE_DESCRIPTION_MAX_CHARS,
  BUNDLE_NAME_MAX_CHARS,
  BUNDLE_NAME_RULE,
  NEW_BUNDLE_DRAFT_FIELDS,
} from "@/features/tool-registry/bundles/bundlesVocabulary";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_BUNDLES_SURFACE_NAME = "matrx-admin/bundles";

const groups: SurfaceValueGroup[] = [
  {
    key: "bundle_list",
    label: "Bundle list",
    sortOrder: 100,
    description: "The bundle list, its filter, and the search box.",
  },
  {
    key: "bundle_detail",
    label: "Bundle detail",
    sortOrder: 200,
    description:
      "The selected bundle's identity, metadata, and member tools.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Bundle list ──────────────────────────────────────────────────────
  {
    name: "bundles_filter",
    label: "Bundle filter",
    description:
      '"active" or "all" — whether the list shows only active bundles or every bundle. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 6,
    sortOrder: 100,
    group: "bundle_list",
  },
  {
    name: "bundles_search",
    label: "Bundle search text",
    description:
      "Text currently typed in the bundle search box. Empty when untouched. Always present as a string.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 20,
    sortOrder: 110,
    group: "bundle_list",
  },
  {
    name: "bundle_count",
    label: "Bundle count",
    description: "Number of bundles currently loaded into the list.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 120,
    group: "bundle_list",
  },
  {
    name: "bundles_list",
    label: "Bundle list rows",
    description:
      "Every loaded bundle — id, name, description, is_active, is_system. Bindable rather than auto-context; potentially dozens of rows.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 2000,
    autoContext: false,
    sortOrder: 130,
    group: "bundle_list",
  },

  // ── Bundle detail ────────────────────────────────────────────────────
  {
    name: "selected_bundle_id",
    label: "Selected bundle id",
    description:
      "UUID of the bundle open in the detail panel. Empty when no bundle is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 200,
    group: "bundle_detail",
  },
  {
    name: "selected_bundle",
    label: "Selected bundle",
    description:
      "Identity + metadata of the selected bundle: name, description, is_active, is_system, lister_tool_id, metadata JSON. Absent when no bundle is selected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 210,
    group: "bundle_detail",
  },
  {
    name: "bundle_members",
    label: "Bundle members",
    description:
      "Tools currently in the selected bundle, each with its local alias, sort order, and the underlying tool's name/description. Bindable rather than auto-context. Absent when no bundle is selected; empty array before members load.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    autoContext: false,
    sortOrder: 220,
    group: "bundle_detail",
  },
  {
    name: "bundle_member_count",
    label: "Bundle member count",
    description:
      "Number of tools in the selected bundle. Absent when no bundle is selected.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 230,
    group: "bundle_detail",
  },
  {
    name: "bundle_editor",
    label: "Selected bundle editor",
    description:
      "The LIVE, possibly-unsaved state of the selected bundle's inline identity editor: bundle_id, bundle_name, description, description_dirty (the description differs from the saved row), is_active, saving. This is the read twin of the `bundle_description` write target — read it to see what is staged right now, which is not necessarily what `selected_bundle` says is saved. Absent when no bundle is selected, which is exactly when that target refuses.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 250,
    sortOrder: 240,
    group: "bundle_detail",
  },
  {
    name: "new_bundle_editor",
    label: "New bundle form",
    description:
      "The open New bundle dialog: name, description, is_system, lister_tool_name (what the lister tool WILL be called, derived from the typed name), busy. Read twin of the `new_bundle_draft` write target. Absent when the dialog is closed — note that applying `new_bundle_draft` opens it, so this being absent does not mean that target is unavailable.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 250,
    sortOrder: 300,
    group: "bundle_list",
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "new_bundle_draft",
    label: "New bundle draft",
    description:
      `Stages authored text into the "New bundle" form. If the form is already open it stages there; if it is CLOSED, applying OPENS it and stages into that, so the admin sees the proposal in the real form — opening it creates nothing and Cancel discards it. Nothing is written to the database either way; the admin still presses "Create bundle", and that press is never an agent action. ` +
      `Value: an object with AT LEAST ONE of { ${NEW_BUNDLE_DRAFT_FIELDS.join(", ")} }. Each key REPLACES that whole input; omit a key to leave it exactly as the admin left it (nothing here appends). Plain text, not JSON and not JSON-encoded. ` +
      `\`description\` — what this bundle groups together and when an agent should reach for it, at most ${BUNDLE_DESCRIPTION_MAX_CHARS} characters. It is shown to admins here and in the agent bundle picker, so write it as a decision aid; live descriptions run roughly one to three sentences. ` +
      `\`name\` — the bundle's globally-unique key, at most ${BUNDLE_NAME_MAX_CHARS} characters: ${BUNDLE_NAME_RULE.describe}. This is NOT a label. Creating the bundle also mints its lister tool as \`bundle:list_<name>\`, which is the identifier a model will actually call, so pick the name you would want to see in a tool list. A name already held by a bundle in \`bundles_list\` is refused. ` +
      `The System bundle switch (platform-wide vs personal), the bundle's members, and pressing Create are the admin's own controls and are NOT writable — describe what you would pick and let the admin set them. ` +
      `To rewrite an EXISTING bundle's description instead, use \`bundle_description\`; this target only ever fills the create form.`,
    valueType: "object",
    updatesValue: "new_bundle_editor",
    mode: "draft",
    applyPolicy: "ask",
    group: "bundle_list",
    sortOrder: 400,
  },
  {
    name: "bundle_description",
    label: "Bundle description",
    description:
      `Replaces the description of the bundle currently open in the detail panel — read \`bundle_editor\` first to see which bundle that is and what is staged in it right now. The panel is inline, not a dialog: the staged text appears in the Description box and the admin still presses "Save", so nothing reaches the database on apply. ` +
      `Value: a single string, the description text itself — plain text, not JSON and not JSON-encoded, and not an object. This is a FULL replacement, not a merge: include anything you mean to keep. At most ${BUNDLE_DESCRIPTION_MAX_CHARS} characters. The empty string is REFUSED rather than treated as a way to clear the field; blanking a description is the admin's own edit. ` +
      `Write it as a decision aid — what the bundle groups together and when an agent should reach for it — because this text is what the bundle picker shows. ` +
      `REFUSED when no bundle is selected: this target will not pick a row for you, so ask the admin to select the bundle they mean. Also refused while that bundle is saving. ` +
      `The bundle's NAME is deliberately not writable here even though the input sits right beside this one: the name is unique and the bundle's lister tool is called \`bundle:list_<name>\`, so renaming the row leaves every agent still calling the old lister name. Renaming a bundle is a human migration. The Active toggle, the Metadata JSON, and the members table are likewise the admin's own controls.`,
    valueType: "string",
    updatesValue: "bundle_editor",
    mode: "draft",
    applyPolicy: "ask",
    group: "bundle_detail",
    sortOrder: 410,
  },
];

export const adminBundlesManifest: SurfaceManifest = {
  surfaceName: ADMIN_BUNDLES_SURFACE_NAME,
  readiness: "verified",
  readinessNote:
    "Emitter + write half both live. BundlesAdminPage mounts the SurfaceRuntimeProvider; the list, the selected bundle's detail panel and the New bundle dialog publish into the page-scoped store in components/BundlesSurfaceRuntime.tsx, which builds both the scope and the new_bundle_draft / bundle_description handlers. Not yet mirrored to ui.ui_surface_write_target.",
  label: "Bundles Admin",
  urlPattern: "/administration/agents/bundles",
  intro: `<surface_intro>
This is an ADMIN surface: the Tool Registry bundles console at /administration/agents/bundles.

A bundle (tool_bundle) groups tools under one "lister" tool an agent can expand on demand — system bundles are platform-wide, personal bundles are owned by one user. The page is master/detail: bundles_list is the left sidebar (filtered by bundles_filter / bundles_search), and selecting a row loads selected_bundle plus its bundle_members.

What you may safely do: help the admin name and describe a bundle, draft short local aliases for member tools, and explain what a bundle's lister does. You never create, add, remove, or save anything yourself — those are the admin's own dialog actions.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** One row in the bundle list. */
export interface AdminBundleListRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_system: boolean;
}

/** The selected bundle's identity + metadata. */
export interface AdminBundleDetail {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_system: boolean;
  lister_tool_id: string | null;
  metadata: Record<string, unknown>;
}

/** One member row in the selected bundle. */
export interface AdminBundleMemberRow {
  tool_id: string;
  tool_name: string;
  tool_description: string | null;
  local_alias: string;
  sort_order: number;
}

/**
 * The selected bundle's LIVE inline editor — staged, not necessarily saved.
 * Read twin of the `bundle_description` write target.
 */
export interface AdminBundleEditor {
  bundle_id: string;
  bundle_name: string;
  description: string;
  /** The staged description differs from the saved row. */
  description_dirty: boolean;
  is_active: boolean;
  saving: boolean;
}

/** The open New bundle dialog. Read twin of `new_bundle_draft`. */
export interface AdminNewBundleEditor {
  name: string;
  description: string;
  is_system: boolean;
  /** What the lister tool will be called, derived from the typed name. */
  lister_tool_name: string;
  busy: boolean;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value
 * declared `alwaysAvailable: true`; optional keys mirror `alwaysAvailable:
 * false`.
 */
export function createAdminBundlesScope(values: {
  // alwaysAvailable: true → required
  bundles_filter: "active" | "all";
  bundles_search: string;
  bundle_count: number;
  bundles_list: AdminBundleListRow[];
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  selected_bundle_id?: string;
  selected_bundle?: AdminBundleDetail;
  bundle_members?: AdminBundleMemberRow[];
  bundle_member_count?: number;
  bundle_editor?: AdminBundleEditor;
  new_bundle_editor?: AdminNewBundleEditor;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
