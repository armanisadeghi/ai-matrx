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

import type { ListLivesIn, UserList, UserListSummaryRaw } from "./types";
import { normalizeUserList } from "./types";

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
 * The person's lists that live in the new system (Tables of choices), from the one door every
 * Lists screen reads (`get_user_lists_summary`, which lists both stores and marks each). Older
 * editors that read the older table directly merge these beside their own rows.
 */
export async function storeListsOf(client: SupabaseClient, userId: string): Promise<UserList[]> {
  const { data, error } = await client.rpc("get_user_lists_summary", { p_user_id: userId });
  if (error) throw new Error(`Failed to load your lists in the new system: ${error.message}`);
  return ((data as unknown as UserListSummaryRaw[]) ?? [])
    .filter((row) => row.lives_in === "record")
    .map((row) => ({ ...normalizeUserList(row), user_id: row.user_id ?? userId }));
}

/** The sentence a Lists screen shows beside a list that lives in the new system. */
export const LIST_LIVES_IN_NEW_SYSTEM =
  "This list now lives in the new system as a table of choices. Same list, same address; its organization switched its Data tables.";
