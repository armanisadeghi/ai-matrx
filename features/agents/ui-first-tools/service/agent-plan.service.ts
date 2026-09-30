/**
 * cx_agent_plan — service layer.
 *
 * One "current" plan per conversation is the active concept; older plans
 * carry `status='superseded'`. The handler tolerates multiple rows: it
 * always reads the most-recently-updated non-superseded plan as "the
 * current plan."
 */

import { db } from "./supabase-typed";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import type {
  CxAgentPlanRow,
  CxPlanStatus,
} from "../tools/types";
import { writeOneRow } from "@/utils/supabase/writeOne";

export interface CreateAgentPlanInput {
  conversation_id: string;
  title: string;
  steps: string[];
  reasoning?: string | null;
  domains?: string[] | null;
  estimated_minutes?: number | null;
}

export async function getCurrentPlan(
  conversationId: string,
): Promise<CxAgentPlanRow | null> {
  const { data, error } = await db
    .schema("chat").from("agent_plan")
    .select("*")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .neq("status", "superseded")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as CxAgentPlanRow) ?? null;
}

export async function listPlansForConversation(
  conversationId: string,
): Promise<CxAgentPlanRow[]> {
  const { data, error } = await db
    .schema("chat").from("agent_plan")
    .select("*")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CxAgentPlanRow[];
}

export async function createPlan(
  input: CreateAgentPlanInput,
): Promise<CxAgentPlanRow> {
  // Supersede any existing non-superseded plan first — only one active plan
  // per conversation at a time. Same-tick race is fine: both rows just become
  // candidates for "the current plan" and the more-recently-updated one wins.
  await db
    .schema("chat").from("agent_plan")
    .update({ status: "superseded" })
    .eq("conversation_id", input.conversation_id)
    .is("deleted_at", null)
    .neq("status", "superseded");

  const { data, error } = await db
    .schema("chat").from("agent_plan")
    .insert({
      // `created_by` is stamped by the `_stamp_actor` trigger — never client-set.
      organization_id: await ensureOrgId(undefined),
      conversation_id: input.conversation_id,
      title: input.title,
      steps: input.steps,
      reasoning: input.reasoning ?? null,
      domains: input.domains ?? null,
      estimated_minutes: input.estimated_minutes ?? null,
      status: "proposed",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as CxAgentPlanRow;
}

export async function setPlanStatus(
  planId: string,
  status: CxPlanStatus,
): Promise<CxAgentPlanRow> {
  const { data, error } = await writeOneRow(
    db
      .schema("chat").from("agent_plan")
      .update({ status })
      .eq("id", planId)
      .select("*"),
    { action: "update", noun: "agent plan" },
  );
  if (error) throw error;
  return data as CxAgentPlanRow;
}

/** Move every plan of a conversation to Trash (soft delete; restorable). */
export async function clearPlan(conversationId: string): Promise<void> {
  const { error } = await db
    .schema("chat").from("agent_plan")
    .update({ deleted_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .is("deleted_at", null);
  if (error) throw error;
}
