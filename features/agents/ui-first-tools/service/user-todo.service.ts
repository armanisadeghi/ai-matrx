/**
 * cx_user_todo — service layer for items the agent assigns BACK to the user.
 */

import { db } from "./supabase-typed";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import type { CxUserTodoRow } from "../tools/types";

export interface CreateUserTodoInput {
  conversation_id: string;
  user_id: string;
  title: string;
  context?: string | null;
  due?: string | null;
}

export async function listUserTodos(
  conversationId: string,
): Promise<CxUserTodoRow[]> {
  const { data, error } = await db
    .schema("chat").from("user_todo")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("done", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CxUserTodoRow[];
}

export async function addUserTodo(
  input: CreateUserTodoInput,
): Promise<CxUserTodoRow> {
  const { data, error } = await db
    .schema("chat").from("user_todo")
    .insert({
      organization_id: await ensureOrgId(undefined),
      conversation_id: input.conversation_id,
      user_id: input.user_id,
      title: input.title,
      context: input.context ?? null,
      due: input.due ?? null,
      done: false,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as CxUserTodoRow;
}

export async function updateUserTodo(
  id: string,
  patch: Partial<{
    title: string;
    context: string | null;
    due: string | null;
    done: boolean;
  }>,
): Promise<CxUserTodoRow | null> {
  const { data, error } = await db
    .schema("chat").from("user_todo")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return (data as CxUserTodoRow) ?? null;
}

export async function removeUserTodo(id: string): Promise<void> {
  const { error } = await db.schema("chat").from("user_todo").delete().eq("id", id);
  if (error) throw error;
}

export async function clearDoneUserTodos(
  conversationId: string,
): Promise<string[]> {
  const { data, error } = await db
    .schema("chat").from("user_todo")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("done", true)
    .select("id");
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}
