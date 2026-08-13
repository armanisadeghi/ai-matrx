/**
 * cx_agent_task — service layer for the agent's tasklist.
 */

import { db } from "./supabase-typed";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import type {
  CxAgentTaskRow,
  CxAgentTaskStatus,
  CxAgentTaskCreator,
} from "../tools/types";

export interface CreateAgentTaskInput {
  conversation_id: string;
  title: string;
  status?: CxAgentTaskStatus;
  note?: string | null;
  position?: number;
  /** Who authored the task (agent vs user) — not an owner. */
  creator_kind?: CxAgentTaskCreator;
  plan_id?: string | null;
}

export async function listTasks(
  conversationId: string,
): Promise<CxAgentTaskRow[]> {
  const { data, error } = await db
    .schema("chat").from("agent_task")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CxAgentTaskRow[];
}

export async function addTasks(
  inputs: CreateAgentTaskInput[],
): Promise<CxAgentTaskRow[]> {
  if (inputs.length === 0) return [];

  // Pull current max position so new rows append at the end without
  // clobbering existing positions.
  const first = inputs[0];
  const { data: existing } = await db
    .schema("chat").from("agent_task")
    .select("position")
    .eq("conversation_id", first.conversation_id)
    .order("position", { ascending: false })
    .limit(1);
  const startPos = (existing?.[0]?.position ?? -1) + 1;

  // The row is owned through its parent conversation; `organization_id` is
  // also filled by `trg_inherit_org`, but the generated Insert type requires
  // it, so it is resolved here.
  const organizationId = await ensureOrgId(undefined);
  const rows = inputs.map((input, idx) => ({
    organization_id: organizationId,
    conversation_id: input.conversation_id,
    title: input.title,
    status: input.status ?? "pending",
    note: input.note ?? null,
    position: input.position ?? startPos + idx,
    creator_kind: input.creator_kind ?? "agent",
    plan_id: input.plan_id ?? null,
  }));

  const { data, error } = await db
    .schema("chat").from("agent_task")
    .insert(rows)
    .select("*");
  if (error) throw error;
  return (data ?? []) as CxAgentTaskRow[];
}

export async function updateTask(
  id: string,
  patch: Partial<{
    title: string;
    status: CxAgentTaskStatus;
    note: string | null;
    position: number;
  }>,
): Promise<CxAgentTaskRow | null> {
  const { data, error } = await db
    .schema("chat").from("agent_task")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return (data as CxAgentTaskRow) ?? null;
}

export async function removeTask(id: string): Promise<void> {
  const { error } = await db.schema("chat").from("agent_task").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderTasks(
  conversationId: string,
  orderedIds: string[],
): Promise<CxAgentTaskRow[]> {
  // Position updates one-by-one; small list so the row-count is bounded.
  // Run sequentially to keep individual errors actionable.
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await db
      .schema("chat").from("agent_task")
      .update({ position: i })
      .eq("id", orderedIds[i])
      .eq("conversation_id", conversationId);
    if (error) throw error;
  }
  return listTasks(conversationId);
}

export async function clearCompletedTasks(
  conversationId: string,
): Promise<string[]> {
  const { data, error } = await db
    .schema("chat").from("agent_task")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("status", "done")
    .select("id");
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}

export async function clearAllTasks(conversationId: string): Promise<void> {
  const { error } = await db
    .schema("chat").from("agent_task")
    .delete()
    .eq("conversation_id", conversationId);
  if (error) throw error;
}
