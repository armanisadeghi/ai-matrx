// features/data-tables/pick-lists/where-lists-live.ts — WHERE A PICK LIST IS READ, WRITTEN AND OPENED.
//
// Every pick list lives in the record store as a Table of choices (one Record per choice). A list
// has one address, `/pick-lists/<id>`, which opens the store's table page for it; every list read goes
// through THE LIST INDEX (`pick-list-index.ts`) or the list doors that answer from the store
// (`get_pick_list_with_items`, `get_pick_list_for_selection`, `update_pick_list`).

import type { SupabaseClient } from "@supabase/supabase-js";

import type { UserList } from "./types";
import { readPickListIndexOrThrow } from "./pick-list-index";

/** The one address of a list. */
export function listAddress(listId: string): string {
  return `/pick-lists/${listId}`;
}

/** Every pick list the person may open, across all their organizations, from THE LIST INDEX. */
export async function accessiblePickLists(client: SupabaseClient, userId: string): Promise<UserList[]> {
  const { lists } = await readPickListIndexOrThrow(client, { everywhere: true });
  return lists.map((list) => ({
    id: list.id,
    list_name: list.listName,
    description: list.description,
    user_id: list.createdBy ?? userId,
    is_public: false,
    public_read: false,
    created_at: list.updatedAt ?? "",
    updated_at: list.updatedAt,
    item_count: list.itemCount,
  }));
}

/**
 * An organization's pick lists that the signed-in person may open — the organization's Lists tab
 * and its count. From THE LIST INDEX (`custom.pick_list_index`, which asks the store's own access
 * rules, never the active org).
 */
export async function organizationPickListsInTheNewSystem(
  client: SupabaseClient,
  organizationId: string,
): Promise<Array<{ id: string; list_name: string; updated_at: string | null }>> {
  const { lists } = await readPickListIndexOrThrow(client, { organizationId });
  return lists.map((list) => ({ id: list.id, list_name: list.listName, updated_at: list.updatedAt }));
}
