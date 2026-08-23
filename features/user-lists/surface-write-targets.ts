/**
 * features/user-lists/surface-write-targets.ts
 *
 * The ONE canonical set of agent write targets for a custom list, shared by
 * every surface that mounts list-editing state.
 *
 * WHY THIS FILE EXISTS. A user list is edited from two different homes:
 *
 *   - `matrx-user/list-manager` — the floating List Manager window
 *     (`ListManagerFloatingWorkspace`), openable anywhere.
 *   - `matrx-user/lists` — the `/lists/[id]` route
 *     (`ListDetailClient asRoute`), the canonical deep link for one list.
 *
 * Both render the SAME `ListDetailClient` over the SAME rows and drive the
 * SAME server actions (`updateListAction`, `addItemAction`). They are two
 * MOUNTS of one editable state, not two different things — so they must offer
 * agents one vocabulary, not two. Defining the targets once here (and the
 * handlers once in `./surface-write-handlers`) makes that identity structural:
 * the two manifests cannot drift apart, because there is only one definition
 * to change.
 *
 * `matrx-user/list-manager` shipped these targets first and its vocabulary
 * WINS — the names, semantics, and prose below are exactly what it already
 * declared, lifted verbatim so the route mount reuses them rather than
 * inventing a competing set.
 *
 * Deliberately kept free of React and of `"use server"` imports: both surface
 * manifests import this module, and the manifest registry is loaded by
 * `scripts/check-surface-drift.ts` outside any React/Next runtime. The
 * handlers live in the sibling `./surface-write-handlers` module, which the
 * two mounting components import instead.
 *
 * NOT DECLARED HERE, ON PURPOSE:
 *
 *   - **Anything destructive.** Deleting a list, deleting an item, or
 *     bulk-clearing items is never an agent write target at any policy. There
 *     is no undo behind these actions and no draft to review, so the agent may
 *     stage a proposal in chat and the human presses the button
 *     (`DeleteConfirmDialog`). Adding a delete target later would be a defect,
 *     not a feature.
 *   - **Visibility** (`is_public` / `public_read`, surfaced as
 *     `list_visibility`). Permission-shaped changes stay human-only by the
 *     same doctrine list-manager set: an agent widening who can read a list is
 *     not a content edit.
 * EDITING AN EXISTING ITEM (`update_list_item`) was that follow-up, and it
 * landed here — in the shared module, so BOTH mounts gained it in the same
 * change, which is the whole point of this file. It is deliberately an
 * IN-PLACE edit of ONE item: it can never create an item (that is
 * `add_list_items`) and can never remove one (removal stays human-only).
 */

import type { SurfaceWriteTarget } from "@/features/surfaces/types";
import { LIST_VISIBILITY_VALUES } from "./types";

/**
 * The visibility vocabulary as model-facing prose, derived from the runtime
 * constant that `getListVisibility` actually produces. Interpolated into the
 * manifests' `list_visibility` description so the enum an agent is told about
 * is literally the enum the page emits.
 */
export const LIST_VISIBILITY_ENUM_TEXT = LIST_VISIBILITY_VALUES.join(" | ");

/** Target names, so mounts register handlers without re-typing the strings. */
export const LIST_WRITE_TARGET_NAMES = {
  activeListName: "active_list_name",
  activeListDescription: "active_list_description",
  addListItems: "add_list_items",
  updateListItem: "update_list_item",
} as const;

/**
 * Write half of every list-editing surface.
 *
 * There is NO draft layer on a user list: every user-facing edit is a server
 * action that persists on submit (`AddItemDialog` → `addItemAction`,
 * `EditListDialog` → `updateListAction`). So every target is `mode: "entity"`
 * — an applied write is a database commit, not a staged change — and every one
 * is `applyPolicy: "ask"`. `auto` is deliberately absent and must stay absent:
 * there is nothing to review after the fact and no Save bar to undo it.
 */
export const LIST_SURFACE_WRITE_TARGETS: SurfaceWriteTarget[] = [
  {
    name: LIST_WRITE_TARGET_NAMES.activeListName,
    label: "Active list name",
    description:
      "Renames the ACTIVE list. Saved to the database immediately — there is no draft to review. Value: a non-empty plain string, the list's display name; it replaces the current name entirely.",
    valueType: "string",
    updatesValue: "active_list_name",
    mode: "entity",
    applyPolicy: "ask",
    group: "active_list",
    sortOrder: 330,
  },
  {
    name: LIST_WRITE_TARGET_NAMES.activeListDescription,
    label: "Active list description",
    description:
      "Replaces the ACTIVE list's description. Saved to the database immediately — there is no draft to review. Value: a plain string (pass an empty string to clear it). This REPLACES the full description rather than appending — read active_list_description first and include any existing text you want kept.",
    valueType: "string",
    updatesValue: "active_list_description",
    mode: "entity",
    applyPolicy: "ask",
    group: "active_list",
    sortOrder: 340,
  },
  {
    name: LIST_WRITE_TARGET_NAMES.addListItems,
    label: "Add list items",
    description:
      'ADDS new items to the ACTIVE list, in order. Saved to the database immediately — there is no draft to review. Value: a non-empty array of objects { label, description?, help_text?, group? }. `label` is required and is the short name shown in the list; `description` is the longer detail; `help_text` is a one-line hint shown under the label; `group` is the heading it files under (omit or pass "" for Ungrouped — reuse an exact group name from items_grouped rather than inventing a near-duplicate). This APPENDS only: it never edits or removes existing items, so read all_items first and do not re-send items that are already there.',
    valueType: "array",
    updatesValue: "all_items",
    mode: "entity",
    applyPolicy: "ask",
    group: "list_items",
    sortOrder: 420,
  },
  {
    name: LIST_WRITE_TARGET_NAMES.updateListItem,
    label: "Update a list item",
    description:
      'EDITS ONE EXISTING item of the ACTIVE list, in place. Saved to the database immediately — there is no draft to review. Value: an object { id, label?, description?, help_text?, group? }. `id` is REQUIRED and must be the `id` of an item you read from all_items — it is how the item is found, and a wrong id is refused rather than guessed at. Only the fields you send are changed: omit a field to leave it exactly as it is, and send null to CLEAR description, help_text, or group (an empty group means Ungrouped). Changing `group` is how an item moves between headings — reuse an exact name from items_grouped rather than inventing a near-duplicate. This target can never create an item (use add_list_items) and can never remove one (removal stays a human gesture).',
    valueType: "object",
    updatesValue: "all_items",
    mode: "entity",
    applyPolicy: "ask",
    group: "list_items",
    sortOrder: 430,
  },
];
