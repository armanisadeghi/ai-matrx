// @ts-nocheck

"use server";

import { createClient } from "@/utils/supabase/server";
import { fromDeprecatedTable } from "@/utils/supabase/deprecated-tables";
import { buildSearchOr } from "@/utils/supabase-search";
import type {
  AiRun,
  AiRunWithTasks,
  CreateAiRunInput,
  UpdateAiRunInput,
  AiRunsListFilters,
  AiRunsListResponse,
  RunMessage,
} from "@/features/ai-runs/types/aiRunTypes";
import {
  mapAiRunRow,
  mapAiTaskRow,
  runMessagesFromJson,
} from "@/features/ai-runs/utils/db-row-mappers";

/**
 * AI Runs Server Actions
 *
 * Server-side operations for ai_runs table.
 * These actions run on the server and respect RLS policies.
 */

export async function createAiRun(input: CreateAiRunInput): Promise<AiRun> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("User not authenticated");

  const { data, error } = await supabase
    .from("ai_runs")
    .insert({
      user_id: user.id,
      source_type: input.source_type,
      source_id: input.source_id,
      name: input.name,
      description: input.description,
      tags: input.tags || [],
      settings: input.settings,
      variable_values: input.variable_values || {},
      broker_values: input.broker_values || {},
      attachments: input.attachments || [],
      metadata: input.metadata || {},
    })
    .select()
    .single();

  if (error) throw error;
  return mapAiRunRow(data);
}

export async function getAiRun(runId: string): Promise<AiRun | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ai_runs")
    .select("*")
    .eq("id", runId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return mapAiRunRow(data);
}

export async function getAiRunWithTasks(
  runId: string,
): Promise<AiRunWithTasks | null> {
  const supabase = await createClient();

  // Get run
  const { data: run, error: runError } = await supabase
    .from("ai_runs")
    .select("*")
    .eq("id", runId)
    .single();

  if (runError) {
    if (runError.code === "PGRST116") return null;
    throw runError;
  }

  // Get tasks
  const { data: tasks, error: tasksError } = await fromDeprecatedTable(
    "ai_tasks",
    "actions/ai-runs.actions.ts:getAiRunWithTasks",
  )
    .select("*")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  if (tasksError) throw tasksError;

  return {
    ...mapAiRunRow(run),
    tasks: (tasks || []).map(mapAiTaskRow),
  };
}

export async function listAiRuns(
  filters: AiRunsListFilters = {},
): Promise<AiRunsListResponse> {
  const supabase = await createClient();

  const {
    source_type,
    source_id,
    status = "active",
    starred,
    search,
    limit = 20,
    offset = 0,
    order_by = "last_message_at",
    order_direction = "desc",
  } = filters;

  let query = supabase.from("ai_runs").select("*", { count: "exact" });

  if (source_type) query = query.eq("source_type", source_type);
  if (source_id) query = query.eq("source_id", source_id);
  if (status) query = query.eq("status", status);
  if (starred !== undefined) query = query.eq("is_starred", starred);

  if (search) {
    query = query.or(buildSearchOr(search, ["name", "description"]));
  }

  query = query.order(order_by, { ascending: order_direction === "asc" });
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    runs: (data || []).map(mapAiRunRow),
    total: count || 0,
    hasMore: (count || 0) > offset + limit,
  };
}

export async function updateAiRun(
  runId: string,
  input: UpdateAiRunInput,
): Promise<AiRun> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ai_runs")
    .update(input)
    .eq("id", runId)
    .select()
    .single();

  if (error) throw error;
  return mapAiRunRow(data);
}

export async function deleteAiRun(runId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("ai_runs")
    .update({ status: "deleted" })
    .eq("id", runId);

  if (error) throw error;
}

export async function toggleAiRunStar(runId: string): Promise<AiRun> {
  const supabase = await createClient();

  const { data: current, error: getError } = await supabase
    .from("ai_runs")
    .select("is_starred")
    .eq("id", runId)
    .single();

  if (getError) throw getError;

  const { data, error } = await supabase
    .from("ai_runs")
    .update({ is_starred: !current.is_starred })
    .eq("id", runId)
    .select()
    .single();

  if (error) throw error;
  return mapAiRunRow(data);
}

export async function addMessageToRun(
  runId: string,
  message: RunMessage,
): Promise<AiRun> {
  const supabase = await createClient();

  const { data: current, error: getError } = await supabase
    .from("ai_runs")
    .select("messages")
    .eq("id", runId)
    .single();

  if (getError) throw getError;

  const updatedMessages = [...runMessagesFromJson(current.messages), message];

  const { data, error } = await supabase
    .from("ai_runs")
    .update({ messages: updatedMessages })
    .eq("id", runId)
    .select()
    .single();

  if (error) throw error;
  return mapAiRunRow(data);
}

export async function archiveAiRun(runId: string): Promise<AiRun> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ai_runs")
    .update({ status: "archived" })
    .eq("id", runId)
    .select()
    .single();

  if (error) throw error;
  return mapAiRunRow(data);
}

export async function restoreAiRun(runId: string): Promise<AiRun> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ai_runs")
    .update({ status: "active" })
    .eq("id", runId)
    .select()
    .single();

  if (error) throw error;
  return mapAiRunRow(data);
}
