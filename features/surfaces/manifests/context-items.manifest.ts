/**
 * Surface manifest — Context Items (`matrx-user/context-items`).
 *
 * Drives `/context-items` — the all-organizations catalog of context ITEMS
 * (the fields defined on a scope type), grouped organization → scope type →
 * items. It is the field-definition side of the scope model: no scope values,
 * no cells, no templates, no active-context picker.
 *
 * WHY A CHILD OF `matrx-user/scopes`, NOT A STANDALONE SURFACE.
 * The vocabulary here is a strict subset of the Scopes surface — organizations,
 * scope types, context items — so restating those values would fork their
 * descriptions. But the PURPOSE differs enough to warrant its own surface:
 * agents bound here reason about the SHAPE of the knowledge model ("what fields
 * should a Client carry?", "this dimension is missing an audience field"),
 * whereas agents on /scopes reason about the authored data itself. Same
 * vocabulary, different agents → `inheritsFrom` rather than a fold-in.
 *
 * Nothing on this page can be authored per-scope, so it emits no
 * `scope_context_values` and no active-context values.
 *
 * Runtime emitter: `features/scope-system/components/ContextItemsHub.tsx`
 * (`AllContextItemsHub`), via `createContextItemsScope`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  DEFAULT_CATEGORIES,
  VALUE_TYPE_CONFIG,
} from "@/features/agent-context/constants";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";
import {
  SCOPES_SURFACE_NAME,
  type ScopesScopeValues,
} from "./scopes.manifest";

/** Canonical `ui_surface.name` for this surface. */
export const CONTEXT_ITEMS_SURFACE_NAME = "matrx-user/context-items";

const groups: SurfaceValueGroup[] = [
  {
    key: "field_catalog",
    label: "Field catalog",
    sortOrder: 100,
    description:
      "Shape of the context-item catalog on screen: how many fields exist, how they break down by value type and category, and which organizations the viewer may edit them in.",
  },
  {
    key: "field_authoring",
    label: "Field authoring",
    sortOrder: 110,
    description:
      "The authored COPY on each loaded field — its label, its meaning, its category, tags and status note — plus the write targets that change them. Read `context_item_authoring` before proposing any change: it is the read twin every write target here updates.",
  },
];

/**
 * Value types an agent may pick for a NEW context item — every direct-entry
 * type in the canonical `VALUE_TYPE_CONFIG`, minus `reference`.
 *
 * `reference` is excluded deliberately: a reference item is meaningless without
 * the fence config the add form collects alongside it (allowed reference types,
 * max items, allowed scope types, dataset binding), and none of that is
 * agent-authorable here. Same exclusion, same reason, as
 * `ContextItemAddForm.PRIMITIVE_VALUE_TYPES`.
 */
export const AGENT_WRITABLE_VALUE_TYPES = (
  Object.keys(VALUE_TYPE_CONFIG) as (keyof typeof VALUE_TYPE_CONFIG)[]
).filter((key) => key !== "reference");

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "context_item_categories",
    label: "Item categories",
    description:
      "Distinct category names used across the loaded context items (items may be uncategorised, which is not represented here). Empty array when nothing is loaded or no item carries a category.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 150,
    sortOrder: 300,
    group: "field_catalog",
  },
  {
    name: "context_item_value_type_counts",
    label: "Items by value type",
    description:
      "How many loaded context items use each value type, keyed by value type (text, number, boolean, date, json, document, reference, …). Absent until at least one scope type's items have loaded.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 310,
    group: "field_catalog",
  },
  {
    name: "manageable_organization_ids",
    label: "Editable organizations",
    description:
      "Ids of the listed organizations where the viewer's role lets them add, edit or reorder context items. Empty array when the viewer is a plain member everywhere — propose changes rather than instructing them to edit.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 320,
    group: "field_catalog",
  },
  {
    name: "loaded_scope_type_ids",
    label: "Loaded scope types",
    description:
      "Ids of the scope types whose context items have actually been fetched. Sections load per type, so this is usually a subset of scope_types_summary — a type missing here has an unknown field list, not an empty one.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 300,
    autoContext: false,
    sortOrder: 330,
    group: "field_catalog",
  },
  {
    name: "context_item_authoring",
    label: "Field authoring copy",
    description:
      "The AUTHORED copy of every loaded context item — one entry per item: { id, organization_id, scope_type_id, key, display_name, description, category, tags, status_note }. This is the read twin of this surface's write targets: `id` is what you pass as `item_id`, and every field it carries is one a write target can change. Auto-context on purpose — without it an agent has no item id to write to — but it costs roughly 300 characters per LOADED field and is by far the heaviest value on this surface (a catalog of ~100 fields runs to ~30k). Absent until at least one scope type's items have loaded; a scope type missing from loaded_scope_type_ids has an UNKNOWN field list, never an empty one.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 12000,
    sortOrder: 400,
    group: "field_authoring",
  },
];

/**
 * Write targets — the agent-writable half of the field catalog.
 *
 * All five are `mode: "entity"`: every one of them lands through the SAME
 * `updateContextItem` / `createContextItem` Redux thunks the user's own edit
 * sheet (`ContextItemSettingsForm`) and add form (`ContextItemAddForm`)
 * dispatch, which persist on the spot. There is no page-level staging buffer
 * to write into — the edit sheet's buffer only exists while the user has that
 * one item's panel open, and this catalog spans every organization — so
 * claiming `"draft"` here would be a lie about where the value went.
 * `applyPolicy: "ask"` is what keeps a human in the loop instead.
 *
 * Deliberately NOT writable: item ids, `key`/`slug` (identity — the key is
 * derived from the display name on create exactly as the add form derives it,
 * and never rewritten afterwards), `scope_type_id` / organization ownership,
 * `sort_order` (mechanical ordering, and the page already has a drag-and-arrows
 * reorder dialog), `value_type` on an EXISTING item (the editor itself warns
 * that stored values do not convert), `sensitivity` / `fetch_hint` (how far
 * this data travels is the user's call, never the reader's), item deletion,
 * and anything about which organizations the viewer may manage
 * (`manageable_organization_ids` is a permission read).
 *
 * Handlers: `features/scope-system/components/ContextItemsWriteTargets.tsx`.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "context_item_copy",
    label: "Field name & description",
    description: `Rewrite one context item's authored copy — its display name and/or its description (the field's meaning: what it is for and when an agent should use it). Value: { item_id: string, display_name?: string, description?: string } — at least one of the two; each provided key REPLACES that whole text (read context_item_authoring for the current wording and include anything you want kept), the omitted one is untouched. display_name must be non-empty; description may be "" to clear it. item_id is the \`id\` from context_item_authoring. Saved immediately through the same updateContextItem path the edit sheet's Save uses. Refused when the item is not loaded on this page or the viewer cannot manage its organization.`,
    valueType: "object",
    updatesValue: "context_item_authoring",
    mode: "entity",
    applyPolicy: "ask",
    group: "field_authoring",
    sortOrder: 100,
  },
  {
    name: "context_item_category",
    label: "Field category",
    description: `Set (or clear) the grouping category of one context item. Value: { item_id: string, category: string | null } — null or "" clears it. Free text, but stay inside the app's own vocabulary unless the user already uses something else: ${DEFAULT_CATEGORIES.join(
      " | ",
    )}. Read context_item_categories for the categories already in use across the catalog, and context_item_authoring for this item's current one. Saved immediately through updateContextItem. Refused when the item is not loaded on this page or the viewer cannot manage its organization.`,
    valueType: "object",
    updatesValue: "context_item_authoring",
    mode: "entity",
    applyPolicy: "ask",
    group: "field_authoring",
    sortOrder: 110,
  },
  {
    name: "context_item_tags",
    label: "Field tags",
    description:
      "Set the FULL tag set on one context item. Value: { item_id: string, tags: string[] } — REPLACES every tag on the item (read context_item_authoring and include the existing tags you want kept); an empty array clears them all. Each tag is normalised the way the tag input normalises what the user types: trimmed, lowercased, inner whitespace turned into underscores; duplicates and blanks are dropped. Saved immediately through updateContextItem. Refused when the item is not loaded on this page or the viewer cannot manage its organization.",
    valueType: "object",
    updatesValue: "context_item_authoring",
    mode: "entity",
    applyPolicy: "ask",
    group: "field_authoring",
    sortOrder: 120,
  },
  {
    name: "context_item_status_note",
    label: "Field status note",
    description:
      'Set (or clear) one context item\'s status note — the free-text remark about the current state of this field ("values are stale for most clients", "waiting on legal wording"). Value: { item_id: string, status_note: string | null } — null or "" clears it; a string REPLACES the note. This is the NOTE only: the item\'s status itself is not agent-writable. Saved immediately through updateContextItem. Refused when the item is not loaded on this page or the viewer cannot manage its organization.',
    valueType: "object",
    updatesValue: "context_item_authoring",
    mode: "entity",
    applyPolicy: "ask",
    group: "field_authoring",
    sortOrder: 130,
  },
  {
    name: "add_context_items",
    label: "Add fields to a scope type",
    description: `Add one or more NEW context items (field definitions) to a scope type — the "this dimension is missing a field" move. Value: { scope_type_id: string, items: [{ display_name: string, description?: string, category?: string, value_type?: string }] } — scope_type_id comes from scope_types_summary and its section must already be loaded (see loaded_scope_type_ids); items must be non-empty and created in the order given. value_type defaults to "string" and must be one of: ${AGENT_WRITABLE_VALUE_TYPES.join(
      " | ",
    )} — "reference" items cannot be created here because their fence config is not agent-authorable. The storage key is derived from display_name exactly as the add form derives it; you never supply one, and an item whose derived key already exists on that scope type is refused rather than duplicated. Each new field applies to EVERY scope of that type. Created immediately through the same createContextItem path the add form uses. Refused when the section has not loaded or the viewer cannot manage the owning organization.`,
    valueType: "object",
    updatesValue: "context_item_authoring",
    mode: "entity",
    applyPolicy: "ask",
    group: "field_authoring",
    sortOrder: 140,
  },
];

export const contextItemsManifest: SurfaceManifest = {
  surfaceName: CONTEXT_ITEMS_SURFACE_NAME,
  readiness: "verified",
  readinessNote:
    "Manifest, emitter and write targets live-verified on /context-items with a bound agent (apply + decline + refusal + validation error). Per-section item loads stay lazy, so the catalog values — and the write targets that depend on them — cover only the scope types fetched so far.",
  label: "Context Items",
  urlPattern: "/context-items",
  inheritsFrom: SCOPES_SURFACE_NAME,
  intro: `<surface_intro>
You are on the Context Items surface: the catalog of every FIELD the user has defined across their organizations, grouped organization → scope type → items.
A context item is a field definition on a scope type — the column, not the cell. "Preferred tone" defined on the Client dimension is a context item; "warm and direct" stored for the client Rejuvina is a value, and values are NOT on this page. Nothing here is per-scope data.
The user's job here is shaping the knowledge model: which fields a dimension should carry, what each field means, its value type, its ordering. That is what you help with — proposing missing fields, spotting duplicates and vague descriptions, tightening value types.
Inherited values from the Scopes surface tell you which organizations and scope types exist. Item sections load lazily per scope type: loaded_scope_type_ids is the set actually fetched, so a scope type absent from it has an UNKNOWN field list, not an empty one — never tell the user a dimension has no fields on that basis.
Check manageable_organization_ids before instructing the user to change anything; where they lack the role, propose the change instead.
You can also CHANGE the model, not just talk about it: context_item_authoring lists every loaded field with the id you pass as item_id, and the write targets let you rewrite a field's name and description, set its category, replace its tags, set its status note, and add whole new fields to a scope type. Every one asks the user first. Read the current wording out of context_item_authoring before you replace it — these targets replace, they do not merge — and never propose a write for an organization missing from manageable_organization_ids.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** One entry as emitted in the `context_item_authoring` value. */
export interface ContextItemAuthoringEntry {
  id: string;
  organization_id: string;
  scope_type_id: string;
  key: string;
  display_name: string;
  description: string;
  category: string | null;
  tags: string[];
  status_note: string | null;
}

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 *
 * Inherited keys come from `ScopesScopeValues`. The parent guarantees only
 * `current_view` (`alwaysAvailable: true`), so that is the single required key
 * here too; everything else on this page resolves asynchronously.
 */
export function createContextItemsScope(
  values: ScopesScopeValues & {
    context_item_categories?: string[];
    context_item_value_type_counts?: Record<string, number>;
    manageable_organization_ids?: string[];
    loaded_scope_type_ids?: string[];
    context_item_authoring?: ContextItemAuthoringEntry[];
  },
): SurfaceScopePayload {
  return values as unknown as SurfaceScopePayload;
}
