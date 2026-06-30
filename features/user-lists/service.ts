/**
 * User Lists service — wraps Supabase RPCs and table queries.
 *
 * Client-side functions use the browser Supabase client.
 * Server-side functions are imported by Server Components / Server Actions
 * via the server client factory.
 */
import { supabase } from "@/utils/supabase/client";
import type {
  UserList,
  UserListSummaryRaw,
  UserListWithItems,
  CreateListInput,
  UpdateListInput,
  PicklistForSelection,
} from "./types";
import { normalizeUserList } from "./types";

// ─── Summary (index) ──────────────────────────────────────────────────────────

/**
 * Returns all lists owned by the given user, with item_count and group_count.
 * Note: this RPC is owner-only. For shared lists, call getAccessibleLists().
 */
export async function getOwnedListsSummary(
  userId: string,
): Promise<UserList[]> {
  const { data, error } = await supabase.rpc("get_user_lists_summary", {
    p_user_id: userId,
  });
  if (error) throw new Error(`Failed to load lists: ${error.message}`);
  return ((data as unknown as UserListSummaryRaw[]) ?? []).map(
    normalizeUserList,
  );
}

/**
 * Returns all lists the current user can access (owned + shared via RLS).
 * Uses a direct table query so RLS policies apply automatically.
 */
export async function getAccessibleLists(): Promise<UserList[]> {
  const { data, error } = await supabase
    .schema("workbench")
    .from("udt_picklists")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load lists: ${error.message}`);
  return (data as UserList[]) ?? [];
}

// ─── Detail ────────────────────────────────────────────────────────────────────

export async function getListWithItems(
  listId: string,
): Promise<UserListWithItems | null> {
  const { data, error } = await supabase.rpc("get_user_list_with_items", {
    p_list_id: listId,
  });
  if (error) throw new Error(`Failed to load list: ${error.message}`);
  return (data as unknown as UserListWithItems) ?? null;
}

/**
 * Label-only read path for CONSUMERS (chat / agent apps / widgets). Returns
 * labels / help_text / groups / icons but NEVER the secret item `description`.
 * Backed by the get_picklist_for_selection RPC (SECURITY DEFINER) so it works
 * even for a private list bound to an agent the caller is running. Use this —
 * never getListWithItems — anywhere a non-owner can see the result.
 */
export async function getPicklistForSelection(
  listId: string,
): Promise<PicklistForSelection | null> {
  const { data, error } = await supabase.rpc("get_picklist_for_selection", {
    p_list_id: listId,
  });
  if (error) throw new Error(`Failed to load picklist: ${error.message}`);
  return (data as unknown as PicklistForSelection) ?? null;
}

// ─── Create ────────────────────────────────────────────────────────────────────

export async function createList(input: CreateListInput) {
  const { data, error } = await supabase.rpc("create_user_list", {
    p_list_name: input.p_list_name,
    p_description: input.p_description ?? "",
    p_user_id: input.p_user_id,
    p_is_public: input.p_is_public ?? false,
    p_authenticated_read: false,
    p_public_read: input.p_public_read ?? true,
    p_items: input.p_items ?? [],
  });
  if (error) throw new Error(`Failed to create list: ${error.message}`);
  return data;
}

// ─── Update ────────────────────────────────────────────────────────────────────

export async function updateList(input: UpdateListInput) {
  const { data, error } = await supabase.rpc("update_user_list", {
    p_list_id: input.p_list_id,
    p_list_name: input.p_list_name,
    p_description: input.p_description,
    p_is_public: input.p_is_public,
    p_public_read: input.p_public_read,
    p_items: input.p_items !== undefined ? input.p_items : null,
  });
  if (error) throw new Error(`Failed to update list: ${error.message}`);
  return data;
}

// ─── Delete ────────────────────────────────────────────────────────────────────

export async function deleteList(listId: string): Promise<void> {
  const { error } = await supabase
    .schema("workbench")
    .from("udt_picklists")
    .delete()
    .eq("id", listId);
  if (error) throw new Error(`Failed to delete list: ${error.message}`);
}

// ─── Item-level mutations (partial, no full replace) ─────────────────────────

export async function addItemToList(params: {
  listId: string;
  userId: string;
  label: string;
  description?: string;
  helpText?: string;
  groupName?: string;
  iconName?: string;
  isPublic?: boolean;
  publicRead?: boolean;
}) {
  const { data, error } = await supabase
    .schema("workbench")
    .from("udt_picklist_items")
    .insert({
      list_id: params.listId,
      user_id: params.userId,
      label: params.label,
      description: params.description ?? null,
      help_text: params.helpText ?? null,
      group_name: params.groupName ?? null,
      icon_name: params.iconName ?? null,
      is_public: params.isPublic ?? false,
      public_read: params.publicRead ?? true,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to add item: ${error.message}`);
  return data;
}

export async function updateItem(
  itemId: string,
  patch: {
    label?: string;
    description?: string | null;
    help_text?: string | null;
    group_name?: string | null;
    icon_name?: string | null;
  },
) {
  const { data, error } = await supabase
    .schema("workbench")
    .from("udt_picklist_items")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", itemId)
    .select()
    .single();
  if (error) throw new Error(`Failed to update item: ${error.message}`);
  return data;
}

export async function deleteItem(itemId: string): Promise<void> {
  const { error } = await supabase
    .schema("workbench")
    .from("udt_picklist_items")
    .delete()
    .eq("id", itemId);
  if (error) throw new Error(`Failed to delete item: ${error.message}`);
}
