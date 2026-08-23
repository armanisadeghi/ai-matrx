/**
 * features/user-lists/dom-anchors.ts
 *
 * The DOM attributes the ONE list context menu uses to work out WHICH row the
 * user right-clicked, plus the canonical deep link for a list.
 *
 * WHY ATTRIBUTES AND NOT A MENU PER ROW. A list detail pane renders one menu
 * for the whole pane and resolves its target on open (`resolveContextOnOpen`
 * — see `features/context-menu-v3/types.ts`). Wrapping every row in its own
 * `NonEditableContextMenu` would nest Radix context-menu triggers inside the
 * pane's trigger, which is not a shape this repo has anywhere; single-instance
 * delegation is the sanctioned answer and costs one shell instead of N.
 *
 * The attribute names live here, not inline, because the WRITER (`ListItem` /
 * `GroupSection`) and the READER (`ListDetailClient`) are different files and
 * a typo in either one would silently degrade the menu to list-level actions
 * with nothing to tell you.
 */

/** Carries a list item's id on the item row's root element. */
export const LIST_ITEM_DOM_ATTR = "data-list-item-id";

/** Carries a group's heading name on the group section's root element. */
export const LIST_GROUP_DOM_ATTR = "data-list-group";

/**
 * The canonical deep link for a list — `/lists/<id>`, absolute in the browser
 * so it can be pasted anywhere, relative during SSR where there is no origin.
 * This is the string the Copy link action writes and the `active_list_url`
 * surface value emits; both must be the same string, so there is one producer.
 */
export function listDeepLink(listId: string): string {
  return typeof window !== "undefined"
    ? `${window.location.origin}/lists/${listId}`
    : `/lists/${listId}`;
}
