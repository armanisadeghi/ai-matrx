// features/user-lists/where-lists-live.ts — WHERE IS THIS PICK LIST READ AND WRITTEN?
// (lane LISTS-AFTER-SWITCH, 2026-09-26)
//
// THE DEFECT THIS CLOSES. When an organization switches its Data tables to the new system, the
// switch archives its older pick lists (`workbench.udt_structured_lists` / `_items`) and each one
// lives on in the record store as a Table of choices under the SAME id (one Record per choice,
// same ids). Every Lists screen read only the older tables, so after the switch a person's lists
// vanished from /lists, a list opened from a link answered its frozen older choices, and a new
// list was made in the older store nobody reads.
//
// THE ONE ANSWER, and it is the database's: `custom.where_lists_live(p_list_ids)` — the switch
// and the list's own row, never "does a copy exist?". Every Lists screen asks it (or reads a door
// that already carries it as `lives_in`: get_user_lists_summary, get_user_list_with_items,
// get_structured_list_for_selection), and a list that lives in the store opens at its own address
// `/lists/<id>`, which mounts the new table page for it. Same id, same address, no redirect.
//
//   · "older"  — an older list: the older editors read and write it, exactly as before.
//   · "record" — it lives in the new system: open `/lists/<id>` (the table page edits it).

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ListLivesIn, UserList } from "./types";
import { readPickListIndexOrThrow } from "./pick-list-index";

export type { ListLivesIn } from "./types";

/** The one address of a list, wherever it lives. */
export function listAddress(listId: string): string {
  return `/lists/${listId}`;
}

/** Where each of `listIds` lives, by id. An id missing from the map is one the door did not answer. */
export async function listsLiveIn(
  client: SupabaseClient,
  listIds: readonly string[],
): Promise<{ ok: true; homes: Map<string, ListLivesIn> } | { ok: false; why: string }> {
  const ids = [...new Set(listIds.filter(Boolean))];
  const homes = new Map<string, ListLivesIn>();
  if (ids.length === 0) return { ok: true, homes };
  const { data, error } = await client
    .schema("custom" as never)
    .rpc("where_lists_live" as never, { p_list_ids: ids } as never);
  if (error) return { ok: false, why: error.message };
  for (const row of (data ?? []) as Array<{ list_id?: unknown; lives_in?: unknown }>) {
    const id = typeof row.list_id === "string" ? row.list_id : null;
    const livesIn = row.lives_in === "older" || row.lives_in === "record" ? row.lives_in : null;
    if (id && livesIn) homes.set(id, livesIn);
  }
  return { ok: true, homes };
}

/** Where one list lives. */
export async function listLivesIn(
  client: SupabaseClient,
  listId: string,
): Promise<{ ok: true; livesIn: ListLivesIn } | { ok: false; why: string }> {
  const answered = await listsLiveIn(client, [listId]);
  if (!answered.ok) return answered;
  const livesIn = answered.homes.get(listId);
  if (!livesIn) return { ok: false, why: "the database did not say where this list lives" };
  return { ok: true, livesIn };
}

/**
 * The person's lists that live in the new system (Tables of choices), from THE LIST INDEX
 * (`pick-list-index.ts`, `custom.pick_list_index_everywhere`, lane HANDOVER). Pickers that still read
 * the older table directly merge these beside their own rows until the final switch.
 */
export async function storeListsOf(client: SupabaseClient, userId: string): Promise<UserList[]> {
  const { lists } = await readPickListIndexOrThrow(client, { everywhere: true });
  return lists
    .filter((list) => list.livesIn === "record")
    .map((list) => ({
      id: list.id,
      list_name: list.listName,
      description: list.description,
      user_id: list.createdBy ?? userId,
      is_public: false,
      public_read: false,
      created_at: list.updatedAt ?? "",
      updated_at: list.updatedAt,
      item_count: list.itemCount,
      lives_in: "record" as const,
    }));
}

/**
 * An organization's pick lists that live in the new system, that the signed-in person may open —
 * the organization's Lists tab and its count read these beside the org's live older lists. From THE
 * LIST INDEX (`custom.pick_list_index`, which asks the store's own access rules, never the active org).
 */
export async function organizationPickListsInTheNewSystem(
  client: SupabaseClient,
  organizationId: string,
): Promise<Array<{ id: string; list_name: string; updated_at: string | null }>> {
  const { lists } = await readPickListIndexOrThrow(client, { organizationId });
  return lists
    .filter((list) => list.livesIn === "record")
    .map((list) => ({ id: list.id, list_name: list.listName, updated_at: list.updatedAt }));
}

/** The sentence a Lists screen shows beside a list that lives in the new system. */
export const LIST_LIVES_IN_NEW_SYSTEM =
  "This list now lives in the new system as a table of choices. Same list, same address; its organization switched its Data tables.";

/**
 * A list BORN in the new system never moved, so the line above would be false on it (lane HANDOVER,
 * 2026-09-27: a list made a minute earlier read "now lives in the new system … its organization
 * switched"). It says what the page is instead.
 */
export const LIST_BORN_IN_NEW_SYSTEM = "A pick list: each row below is one of its choices.";
