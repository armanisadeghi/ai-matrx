"use server";

import { createClient } from "@/utils/supabase/server";
import { fromDeprecatedTable } from "@/utils/supabase/deprecated-tables";
import type {
  AiTask,
  CreateAiTaskInput,
  UpdateAiTaskInput,
  CompleteAiTaskInput,
} from "@/features/ai-runs/types/aiRunTypes";
import { mapAiTaskRow } from "@/features/ai-runs/utils/db-row-mappers";

const aiTasksTable = (method: string) =>
  fromDeprecatedTable("ai_tasks", `actions/ai-tasks.actions.ts:${method}`);

/**
 * AI Tasks Server Actions
 *
 * Server-side operations for ai_tasks table.
 * These actions run on the server and respect RLS policies.
 */

export async function createAiTask(input: CreateAiTaskInput): Promise<AiTask> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("User not authenticated");

  const { data, error } = await aiTasksTable("createAiTask")
    .insert({
      user_id: user.id,
      run_id: input.run_id,
      task_id: input.task_id,
      service: input.service,
      task_name: input.task_name,
      ...(input.provider !== undefined && { provider: input.provider }),
      ...(input.endpoint !== undefined && { endpoint: input.endpoint }),
      ...(input.model !== undefined && { model: input.model }),
      ...(input.model_id !== undefined && { model_id: input.model_id }),
      request_data: input.request_data,
      status: "pending",
    })
    .select()
    .single();

  if (error) throw error;
  return mapAiTaskRow(data);
}

export async function getAiTask(id: string): Promise<AiTask | null> {
  const { data, error } = await aiTasksTable("getAiTask")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return mapAiTaskRow(data);
}

export async function getAiTaskByTaskId(
  taskId: string,
): Promise<AiTask | null> {
  const { data, error } = await aiTasksTable("getAiTaskByTaskId")
    .select("*")
    .eq("task_id", taskId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return mapAiTaskRow(data);
}

export async function listAiTasksForRun(runId: string): Promise<AiTask[]> {
  const { data, error } = await aiTasksTable("listAiTasksForRun")
    .select("*")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []).map(mapAiTaskRow);
}

export async function updateAiTask(
  taskId: string,
  input: UpdateAiTaskInput,
): Promise<AiTask> {
  const { data, error } = await aiTasksTable("updateAiTask")
    .update(input)
    .eq("task_id", taskId)
    .select()
    .single();

  if (error) throw error;
  return mapAiTaskRow(data);
}

export async function completeAiTask(
  taskId: string,
  input: CompleteAiTaskInput,
): Promise<AiTask> {
  const updateData: UpdateAiTaskInput = {
    response_text: input.response_text,
    response_data: input.response_data,
    response_metadata: input.response_metadata || {},
    response_complete: true,
    tokens_input: input.tokens_input,
    tokens_output: input.tokens_output,
    tokens_total: input.tokens_total,
    cost: input.cost,
    time_to_first_token: input.time_to_first_token,
    total_time: input.total_time,
    status: "completed",
  };

  const { data, error } = await aiTasksTable("completeAiTask")
    .update(updateData)
    .eq("task_id", taskId)
    .select()
    .single();

  if (error) throw error;
  return mapAiTaskRow(data);
}

export async function failAiTask(
  taskId: string,
  errorData?: Record<string, any>,
): Promise<AiTask> {
  const { data, error } = await aiTasksTable("failAiTask")
    .update({
      status: "failed",
      response_errors: errorData,
      response_complete: true,
    })
    .eq("task_id", taskId)
    .select()
    .single();

  if (error) throw error;
  return mapAiTaskRow(data);
}

export async function cancelAiTask(taskId: string): Promise<AiTask> {
  const { data, error } = await aiTasksTable("cancelAiTask")
    .update({
      status: "cancelled",
      response_complete: true,
    })
    .eq("task_id", taskId)
    .select()
    .single();

  if (error) throw error;
  return mapAiTaskRow(data);
}
