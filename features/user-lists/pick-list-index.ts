// features/user-lists/pick-list-index.ts — THE LIST INDEX, ONE STORE DOOR (lane HANDOVER, 2026-09-27).
//
// Every screen that lists pick lists reads them here: the Lists page (/lists/v3), the organization's
// Lists tab and its count, and the list pickers (agent variable binding, choice columns, the floating
// list workspace). The one door is the store's: `custom.pick_list_index(org)` for one organization
// (the organization wall first) and `custom.pick_list_index_everywhere()` for every organization the
// person is a member of. It answers the Tables of choices the store's own visibility lets her open,
// each with its item count, plus — until the final switch archives them — her own live older lists,
// marked `livesIn: "older"` so a row opens where the list lives (`/lists/<id>` decides).
//
// Nothing here reads `workbench.*` from the browser.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ListLivesIn } from "./types";

export interface PickListEntry {
  id: string;
  listName: string;
  description: string | null;
  itemCount: number;
  updatedAt: string | null;
  createdBy: string | null;
  organizationId: string | null;
  organizationName: string | null;
  livesIn: ListLivesIn;
}

export type PickListIndex =
  | { ok: true; lists: PickListEntry[]; archivedIds: string[] }
  | { ok: false; why: string };

export type PickListScope = { organizationId: string } | { everywhere: true };

function entryOf(raw: Record<string, unknown>): PickListEntry | null {
  if (typeof raw.id !== "string") return null;
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const count = Number(raw.item_count);
  return {
    id: raw.id,
    listName: text(raw.list_name) ?? "Untitled list",
    description: text(raw.description),
    itemCount: Number.isFinite(count) ? count : 0,
    updatedAt: text(raw.updated_at),
    createdBy: text(raw.created_by),
    organizationId: text(raw.organization_id),
    organizationName: text(raw.organization_name),
    livesIn: raw.lives_in === "older" ? "older" : "record",
  };
}

/** Read the index. A failed read is a failure, never an empty list. */
export async function readPickListIndex(client: SupabaseClient, scope: PickListScope): Promise<PickListIndex> {
  const answered =
    "everywhere" in scope
      ? await client.schema("custom" as never).rpc("pick_list_index_everywhere" as never)
      : await client
          .schema("custom" as never)
          .rpc("pick_list_index" as never, { p_organization_id: scope.organizationId } as never);
  if (answered.error) return { ok: false, why: answered.error.message };
  const doc = (answered.data ?? {}) as { lists?: unknown; archived_ids?: unknown };
  const lists = (Array.isArray(doc.lists) ? doc.lists : [])
    .map((raw) => entryOf((raw ?? {}) as Record<string, unknown>))
    .filter((entry): entry is PickListEntry => entry !== null);
  const archivedIds = (Array.isArray(doc.archived_ids) ? doc.archived_ids : []).filter(
    (id): id is string => typeof id === "string",
  );
  return { ok: true, lists, archivedIds };
}

/** The same read, thrown on failure — for callers whose own error path already catches. */
export async function readPickListIndexOrThrow(
  client: SupabaseClient,
  scope: PickListScope,
): Promise<{ lists: PickListEntry[]; archivedIds: string[] }> {
  const answered = await readPickListIndex(client, scope);
  if (!answered.ok) throw new Error(`Your picklists could not be listed: ${answered.why}`);
  return { lists: answered.lists, archivedIds: answered.archivedIds };
}
