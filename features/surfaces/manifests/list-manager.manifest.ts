/**
 * Surface manifest — List Manager (`matrx-user/list-manager`).
 *
 * The floating List Manager window (overlay `listManagerWindow`) — a
 * sidebar-of-lists + active-list-detail workspace
 * (`ListManagerFloatingWorkspace`). Distinct from the `/lists` route surface
 * (`matrx-user/lists`): same domain, different home — this one is a window
 * openable anywhere; value names deliberately reuse the `lists` vocabulary
 * so generic list agents bind identically on both.
 *
 * Emitter: `ListManagerFloatingWorkspace` mounts `<SurfaceRuntimeProvider>`
 * with `createListManagerScope` — sidebar lists + the active list's items
 * at trigger time.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { LIST_SURFACE_WRITE_TARGETS } from "@/features/user-lists/surface-write-targets";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "workspace",
    label: "Workspace",
    sortOrder: 100,
    description: "The user's accessible lists loaded in the sidebar.",
  },
  {
    key: "active_list",
    label: "Active list",
    sortOrder: 200,
    description: "Identity and metadata of the list open in the detail pane.",
  },
  {
    key: "list_items",
    label: "List items",
    sortOrder: 300,
    description: "The items of the active list.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Workspace ─────────────────────────────────────────────────────────
  {
    name: "list_count",
    label: "List count",
    description:
      "Number of lists loaded in the sidebar (the user's accessible lists). Zero while loading or when the user has none.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 300,
    group: "workspace",
  },
  {
    name: "lists",
    label: "All lists",
    description:
      "Array of { id, name, item_count } for every list in the sidebar. Empty array while loading or when the user has none.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 1500,
    sortOrder: 310,
    group: "workspace",
  },

  // ── Active list ───────────────────────────────────────────────────────
  {
    name: "active_list_id",
    label: "Active list ID",
    description:
      "UUID of the list open in the detail pane. Empty when no list is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 320,
    group: "active_list",
  },
  {
    name: "active_list_name",
    label: "Active list name",
    description: "Name of the active list. Empty when none is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 330,
    group: "active_list",
  },
  {
    name: "active_list_description",
    label: "Active list description",
    description:
      "Description of the active list. Empty when unset or none is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 340,
    group: "active_list",
  },
  {
    name: "list_visibility",
    label: "List visibility",
    description:
      '"public" when the active list is public, otherwise "personal". Empty when no list is open.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 350,
    group: "active_list",
  },
  {
    name: "active_list_item_count",
    label: "List item count",
    description:
      "Number of items in the active list. Zero when the list is empty; absent when none is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 360,
    group: "active_list",
  },

  // ── List items ────────────────────────────────────────────────────────
  {
    name: "all_items",
    label: "All items",
    description:
      "Array of { id, label, description, help_text, group } for every item in the active list (owner view — descriptions included). Empty array when the list is empty; absent when none is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    sortOrder: 400,
    group: "list_items",
  },
  {
    name: "items_grouped",
    label: "Items grouped",
    description:
      "Object keyed by group name, each value an array of items in that group — the same items as all_items in their grouped shape. Absent when no list is open or it has no grouping.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    autoContext: false,
    sortOrder: 410,
    group: "list_items",
  },
];

/**
 * Write half of the List Manager surface.
 *
 * The targets themselves now live in
 * `features/user-lists/surface-write-targets.ts`, because this surface is one
 * of TWO mounts of the same editable list state — the other is the
 * `/lists/[id]` route (`matrx-user/lists`). This surface's vocabulary shipped
 * first and remains authoritative; it was lifted into the shared module
 * unchanged (same names, same semantics, same prose) so the route mount reuses
 * it instead of inventing a competing set, and so the two can no longer drift.
 *
 * Everything the original docblock asserted still holds and is documented at
 * the shared definition: there is NO draft layer here (every edit is a server
 * action that persists on submit), so every target is `mode: "entity"` and
 * `applyPolicy: "ask"`, with `auto` deliberately absent. Deletes and
 * visibility are NOT declared — destructive and permission-shaped changes stay
 * human-only by doctrine.
 *
 * Handlers are registered by `ListManagerFloatingWorkspace` on its
 * `SurfaceRuntimeProvider` — the component that owns `activeListId` and both
 * refetch paths, so an applied write refreshes the read twins immediately.
 */
const writeTargets = LIST_SURFACE_WRITE_TARGETS;

export const listManagerManifest: SurfaceManifest = {
  surfaceName: "matrx-user/list-manager",
  readiness: "verified",
  overlayId: "listManagerWindow",
  label: "List Manager",
  intro: `<surface_intro>
You are on the List Manager — a floating window where the user manages custom lists: a sidebar of every accessible list (lists / list_count) and a detail pane for the one they opened (active_list_* / all_items). Agents here operate on the ACTIVE list: sort, dedupe, summarize, or draft new items. You can also WRITE to the active list — rename it, rewrite its description, or add items — through apply_surface_write; each of those saves to the database as soon as the user approves, so propose the exact values you intend before applying. When no active_list_id is present, only the sidebar inventory is available and no write is possible — ask which list to work on rather than guessing.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** One sidebar list entry as emitted in the `lists` surface value. */
export interface ListManagerListEntry {
  id: string;
  name: string;
  item_count: number | null;
}

/** One item entry as emitted in the `all_items` surface value. */
export interface ListManagerItemEntry {
  id: string;
  label: string;
  description: string | null;
  help_text: string | null;
  group: string;
}

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value above.
 */
export function createListManagerScope(values: {
  list_count: number;
  lists: ListManagerListEntry[];
  active_list_id?: string;
  active_list_name?: string;
  active_list_description?: string;
  list_visibility?: string;
  active_list_item_count?: number;
  all_items?: ListManagerItemEntry[];
  items_grouped?: Record<string, unknown>;
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
