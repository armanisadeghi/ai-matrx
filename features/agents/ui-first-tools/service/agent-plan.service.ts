/**
 * cx_agent_plan — service layer.
 *
 * One "current" plan per conversation is the active concept; older plans
 * carry `status='superseded'`. The handler tolerates multiple rows: it
 * always reads the most-recently-updated non-superseded plan as "the
 * current plan."
 */

import { db } from "./supabase-typed";
import type {
  CxAgentPlanRow,
  CxPlanStatus,
} from "../tools/types";

export interface CreateAgentPlanInput {
  conversation_id: string;
  user_id: string;
  title: string;
  steps: string[];
  reasoning?: string | null;
  domains?: string[] | null;
  estimated_minutes?: number | null;
  project_id?: string | null;
}

export async function getCurrentPlan(
  conversationId: string,
): Promise<CxAgentPlanRow | null> {
  const { data, error } = await db
    .from("cx_agent_plan")
    .select("*")
    .eq("conversation_id", conversationId)
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
    .from("cx_agent_plan")
    .select("*")
    .eq("conversation_id", conversationId)
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
    .from("cx_agent_plan")
    .update({ status: "superseded" })
    .eq("conversation_id", input.conversation_id)
    .neq("status", "superseded");

  const { data, error } = await db
    .from("cx_agent_plan")
    .insert({
      conversation_id: input.conversation_id,
      user_id: input.user_id,
      title: input.title,
      steps: input.steps,
      reasoning: input.reasoning ?? null,
      domains: input.domains ?? null,
      estimated_minutes: input.estimated_minutes ?? null,
      project_id: input.project_id ?? null,
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
  const { data, error } = await db
    .from("cx_agent_plan")
    .update({ status })
    .eq("id", planId)
    .select("*")
    .single();
  if (error) throw error;
  return data as CxAgentPlanRow;
}

export async function clearPlan(conversationId: string): Promise<void> {
  const { error } = await db
    .from("cx_agent_plan")
    .delete()
    .eq("conversation_id", conversationId);
  if (error) throw error;
}
