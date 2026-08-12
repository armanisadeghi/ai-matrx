/**
 * Surface manifest — Tool Registry Lookups admin (`matrx-admin/lookups`).
 *
 * ADMIN SURFACE. Drives `/administration/agents/lookups` — tabbed CRUD over
 * three small reference tables: `ui_client`, `ui_surface` (legacy quick
 * editor — the page itself points admins to `/administration/ui/surfaces`
 * for real surface work), and `tool.executor`. Backed by
 * `features/tool-registry/lookups/components/LookupsAdminPage.tsx`.
 *
 * What an agent bound here may safely do: read the active tab and the
 * loaded rows for that tab, then help the admin draft a name/description
 * for a new client, surface, or executor, or explain what an existing row
 * is for. It must NOT assume a create/save/activate/deactivate action has
 * happened; those are the admin's own dialog/toggle actions.
 *
 * Emitters (real, wired): `LookupsAdminPage` mounts this surface's FIRST
 * `SurfaceRuntimeProvider`, fed by
 * `features/tool-registry/lookups/components/LookupsSurfaceRuntime.tsx` —
 * a page-scoped store each CRUD sub-component publishes into, because the
 * three tables' rows and the open row dialog are owned by different
 * children and there was no shared scope-building point before.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  LOOKUP_DESCRIPTION_MAX_CHARS,
  LOOKUP_NAME_MAX_CHARS,
  LOOKUP_NAME_RULES,
} from "@/features/tool-registry/lookups/lookupsVocabulary";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_LOOKUPS_SURFACE_NAME = "matrx-admin/lookups";

const groups: SurfaceValueGroup[] = [
  {
    key: "lookups_console",
    label: "Lookups console",
    sortOrder: 100,
    description:
      "Which lookup table tab is active and the rows loaded for each of the three tables.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "lookups_tab",
    label: "Active tab",
    description:
      '"clients", "surfaces", or "executors" — which lookup table the admin is editing. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    sortOrder: 100,
    group: "lookups_console",
  },
  {
    name: "ui_clients_list",
    label: "UI clients",
    description:
      "Every row loaded from ui_client: name (PK), description, sort_order, is_active. Bindable rather than auto-context.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 800,
    autoContext: false,
    sortOrder: 110,
    group: "lookups_console",
  },
  {
    name: "ui_client_count",
    label: "UI client count",
    description: "Number of ui_client rows loaded.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 2,
    sortOrder: 120,
    group: "lookups_console",
  },
  {
    name: "ui_surfaces_list",
    label: "UI surfaces (legacy tab)",
    description:
      "Every row loaded from ui_surface via this legacy quick editor: name (PK), client_name, description, sort_order, is_active. Bindable rather than auto-context. The canonical surface admin is /administration/ui/surfaces — this tab is a lightweight fallback.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 1500,
    autoContext: false,
    sortOrder: 130,
    group: "lookups_console",
  },
  {
    name: "ui_surface_count",
    label: "UI surface count (filtered)",
    description:
      "Number of ui_surface rows currently visible after the client filter is applied.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 140,
    group: "lookups_console",
  },
  {
    name: "ui_surfaces_client_filter",
    label: "UI surfaces client filter",
    description:
      '"__all__" or a specific ui_client name — filters the UI Surfaces tab table. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    sortOrder: 150,
    group: "lookups_console",
  },
  {
    name: "tool_executors_list",
    label: "Tool executors",
    description:
      "Every row loaded from tool.executor: name (PK), description, parent_executor_name, mcp_server_id, is_active, config JSON. Bindable rather than auto-context.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 1500,
    autoContext: false,
    sortOrder: 160,
    group: "lookups_console",
  },
  {
    name: "tool_executor_count",
    label: "Tool executor count",
    description: "Number of tool.executor rows loaded.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 170,
    group: "lookups_console",
  },
  {
    name: "lookup_editor",
    label: "Open row editor",
    description:
      'The row dialog the admin currently has open — the ONLY thing `lookup_draft` can write into: { tab, table, mode: "create" | "edit", name, description, name_editable }. `name` and `description` are read LIVE from the dialog\'s inputs, so a staged draft reads back here before anyone saves. On the surfaces tab `name` is the LOCAL part only (the dialog composes the saved key as `<client>/<local>` and the client prefix is a separate select). `name_editable` is false on an existing row, where the name is the disabled primary key. ABSENT whenever no dialog is open (and while two are somehow open) — when it is absent, no write can land, so check it before attempting one.',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 180,
    group: "lookups_console",
  },
];

/**
 * Write half of the 360 loop — what an agent may stage into a lookup row.
 *
 * THE SHAPE OF THIS PAGE IS THE DESIGN PROBLEM. It is three tables behind
 * three tabs (`ui.ui_client`, `ui.ui_surface`, `tool.executor`), the tabs all
 * stay MOUNTED (`TabsContent` is `forceMount` + CSS-hidden), and the only
 * editable state on the whole screen lives inside a row dialog that is mounted
 * ONLY while the admin is creating or editing. So "set the name" is not a
 * well-formed instruction here until the live editor is resolved.
 *
 * It is resolved from PAGE STATE, never from the payload — the target
 * deliberately has no `tab`/`table`/`row` key for a model to get wrong. When
 * one row dialog is open, that dialog is the target; two open, or a save in
 * flight, throw with the reason. The read twin is `lookup_editor`, which is
 * ABSENT when nothing is open, so an agent can see the situation before it
 * writes rather than discovering it by refusal.
 *
 * WHEN NOTHING IS OPEN, APPLYING OPENS THE "NEW" FORM on the active tab and
 * stages there — the `CreateStoreInline` call in the RAG data-stores adopter,
 * for its reason (staging into something the admin can SEE is the whole
 * contract of `draft`, and opening a create form is reversible and creates
 * nothing) plus one specific to this page: the row dialogs are MODAL, so
 * Radix puts `pointer-events: none` on the body and the floating agent chat
 * cannot be typed into while one is up. An admin therefore CANNOT open a
 * dialog and then ask for help — the only workable order is to ask first,
 * with the page idle, and have the form appear already filled. A target that
 * only ever wrote into an already-open dialog would have looked correct in
 * code and been unreachable in use. It still refuses to pick an existing ROW:
 * auto-open only ever creates, and editing an existing row requires the admin
 * to have opened it.
 *
 * ONE OBJECT, NOT TWO TARGETS. `matrx-admin/tool-registry` splits its three
 * fields and `matrx-admin/agent-apps` splits its three, both because each
 * field is an independent decision persisted independently — a rename there
 * re-labels a live thing everywhere it is offered, so it deserves its own
 * confirm and its own decline. Neither holds here. `name` is only ever
 * writable on a row that DOES NOT EXIST YET (see below), so there is nothing
 * anywhere to re-label; name and description are authored in the same dialog,
 * for the same new row, and committed by the same single Save click. The open
 * dialog IS the review unit, which is the `matrx-admin/email` `email_draft`
 * case, so it gets one confirm showing the whole proposed row. Bundling also
 * buys atomicity the split cannot: the handler validates the entire patch
 * before any setter runs, so a rejected name can never leave a half-written
 * row staged under the admin's cursor.
 *
 * `mode: "draft"`, and honestly so — unlike `matrx-admin/tool-registry`, whose
 * detail page is server-rendered read-only props with no editor state to stage
 * into, every value here lands in the dialog's own `useState` through the very
 * setters the admin's typing calls (`setName`, `setDescription`). Nothing
 * reaches `ui.ui_client` / `ui.ui_surface` / `tool.executor` until the admin
 * presses Save, and that press is never an agent action.
 *
 * DELIBERATELY NOT WRITABLE, and this must stay that way:
 *   • `name` ON AN EXISTING ROW. Not merely "identity, so no" — here it is a
 *     correctness gate. The name is the primary key AND the dispatch key
 *     (`ui_surface.client_name` FKs to `ui_client.name`; tool bindings and
 *     surface rows dispatch by these exact strings), which is the same call
 *     `matrx-admin/tool-registry` made refusing `tool_name`. Worse, the save
 *     is `upsert(onConflict: "name")`, so a changed name on an edit would not
 *     rename anything — it would INSERT A SECOND ROW and leave the original
 *     behind, orphaning nothing visibly and breaking everything quietly. The
 *     dialogs render that input `disabled` on edit for this reason; the
 *     handler refuses it with the same reason rather than staging into a
 *     control the admin cannot see or correct.
 *   • `sort_order` — mechanical display ordering, the class the judgment bar
 *     excludes, and the same call `matrx-admin/agent-apps` made.
 *   • `is_active` — capability, not copy. Deactivating a client hides every
 *     surface linked to it (the page computes `dependentSurfaceCount` and
 *     warns the admin before allowing it); that confirm is the human's.
 *   • `client_name` on the surfaces tab — an FK, disabled on edit, and part
 *     of the primary key itself (the PK is `<client>/<local>`), so it is the
 *     `name` argument again wearing a select.
 *   • `parent_executor_name` — capability inheritance between executors, and
 *     a structural choice from a fixed list of existing rows, not authoring.
 *   • `config` (executor JSON) and `mcp_server_id` — the machine dispatch
 *     contract, the class `matrx-admin/tool-registry` kept human for
 *     `tool_parameters_schema`. The dialog itself says the MCP link is owned
 *     by the provisioning flow, not this row.
 *   • CREATING, SAVING, or DELETING a row. Save stays human by construction
 *     (that is what `draft` means). There is no hard delete here at all and
 *     that is deliberate: `lookups.service.ts` exposes only a soft-delete
 *     because these tables are FK targets for many rows, and removing one
 *     would orphan tools, surfaces and executors.
 *
 * The name patterns quoted in the description below and the ones the handler
 * checks are the SAME constants the dialogs validate the admin's typing
 * against, from `features/tool-registry/lookups/lookupsVocabulary.ts`.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "lookup_draft",
    label: "Lookup row draft",
    description:
      `Stages authored text into a lookup row form on the tab the admin is looking at. If a row dialog is already OPEN, it stages there — read \`lookup_editor\` first to see which table and which row that is, and whether it is a create or an edit. If NO dialog is open, applying OPENS a New row form on the ACTIVE tab (\`lookups_tab\`) and stages into that, so the admin sees the proposal in the real form; opening a form creates nothing and Cancel discards it. Nothing is written to the database either way; the admin still presses Save, and that press is never an agent action. ` +
      `Value: an object with AT LEAST ONE of { name, description }. Each key REPLACES that whole input; omit a key to leave it exactly as the admin left it (nothing here appends). Plain text, not JSON and not JSON-encoded. ` +
      `\`description\` — the short human-readable label this row is filed under (e.g. "Chrome extension client runtime. Hosts browser-DOM tools that must run in-page."), at most ${LOOKUP_DESCRIPTION_MAX_CHARS} characters. Writable on both create and edit, on all three tabs. ` +
      `\`name\` — the row's primary key, and accepted ONLY while \`lookup_editor.mode\` is "create" (equivalently \`name_editable\` is true). On an existing row it is REFUSED: the input is disabled and the save is an upsert on the name, so a changed name would insert a second row rather than rename, breaking every reference to the original. At most ${LOOKUP_NAME_MAX_CHARS} characters, and the pattern depends on the tab — UI Clients: ${LOOKUP_NAME_RULES.clients.describe}; UI Surfaces: ${LOOKUP_NAME_RULES.surfaces.describe}; Tool Executors: ${LOOKUP_NAME_RULES.executors.describe}. ` +
      `It never guesses ACROSS tabs — it only ever opens a form on the tab already showing — and it is refused outright when more than one dialog is open (ambiguous) or while a save is in flight. If you mean to edit an EXISTING row rather than create one, ask the admin to click Edit on that row first; this target will not pick a row for you. ` +
      `Sort order, the Active toggle, the surfaces tab's Client select, the executor's Parent and Config JSON, and creating / saving / deleting a row are NOT writable here — describe those in your answer and let the admin do them.`,
    valueType: "object",
    updatesValue: "lookup_editor",
    mode: "draft",
    applyPolicy: "ask",
    group: "lookups_console",
    sortOrder: 200,
  },
];

export const adminLookupsManifest: SurfaceManifest = {
  surfaceName: ADMIN_LOOKUPS_SURFACE_NAME,
  readiness: "verified",
  readinessNote:
    "Emitter + write half both live. LookupsAdminPage mounts the SurfaceRuntimeProvider; its three CRUD sub-components and the open row dialog publish into the page-scoped store in components/LookupsSurfaceRuntime.tsx, which builds both the scope and the lookup_draft handler. Not yet mirrored to ui.ui_surface_write_target.",
  label: "Tool Registry Lookups Admin",
  urlPattern: "/administration/agents/lookups",
  intro: `<surface_intro>
This is an ADMIN surface: the Tool Registry lookups console at /administration/agents/lookups.

Three reference tables, one per tab (lookups_tab): ui.ui_client (client apps that can hold surfaces), ui.ui_surface (a legacy quick editor — real surface work belongs on /administration/ui/surfaces), and tool.executor (capability providers a tool can bind to, e.g. mcp.<slug>, aidream, matrx-local).

What you may safely do: help the admin draft a clear name/description for a new client, surface, or executor row, or explain what an existing row is for from its fields. You never create, save, activate, or deactivate a row yourself — those are the admin's own dialog and toggle actions.

You can also WRITE, through exactly one target: lookup_draft, which stages { name?, description? } into a row form. A row dialog is the only editable state on this page, so read lookup_editor first — it tells you which of the three tables you are in, whether this is a create or an edit, and what the inputs currently hold. When lookup_editor is ABSENT no dialog is open, and applying will OPEN a New row form on the active tab (lookups_tab) and fill it in; that creates nothing and the admin can cancel. To change an EXISTING row instead, ask the admin to click Edit on it first — you never pick the row. The name is only writable while creating a brand-new row: on an existing row it is the primary key the save upserts on, so changing it would insert a duplicate instead of renaming. Sort order, the Active toggle, the Client select, the executor's Parent and Config JSON, and creating/saving/deleting rows are the admin's own controls — propose those in words.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** One row from ui_client. `description` is NOT NULL (defaults to ''). */
export interface AdminLookupUiClientRow {
  name: string;
  description: string;
  sort_order: number;
  is_active: boolean;
}

/** One row from ui_surface (legacy tab). `description` is NOT NULL. */
export interface AdminLookupUiSurfaceRow {
  name: string;
  client_name: string;
  description: string;
  sort_order: number;
  is_active: boolean;
}

/** One row from tool.executor. `description` is NOT NULL. */
export interface AdminLookupToolExecutorRow {
  name: string;
  description: string;
  parent_executor_name: string | null;
  mcp_server_id: string | null;
  is_active: boolean;
  /** Free-form dispatch config. Read-only here — never a write target. */
  config: unknown;
}

/**
 * The row dialog the admin has open — the read twin of the `lookup_draft`
 * write target. `name`/`description` are the LIVE input values, so a staged
 * draft is observable here before anything is saved.
 */
export interface AdminLookupOpenEditor {
  tab: "clients" | "surfaces" | "executors";
  /** Physical table this editor writes, e.g. "ui.ui_client". */
  table: string;
  mode: "create" | "edit";
  name: string;
  description: string;
  /** False on an existing row — the name is the primary key and is disabled. */
  name_editable: boolean;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value
 * declared `alwaysAvailable: true`; optional keys mirror `alwaysAvailable:
 * false`.
 */
export function createAdminLookupsScope(values: {
  // alwaysAvailable: true → required
  lookups_tab: "clients" | "surfaces" | "executors";
  ui_clients_list: AdminLookupUiClientRow[];
  ui_client_count: number;
  ui_surfaces_list: AdminLookupUiSurfaceRow[];
  ui_surface_count: number;
  ui_surfaces_client_filter: string;
  tool_executors_list: AdminLookupToolExecutorRow[];
  tool_executor_count: number;
  // alwaysAvailable: false → optional
  lookup_editor?: AdminLookupOpenEditor;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
