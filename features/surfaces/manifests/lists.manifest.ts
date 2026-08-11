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
 * and stays human-only. Editing an EXISTING item's text is a legitimate future
 * target but belongs to the shared module so both mounts gain it together.
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
    name: "selected_item_id",
    label: "Selected item ID",
    description:
      "ID of the item the user has open in the Edit Item dialog. Absent when that dialog is closed — this route has no other notion of a focused item.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 340,
    group: "list_items",
  },
  {
    name: "selected_item_label",
    label: "Selected item label",
    description:
      "Label of the item open in the Edit Item dialog. Absent when that dialog is closed.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 345,
    group: "list_items",
  },
  {
    name: "selected_item_description",
    label: "Selected item description",
    description:
      "Description of the item open in the Edit Item dialog. Absent when that dialog is closed or the item has no description.",
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

You can WRITE to this list through apply_surface_write: rename it, rewrite its description, or add items. There is no draft here — each of those saves to the database as soon as the user approves, so propose the exact values you intend before applying, and read all_items first so you never re-add something that is already there.

Two things you cannot do, by design. You cannot delete the list or any item, and you cannot bulk-clear it — removal stays a human gesture, so describe what you would remove and let the user press the button. You cannot change list_visibility either; who can reach a list is a permission decision, not a content edit.

Check list_is_owner before proposing an edit. When it is false the viewer arrived through a shared link, the page is read-only, and every write will be refused.

This is the same list state as the List Manager window (matrx-user/list-manager) and offers the same three write targets under the same names — the window is that state's other home.
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
  active_list_item_count: number;
  list_visibility: string;
  list_is_owner: boolean;
  all_items: ListsItemEntry[];
  items_grouped: Record<string, unknown>;
  active_list_description?: string;
  selected_item_id?: string;
  selected_item_label?: string;
  selected_item_description?: string;
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
