/**
 * Surface manifest — Custom lists (`matrx-user/lists`).
 *
 * The custom lists organizer (route `/lists`, detail `/lists/[id]`). The user
 * creates lists and adds items, optionally grouped.
 *
 * Agents bound here operate on the active list (sort, dedupe, summarize),
 * a selected item (expand, reword), or generate new items for the list.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "active_list_id",
    label: "Active list ID",
    description:
      "UUID of the list the user has open. Empty when on the lists index with none open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "active_list_name",
    label: "Active list name",
    description:
      "Name of the active list. Empty when none is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 310,
  },
  {
    name: "active_list_description",
    label: "Active list description",
    description:
      "Description of the active list. Empty when unset or none is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 320,
  },
  {
    name: "active_list_item_count",
    label: "List item count",
    description:
      "Number of items in the active list. Zero when empty or none is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 325,
  },
  {
    name: "list_visibility",
    label: "List visibility",
    description:
      '"private", "shared", or "public" — visibility of the active list. Empty when none is open.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 330,
  },
  {
    name: "selected_item_id",
    label: "Selected item ID",
    description:
      "ID of the list item the user has focused. Empty when none is focused.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 340,
  },
  {
    name: "selected_item_label",
    label: "Selected item label",
    description:
      "Label / title of the focused item. Empty when none is focused.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 345,
  },
  {
    name: "selected_item_description",
    label: "Selected item description",
    description:
      "Description / body of the focused item. Empty when unset or none is focused.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 350,
  },
  {
    name: "all_items",
    label: "All items",
    description:
      "Array of `{ id, label, description, group }` for every item in the active list. Empty array when the list is empty or none is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    sortOrder: 360,
  },
  {
    name: "items_grouped",
    label: "Items grouped",
    description:
      "Object keyed by group name, each value an array of items in that group. Empty object when the list has no grouping.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    sortOrder: 370,
  },
];

export const listsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/lists",
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

export function createListsScope(values: {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  active_list_id?: string;
  active_list_name?: string;
  active_list_description?: string;
  active_list_item_count?: number;
  list_visibility?: string;
  selected_item_id?: string;
  selected_item_label?: string;
  selected_item_description?: string;
  all_items?: unknown[];
  items_grouped?: Record<string, unknown[]>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
