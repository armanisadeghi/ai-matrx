/**
 * "Datasets" and "Pick lists" in Use existing — kinds the RECORD STORE holds.
 *
 * Since @ai-matrx/associations 0.13.135 no entity type backs a table or a pick list, so the kind
 * inventory (one registry token each) cannot count or list them. They are read through the store's
 * own list doors, the ones their pages use:
 *   - tables:     `custom.data_home_tables` (`dataHomeTables`, the data home's door — one walk with
 *                 `mine` and the store's `kind` word; `custom.table_list_everywhere` counts every
 *                 table's rows and fields and took 14–32 s for a person in 49 organizations on the
 *                 clone, past the 8 s statement timeout);
 *   - pick lists: `custom.pick_list_index[_everywhere]` (`readPickListIndexOrThrow`, THE LIST INDEX).
 * A picked row is sent as the Source token the server resolves from the store: a table as
 * `dataset`, a pick list as `structured_list`.
 *
 * The scope (All / Mine / an organization) is a FILTER, never permission: the store's own access
 * rules are the ceiling; `mine` keeps what the person created.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/utils/supabase/client";
import { recordsDataSource } from "@ai-matrx/records-ui";
import { dataHomeTables } from "@/features/unified-data/hub/doors";
import { postgrestError } from "@/lib/failure/postgrestError";
import { readPickListIndexOrThrow } from "@/features/data-tables/pick-lists/pick-list-index";
import { RECORD_STORE_NOUNS } from "@ai-matrx/associations";
import type { KindItem, KindScope } from "@/features/scopes/service/kindInventory";

export type RecordStoreKind = "table" | "pick_list";

/** The Source token a picked row of each record-store kind is sent as. */
export const RECORD_STORE_TOKEN: Record<RecordStoreKind, string> = {
  table: "dataset",
  // The server reads both with one reader; the token only names the card ("Table" / "Pick list").
  pick_list: "pick_list",
};

/** The badge a pick list's row carries inside Tables (vocabulary: a Pick list is a Table). */
export const PICK_LIST_BADGE = RECORD_STORE_NOUNS.pick_list.label;

/** A Tables row; `badge` set on a pick list. */
export interface TablesItem extends KindItem {
  badge?: string;
  /** Set on a pick list: the row is picked as this token, not the entry's. */
  token?: string;
}

/**
 * Tables, as Use existing offers them: every person's Table plus every pick list, one list.
 * The pick-list index (`custom.pick_list_index*`) is THE truth for pick lists — the data home's
 * "list" kind also counts the choice Tables the app makes behind a choice column ("State choices",
 * hundreds of them), which nobody made as a list. A Table that is also a pick list shows once,
 * as a pick list.
 */
export async function listTablesAndPickLists(scope: KindScope, userId: string, query = ""): Promise<TablesItem[]> {
  const [tables, lists] = await Promise.all([
    listRecordStoreItems("table", scope, userId, query),
    listRecordStoreItems("pick_list", scope, userId, query),
  ]);
  const listIds = new Set(lists.map((l) => l.id));
  return [
    ...lists.map((l) => ({ ...l, badge: PICK_LIST_BADGE, token: RECORD_STORE_TOKEN.pick_list })),
    ...tables.filter((t) => !listIds.has(t.id)),
  ].sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
}

/** How many Tables (pick lists included); null = could not count. */
export async function countTablesAndPickLists(scope: KindScope, userId: string): Promise<number | null> {
  try {
    return (await listTablesAndPickLists(scope, userId)).length;
  } catch (error) {
    console.error("[recordStoreKinds] could not count tables:", error);
    return null;
  }
}

/** One page of Tables, in `useKindItems`'s `fetchPage` shape. */
export async function fetchTablesPage(args: {
  scope: KindScope;
  userId: string;
  query?: string;
  offset: number;
  limit: number;
}): Promise<TablesItem[]> {
  const all = await listTablesAndPickLists(args.scope, args.userId, args.query ?? "");
  return all.slice(args.offset, args.offset + args.limit);
}

interface StoreRow extends KindItem {
  /** The person signed in made it (Mine). */
  mine: boolean;
}

function organizationOf(scope: KindScope): string | null {
  if (scope.kind === "organization") return scope.organizationId;
  if (scope.kind === "mine") return scope.organizationId ?? null;
  return null;
}

/**
 * One read per (kind, scope, person) at a time: Use existing asks for the Tables count and the
 * Tables page in the same breath, and each used to walk both store doors again. A settled read is
 * kept a few seconds so the pair shares it; a failed one is dropped at once, so "Try again" reads.
 */
const READ_SHARE_MS = 5_000;
const sharedReads = new Map<string, { at: number; read: Promise<StoreRow[]> }>();

function readAll(kind: RecordStoreKind, scope: KindScope, userId: string): Promise<StoreRow[]> {
  const key = `${kind}|${JSON.stringify(scope)}|${userId}`;
  const held = sharedReads.get(key);
  if (held && Date.now() - held.at < READ_SHARE_MS) return held.read;
  const read = readAllFresh(kind, scope, userId);
  sharedReads.set(key, { at: Date.now(), read });
  read.catch(() => {
    if (sharedReads.get(key)?.read === read) sharedReads.delete(key);
  });
  return read;
}

async function readAllFresh(kind: RecordStoreKind, scope: KindScope, userId: string): Promise<StoreRow[]> {
  const organizationId = organizationOf(scope);
  if (kind === "table") {
    const answered = await dataHomeTables(recordsDataSource(supabase as unknown as SupabaseClient), organizationId);
    if (!answered.ok) {
      // Through the one translator, with the store's code kept on the error (a timeout reads as one).
      throw postgrestError(
        { message: answered.error.message, code: answered.error.sqlstate, hint: answered.error.hint },
        { action: "listing your tables", fallback: "Your tables could not be listed." },
      );
    }
    // The store's word "table" is a person's own table; lists, forms, scopes… are other kinds.
    return answered.data
      .filter((t) => t.kind === "table" && !t.platform_owned)
      .map((t) => ({
        id: t.table_id,
        title: (t.table_name ?? "").trim() || "Untitled table",
        updatedAt: t.updated_at ?? null,
        mine: t.mine,
      }));
  }
  const { lists } = await readPickListIndexOrThrow(
    supabase as unknown as SupabaseClient,
    organizationId ? { organizationId } : { everywhere: true },
  );
  return lists.map((l) => ({ id: l.id, title: l.listName, updatedAt: l.updatedAt, mine: l.createdBy === userId }));
}

/** Every row of the kind the scope keeps, searched by title, newest first, once per id. */
export async function listRecordStoreItems(
  kind: RecordStoreKind,
  scope: KindScope,
  userId: string,
  query = "",
): Promise<KindItem[]> {
  const rows = await readAll(kind, scope, userId);
  const needle = query.trim().toLowerCase();
  const seen = new Set<string>();
  return rows
    .filter((r) => (scope.kind === "mine" ? r.mine : true))
    .filter((r) => (needle ? r.title.toLowerCase().includes(needle) : true))
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))
    .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
}

/** How many the scope holds; null = could not count (the tile shows a dash and still opens). */
export async function countRecordStoreItems(kind: RecordStoreKind, scope: KindScope, userId: string): Promise<number | null> {
  try {
    return (await listRecordStoreItems(kind, scope, userId)).length;
  } catch (error) {
    console.error(`[recordStoreKinds] could not count ${kind}s:`, error);
    return null;
  }
}

/** One page, in `useKindItems`'s `fetchPage` shape. The store's doors answer whole, so this slices. */
export async function fetchRecordStorePage(args: {
  kind: RecordStoreKind;
  scope: KindScope;
  userId: string;
  query?: string;
  offset: number;
  limit: number;
}): Promise<KindItem[]> {
  const all = await listRecordStoreItems(args.kind, args.scope, args.userId, args.query ?? "");
  return all.slice(args.offset, args.offset + args.limit);
}
