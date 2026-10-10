/**
 * Surface manifest — Scope (`matrx-user/scope-detail`).
 *
 * One scope on its own page: `/organizations/[orgId]/scopes/[typeId]/[scopeId]`
 * (`ScopeDetailEditor`, also the body of a Scope tile on a Board). The hub level
 * (`matrx-user/scopes`) is read-only by decision and said so: the route that edits a
 * scope's cells is this one, so the write targets live here, where the editor lives.
 *
 * VOCABULARY — Scope is NOT Context (`features/scopes/FEATURE.md`): a SCOPE is one value
 * on a user-authored dimension (a Client, a Department); a CONTEXT ITEM is a field defined
 * on the scope's TYPE (the column); a CONTEXT ITEM VALUE is this scope's cell for it. The
 * "context" an agent receives at invocation is assembled by the system from scopes plus
 * much more; this surface emits the authoring material, never that bundle.
 *
 * WRITES go through the page's own doors: `updateScope` for the name and description, and
 * `setContextValue` (the same thunk `useScopeAutoSave` commits through) for a cell. Every
 * target is `entity` + `ask`: there is no draft layer on a scope, a write is a commit that
 * reframes every later agent invocation. NOT declared, on purpose: deleting a scope, adding
 * or redefining a context item (which changes the field for EVERY scope of the type), and
 * anything about attached resources — those stay on the page for a person.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@ai-matrx/chat/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "@ai-matrx/chat/surfaces/manifests/_baseline.manifest";
import { MATRX_WEB_APP_EXECUTOR } from "@ai-matrx/chat/surfaces/executor";

/** Canonical `ui_surface.name` for this surface. */
export const SCOPE_DETAIL_SURFACE_NAME = "matrx-user/scope-detail";

/** The write-target names, so the page registers handlers without re-typing strings. */
export const SCOPE_DETAIL_WRITE_TARGETS = {
  scopeName: "scope_name",
  scopeDescription: "scope_description",
  contextItemValues: "context_item_values",
} as const;

const groups: SurfaceValueGroup[] = [
  {
    key: "scope_identity",
    label: "Scope identity",
    sortOrder: 100,
    description: "Which scope this is, its name and description, the scope type it belongs to and its organization.",
  },
  {
    key: "scope_context_items",
    label: "Context items",
    sortOrder: 200,
    description: "This scope's value for every context item its type defines: what is filled in and what is empty.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "scope_loaded",
    label: "Scope loaded",
    description:
      "True once this scope and its scope type resolved. While false the other values are absent; load_error says why when the scope could not be found.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "scope_identity",
    sortOrder: 300,
  },
  {
    name: "scope_id",
    label: "Scope ID",
    description: "UUID of the scope on this page. Absent until scope_loaded is true.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "scope_identity",
    sortOrder: 310,
  },
  {
    name: "scope_name",
    label: "Scope name",
    description: "The scope's name, as shown in the page heading (for example a client's or a department's name).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "scope_identity",
    sortOrder: 320,
  },
  {
    name: "scope_description",
    label: "Scope description",
    description: "The scope's description. Empty when none has been written.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "scope_identity",
    sortOrder: 330,
  },
  {
    name: "scope_type",
    label: "Scope type",
    description:
      "The dimension this scope sits on, as { id, label_singular, label_plural } (for example Client / Clients). Its context items are the columns this scope fills in.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 90,
    group: "scope_identity",
    sortOrder: 340,
  },
  {
    name: "scope_organization_id",
    label: "Organization ID",
    description: "UUID of the organization this scope belongs to.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "scope_identity",
    sortOrder: 350,
  },
  {
    name: "context_items_filled",
    label: "Context items filled",
    description: "How many of this scope's context items have a value, matching the count in the page's header.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    group: "scope_context_items",
    sortOrder: 400,
  },
  {
    name: "context_items_total",
    label: "Context items total",
    description: "How many context items this scope's type defines (filled or not).",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    group: "scope_context_items",
    sortOrder: 410,
  },
  {
    name: "context_item_values",
    label: "Context item values",
    description:
      "Every context item of this scope as { item_id, slug, name, kind, has_value, value }. value is the cell's text (or its JSON for a structured value), null when empty. Absent while the values load or when their read failed (values_error says which). Empty items are listed too, so an agent can see what to fill in.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    group: "scope_context_items",
    sortOrder: 420,
  },
  {
    name: "values_error",
    label: "Values read error",
    description:
      "The error shown when this scope's values could not be read. Absent on a clean read, so a failed read is never mistaken for an empty scope.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "scope_context_items",
    sortOrder: 430,
  },
  {
    name: "load_error",
    label: "Load error",
    description: "Why the scope or its type could not be found, when scope_loaded is false and the tree has finished loading.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "scope_identity",
    sortOrder: 360,
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: SCOPE_DETAIL_WRITE_TARGETS.scopeName,
    label: "Scope name",
    description:
      "Renames this scope. Saved to the database immediately; there is no draft to review. Value: a non-empty plain string, the scope's new name, replacing the old one entirely.",
    valueType: "string",
    updatesValue: "scope_name",
    mode: "entity",
    applyPolicy: "ask",
    group: "scope_identity",
    sortOrder: 500,
  },
  {
    name: SCOPE_DETAIL_WRITE_TARGETS.scopeDescription,
    label: "Scope description",
    description:
      "Replaces this scope's description. Saved immediately. Value: a plain string (empty clears it), the finished description text.",
    valueType: "string",
    updatesValue: "scope_description",
    mode: "entity",
    applyPolicy: "ask",
    group: "scope_identity",
    sortOrder: 510,
  },
  {
    name: SCOPE_DETAIL_WRITE_TARGETS.contextItemValues,
    label: "Context item values",
    description:
      "Sets this scope's value for one or more of its context items, saved immediately: the same write the page does when a person fills a field. Value is a JSON ARRAY of 1-25 objects { item_id: string (or slug: string), value: string }. item_id/slug must name an item in context_item_values; value is the cell's text (for a number, boolean, date or time item the text form the page accepts, for example 42, true, 2026-10-09). A structured item (picklist, reference, media) is not set here: it is refused by name. Only the listed items change.",
    valueType: "array",
    updatesValue: "context_item_values",
    mode: "entity",
    applyPolicy: "ask",
    group: "scope_context_items",
    sortOrder: 520,
  },
];

export const scopeDetailManifest: SurfaceManifest = {
  surfaceName: SCOPE_DETAIL_SURFACE_NAME,
  client: "matrx-user",
  executor: MATRX_WEB_APP_EXECUTOR,
  executionMode: "python-stream",
  description: "One scope: its name, description and the values it holds for each context item of its type.",
  label: "Scope",
  briefValues: ["scope_name", "scope_type", "context_items_filled", "context_items_total"],
  urlPattern: "/organizations/[orgId]/scopes/[typeId]/[scopeId]",
  readiness: "partial",
  readinessNote:
    "Values and three entity write targets (name, description, context item values) are emitted by ScopeDetailEditor; not yet independently certified. Not declared: the knowledge-graph card, the suggestions banner and the attached Resources grid (read through their own features), and structured (picklist, reference, media) values.",
  intro: `<surface_intro>
You are on ONE scope: a value on a dimension the user authors inside an organization (a Client, a Department, a Repo, a Case). Its type's context items are the fields this scope fills in; context_item_values lists every one with its current value, empty ones included.
Check scope_loaded first. Scope is not Context: the context an agent receives at invocation is assembled by the system from many sources, and this scope's values are only the hand-authored part. Treat them as the user's own words; never invent a value to fill an empty item, ask or leave it empty.
Every write here is saved at once and approved by the person on a card: scope_name and scope_description change the scope's own text, context_item_values sets cells. Defining a new context item changes the field for every scope of the type and stays a person's action on the page.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
  writeTargets,
};

export interface ScopeDetailScopeValues {
  scope_loaded: boolean;
  scope_id?: string;
  scope_name?: string;
  scope_description?: string;
  scope_type?: { id: string; label_singular: string; label_plural: string };
  scope_organization_id?: string;
  context_items_filled?: number;
  context_items_total?: number;
  context_item_values?: Array<{
    item_id: string;
    slug: string | null;
    name: string;
    kind: string;
    has_value: boolean;
    value: string | null;
  }>;
  values_error?: string;
  load_error?: string;
}

/** Type-safe payload helper — `scope_loaded` is the one key every state can guarantee. */
export function createScopeDetailScope(values: ScopeDetailScopeValues): SurfaceScopePayload {
  return values as unknown as SurfaceScopePayload;
}
