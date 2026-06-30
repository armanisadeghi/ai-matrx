"use server";

import { revalidatePath } from "next/cache";
import type { TablesUpdate } from "@/types/database.types";
import { createClient } from "@/utils/supabase/server";
import type { CreateListItemInput } from "../types";

// ─── Create ────────────────────────────────────────────────────────────────────

export async function createListAction(formData: {
  list_name: string;
  description?: string;
  is_public?: boolean;
  public_read?: boolean;
  items?: CreateListItemInput[];
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase.rpc("create_user_list", {
    p_list_name: formData.list_name,
    p_description: formData.description ?? "",
    p_user_id: user.id,
    p_is_public: formData.is_public ?? false,
    p_authenticated_read: false,
    p_public_read: formData.public_read ?? true,
    p_items: formData.items ?? [],
  });

  if (error) throw new Error(`Failed to create list: ${error.message}`);
  revalidatePath("/lists");
  revalidatePath("/lists-v2");
  return data as unknown as { list_id: string; list_name: string };
}

// ─── Update ────────────────────────────────────────────────────────────────────

export async function updateListAction(formData: {
  list_id: string;
  list_name?: string;
  description?: string;
  is_public?: boolean;
  public_read?: boolean;
  items?: CreateListItemInput[] | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase.rpc("update_user_list", {
    p_list_id: formData.list_id,
    p_list_name: formData.list_name,
    p_description: formData.description,
    p_is_public: formData.is_public,
    p_public_read: formData.public_read,
    p_items: formData.items !== undefined ? formData.items : null,
  });

  if (error) throw new Error(`Failed to update list: ${error.message}`);
  revalidatePath("/lists");
  revalidatePath(`/lists/${formData.list_id}`);
  revalidatePath("/lists-v2");
  revalidatePath(`/lists-v2/${formData.list_id}`);
  return data;
}

// ─── Delete ────────────────────────────────────────────────────────────────────

export async function deleteListAction(listId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .schema("workbench")
    .from("udt_picklists")
    .delete()
    .eq("id", listId)
    .eq("user_id", user.id);

  if (error) throw new Error(`Failed to delete list: ${error.message}`);
  revalidatePath("/lists");
  revalidatePath("/lists-v2");
}

// ─── Item mutations ────────────────────────────────────────────────────────────

export async function addItemAction(params: {
  listId: string;
  label: string;
  description?: string;
  helpText?: string;
  groupName?: string;
  iconName?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .schema("workbench")
    .from("udt_picklist_items")
    .insert({
      list_id: params.listId,
      user_id: user.id,
      label: params.label,
      description: params.description ?? null,
      help_text: params.helpText ?? null,
      group_name: params.groupName ?? null,
      icon_name: params.iconName ?? null,
      is_public: false,
      public_read: true,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to add item: ${error.message}`);
  revalidatePath(`/lists/${params.listId}`);
  revalidatePath(`/lists-v2/${params.listId}`);
  return data;
}

export async function updateItemAction(params: {
  itemId: string;
  listId: string;
  label?: string;
  description?: string | null;
  helpText?: string | null;
  groupName?: string | null;
  iconName?: string | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const patch: TablesUpdate<{ schema: "workbench" }, "udt_picklist_items"> = {
    updated_at: new Date().toISOString(),
  };
  if (params.label !== undefined) patch.label = params.label;
  if (params.description !== undefined) patch.description = params.description;
  if (params.helpText !== undefined) patch.help_text = params.helpText;
  if (params.groupName !== undefined) patch.group_name = params.groupName;
  if (params.iconName !== undefined) patch.icon_name = params.iconName;

  const { data, error } = await supabase
    .schema("workbench")
    .from("udt_picklist_items")
    .update(patch)
    .eq("id", params.itemId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update item: ${error.message}`);
  revalidatePath(`/lists/${params.listId}`);
  revalidatePath(`/lists-v2/${params.listId}`);
  return data;
}

export async function deleteItemAction(itemId: string, listId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .schema("workbench")
    .from("udt_picklist_items")
    .delete()
    .eq("id", itemId)
    .eq("user_id", user.id);

  if (error) throw new Error(`Failed to delete item: ${error.message}`);
  revalidatePath(`/lists/${listId}`);
  revalidatePath(`/lists-v2/${listId}`);
}
