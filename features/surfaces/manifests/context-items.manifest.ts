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
} from "@/features/surfaces/types";
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
];

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
];

export const contextItemsManifest: SurfaceManifest = {
  surfaceName: CONTEXT_ITEMS_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Manifest + emitter wired on /context-items; not yet live-verified with a bound agent, and per-section item loads are lazy so the catalog values reflect only the scope types fetched so far.",
  label: "Context Items",
  urlPattern: "/context-items",
  inheritsFrom: SCOPES_SURFACE_NAME,
  intro: `<surface_intro>
You are on the Context Items surface: the catalog of every FIELD the user has defined across their organizations, grouped organization → scope type → items.
A context item is a field definition on a scope type — the column, not the cell. "Preferred tone" defined on the Client dimension is a context item; "warm and direct" stored for the client Rejuvina is a value, and values are NOT on this page. Nothing here is per-scope data.
The user's job here is shaping the knowledge model: which fields a dimension should carry, what each field means, its value type, its ordering. That is what you help with — proposing missing fields, spotting duplicates and vague descriptions, tightening value types.
Inherited values from the Scopes surface tell you which organizations and scope types exist. Item sections load lazily per scope type: loaded_scope_type_ids is the set actually fetched, so a scope type absent from it has an UNKNOWN field list, not an empty one — never tell the user a dimension has no fields on that basis.
Check manageable_organization_ids before instructing the user to change anything; where they lack the role, propose the change instead.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

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
  },
): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
