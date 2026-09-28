/**
 * cx_user_todo — service layer for items the agent assigns BACK to the user.
 */

import { db } from "./supabase-typed";
import { writeOne } from "@/utils/supabase/writeOne";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import type { CxUserTodoRow } from "../tools/types";

export interface CreateUserTodoInput {
  conversation_id: string;
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
    .is("deleted_at", null)
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
      // `created_by` is stamped by the `_stamp_actor` trigger — never client-set.
      organization_id: await ensureOrgId(undefined),
      conversation_id: input.conversation_id,
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

/** Move one to-do to Trash (soft delete; restorable). */
export async function removeUserTodo(id: string): Promise<void> {
  await writeOne(
    db
      .schema("chat")
      .from("user_todo")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .select("id"),
    { action: "archive", noun: "to-do" },
  );
}

/** Move every done to-do of a conversation to Trash; returns their ids. */
export async function clearDoneUserTodos(
  conversationId: string,
): Promise<string[]> {
  const { data, error } = await db
    .schema("chat").from("user_todo")
    .update({ deleted_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("done", true)
    .is("deleted_at", null)
    .select("id");
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}
