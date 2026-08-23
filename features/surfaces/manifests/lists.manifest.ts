/**
 * Surface manifest — Custom lists (`matrx-user/lists`).
 *
 * The ROUTE home of a custom list: `/lists/[id]`, rendered by
 * `ListDetailClient` with `asRoute` — the canonical deep link a share button
 * copies and every list card navigates to. (`/lists` itself is a static
 * landing page with no list state; see "WHERE THIS MOUNTS" below.)
 *
 * WHY THIS IS THE SAME SURFACE AS `matrx-user/list-manager`, NOT A RIVAL.
 * The floating List Manager window renders the SAME `ListDetailClient` in its
 * detail pane, over the same rows, driving the same server actions
 * (`updateListAction`, `addItemAction`). They are two MOUNTS of one editable
 * state — a window openable anywhere, and a route you can link to. So this
 * surface deliberately reuses list-manager's vocabulary rather than inventing
 * one: the write targets below are imported from
 * `features/user-lists/surface-write-targets.ts`, the single definition BOTH
 * manifests use, and the handlers come from the single builder both mounts
 * call. list-manager shipped first and its names win; nothing here renames or
 * redesigns them. Two target sets over the same fields would be a defect, so
 * there is only one set.
 *
 * WHERE THIS MOUNTS, precisely — this surface used to be `readiness: "stub"`
 * with NO runtime emitter at all, and the emitter is the thing that was
 * missing:
 *
 *   - `/lists/[id]` → `ListDetailClient asRoute` mounts
 *     `<SurfaceRuntimeProvider surfaceName="matrx-user/lists">` with the live
 *     scope AND the write handlers. This is the only mount.
 *   - `/lists` (index) → `StructuredListLanding` inside `MarketingPageShell`:
 *     a static explainer with no list open and nothing authored. It mounts
 *     NOTHING, and should not — a landing page owns no editable state.
 *   - Inside the List Manager window, `ListDetailClient` is rendered WITHOUT
 *     `asRoute`, so it registers nothing there. That gate is load-bearing:
 *     the surface registry resolves DEEPEST-first, so an ungated provider
 *     would register below `matrx-user/list-manager` and shadow the shipped
 *     window surface entirely.
 *
 * NOT WRITABLE HERE, ON PURPOSE (see the shared targets module for the full
 * reasoning): deleting a list or an item and bulk-clearing are never targets
 * at any policy — the agent proposes, the human presses the button in
 * `DeleteConfirmDialog`. Visibility (`list_visibility`) is permission-shaped
 * and stays human-only. Editing an existing item IS writable, as
 * `update_list_item` — it landed in the shared module so both mounts gained it
 * in one change.
 *
 * Writes additionally require OWNERSHIP: a list reached through a shared link
 * renders read-only, and the handler refuses rather than attempting a write
 * the database would reject. `list_is_owner` is emitted so an agent can check
 * before proposing anything.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import {
  LIST_SURFACE_WRITE_TARGETS,
  LIST_VISIBILITY_ENUM_TEXT,
} from "@/features/user-lists/surface-write-targets";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "active_list",
    label: "Active list",
    sortOrder: 200,
    description: "Identity and metadata of the list open at this route.",
  },
  {
    key: "list_items",
    label: "List items",
    sortOrder: 300,
    description: "The items of the list open at this route.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Active list ───────────────────────────────────────────────────────
  {
    name: "active_list_id",
    label: "Active list ID",
    description:
      "UUID of the list open at this route — the `[id]` segment of /lists/[id]. Always present: the route 404s without a readable list.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "active_list",
  },
  {
    name: "active_list_name",
    label: "Active list name",
    description: "Name of the list open at this route.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 80,
    sortOrder: 310,
    group: "active_list",
  },
  {
    name: "active_list_description",
    label: "Active list description",
    description:
      "Description of the list open at this route. Empty when the list has none.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 320,
    group: "active_list",
  },
  {
    name: "active_list_url",
    label: "Link to this list",
    description:
      "The canonical deep link to the list open at this route (…/lists/<id>) — exactly what the header's Copy link button puts on the clipboard. Use it when writing a reference to this list somewhere else.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 60,
    sortOrder: 315,
    group: "active_list",
  },
  {
    name: "active_list_item_count",
    label: "List item count",
    description:
      "Number of items in the list open at this route. Zero when the list is empty.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 325,
    group: "active_list",
  },
  {
    name: "active_list_group_count",
    label: "List group count",
    description:
      "Number of distinct group headings the items are filed under, counting \"Ungrouped\". Zero when the list is empty.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 326,
    group: "active_list",
  },
  {
    name: "active_list_created_at",
    label: "List created at",
    description:
      "ISO-8601 timestamp of when this list was created. Not shown on the page; available for an agent that needs to reason about age.",
    valueType: "string",
    alwaysAvailable: true,
    autoContext: false,
    typicalCharCount: 30,
    sortOrder: 327,
    group: "active_list",
  },
  {
    name: "active_list_updated_at",
    label: "List last updated at",
    description:
      "ISO-8601 timestamp of the last edit to the list's own name/description. Absent when the list has never been edited since creation. Item edits do not move it.",
    valueType: "string",
    alwaysAvailable: false,
    autoContext: false,
    typicalCharCount: 30,
    sortOrder: 328,
    group: "active_list",
  },
  {
    name: "list_visibility",
    label: "List visibility",
    description:
      // Interpolated from LIST_VISIBILITY_VALUES — the same constant
      // `getListVisibility` produces — so the vocabulary an agent reads is the
      // vocabulary this page emits, and the two cannot drift.
      `Who can reach this list: one of ${LIST_VISIBILITY_ENUM_TEXT}. "public" is readable by anyone, "authenticated" by any signed-in user, "private" by the owner alone. Read-only here — changing visibility is a permission change and stays human-only.`,
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 14,
    sortOrder: 330,
    group: "active_list",
  },
  {
    name: "list_is_owner",
    label: "Viewer owns this list",
    description:
      "True when the signed-in viewer owns this list. False when they reached it through a shared link — the page is read-only then and every write target refuses, so check this before proposing an edit.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 335,
    group: "active_list",
  },

  // ── List items ────────────────────────────────────────────────────────
  {
    name: "all_items",
    label: "All items",
    description:
      "Array of { id, label, description, help_text, group } for every item in the list. Empty array when the list has no items.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 3000,
    sortOrder: 360,
    group: "list_items",
  },
  {
    name: "items_grouped",
    label: "Items grouped",
    description:
      "Object keyed by group name, each value an array of items in that group — the same items as all_items in their grouped shape. Ungrouped items file under \"Ungrouped\".",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 3000,
    autoContext: false,
    sortOrder: 370,
    group: "list_items",
  },
  {
    name: "list_group_names",
    label: "Group names",
    description:
      'The group headings of this list, in the order they are rendered — the exact strings to reuse for an item\'s `group`. Includes "Ungrouped" when ungrouped items exist. Empty array when the list has no items.',
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 120,
    sortOrder: 355,
    group: "list_items",
  },
  {
    name: "selected_item_id",
    label: "Focused item ID",
    description:
      "ID of the item the user is pointing at: the one open in the Edit Item dialog, or the one they just right-clicked to open the context menu. Absent when neither is true.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 340,
    group: "list_items",
  },
  {
    name: "selected_item_label",
    label: "Focused item label",
    description:
      "Label of the focused item (open in the Edit Item dialog, or right-clicked). Absent when there is no focused item.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 345,
    group: "list_items",
  },
  {
    name: "selected_item_description",
    label: "Focused item description",
    description:
      "Description of the focused item (open in the Edit Item dialog, or right-clicked). Absent when there is no focused item, or it has no description.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 350,
    group: "list_items",
  },
];

export const listsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/lists",
  readiness: "partial",
  readinessNote:
    "Manifest audited against the live /lists/[id] route and the emitter + write handlers are wired on ListDetailClient (asRoute); write path live-verified with a real agent run. Not yet DB-synced. The /lists index is a static landing page and deliberately emits nothing, so values here describe the detail route only.",
  label: "Lists",
  urlPattern: "/lists/[id]",
  intro: `<surface_intro>
You are on the ROUTE page for ONE custom list (/lists/[id]) — its name, description, and items, grouped under headings. Everything you can see is in active_list_* and all_items / items_grouped.

You can WRITE to this list through apply_surface_write: rename it, rewrite its description, add items, or edit one existing item in place (update_list_item, by the item's id from all_items — that is also how an item moves to another group). There is no draft here — each of those saves to the database as soon as the user approves, so propose the exact values you intend before applying, and read all_items first so you never re-add something that is already there.

Two things you cannot do, by design. You cannot delete the list or any item, and you cannot bulk-clear it — removal stays a human gesture, so describe what you would remove and let the user press the button. You cannot change list_visibility either; who can reach a list is a permission decision, not a content edit.

Check list_is_owner before proposing an edit. When it is false the viewer arrived through a shared link, the page is read-only, and every write will be refused.

This is the same list state as the List Manager window (matrx-user/list-manager) and offers the same write targets under the same names — the window is that state's other home.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
  writeTargets: LIST_SURFACE_WRITE_TARGETS,
};

/** One item entry as emitted in the `all_items` surface value. */
export interface ListsItemEntry {
  id: string;
  label: string;
  description: string | null;
  help_text: string | null;
  group: string;
}

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value above. The detail route
 * always has a list open (it 404s otherwise), so far more is guaranteed here
 * than on the List Manager window, where nothing need be selected.
 */
export function createListsScope(values: {
  active_list_id: string;
  active_list_name: string;
  active_list_url: string;
  active_list_item_count: number;
  active_list_group_count: number;
  active_list_created_at: string;
  list_visibility: string;
  list_is_owner: boolean;
  all_items: ListsItemEntry[];
  items_grouped: Record<string, unknown>;
  list_group_names: string[];
  active_list_description?: string;
  active_list_updated_at?: string;
  selected_item_id?: string;
  selected_item_label?: string;
  selected_item_description?: string;
  selection?: string;
  text_before?: string;
  text_after?: string;
  content?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
