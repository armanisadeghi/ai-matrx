import { fromDeprecatedTable } from "@/utils/supabase/deprecated-tables";
import { requireUserId } from "@/utils/auth/getUserId";
import { mapAiTaskRow } from "@/features/ai-runs/utils/db-row-mappers";
import type {
  AiTask,
  CreateAiTaskInput,
  UpdateAiTaskInput,
  CompleteAiTaskInput,
} from "../types/aiRunTypes";

const aiTasksTable = (method: string) =>
  fromDeprecatedTable(
    "ai_tasks",
    `features/ai-runs/services/ai-tasks-service.ts:${method}`,
  );

/**
 * AI Tasks Service - Client-side CRUD operations for ai_tasks table
 *
 * This service provides all operations needed to manage individual AI tasks.
 * Each task represents a single request/response cycle in a conversation.
 * Task IDs must match socket.io task IDs for proper tracking.
 */

export const aiTasksService = {
  /**
   * Create a new task (before submitting to socket.io)
   */
  async create(input: CreateAiTaskInput): Promise<AiTask> {
    const userId = requireUserId();

    const { data, error } = await aiTasksTable("create")
      .insert({
        user_id: userId,
        run_id: input.run_id,
        task_id: input.task_id,
        service: input.service,
        task_name: input.task_name,
        model_id: input.model_id,
        request_data: input.request_data,
        status: "pending",
      })
      .select()
      .single();

    if (error) throw error;
    return mapAiTaskRow(data);
  },

  /**
   * Get a task by database ID
   */
  async get(id: string): Promise<AiTask | null> {
    const { data, error } = await aiTasksTable("get")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }

    return mapAiTaskRow(data);
  },

  /**
   * Get a task by socket.io task_id (most common lookup)
   */
  async getByTaskId(taskId: string): Promise<AiTask | null> {
    const { data, error } = await aiTasksTable("getByTaskId")
      .select("*")
      .eq("task_id", taskId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }

    return mapAiTaskRow(data);
  },

  /**
   * List all tasks for a run
   */
  async listForRun(runId: string): Promise<AiTask[]> {
    const { data, error } = await aiTasksTable("listForRun")
      .select("*")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return (data ?? []).map(mapAiTaskRow);
  },

  /**
   * List all tasks with pagination and filters
   */
  async list(filters?: {
    run_id?: string;
    status?: string;
    limit?: number;
    offset?: number;
    order_by?: "created_at" | "updated_at";
    order_direction?: "asc" | "desc";
  }): Promise<{ tasks: AiTask[]; total: number; hasMore: boolean }> {
    const userId = requireUserId();

    const limit = filters?.limit || 20;
    const offset = filters?.offset || 0;
    const orderBy = filters?.order_by || "created_at";
    const orderDirection = filters?.order_direction || "desc";

    let query = aiTasksTable("list")
      .select("*", { count: "exact" })
      .eq("user_id", userId);

    if (filters?.run_id) {
      query = query.eq("run_id", filters.run_id);
    }

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    query = query
      .order(orderBy, { ascending: orderDirection === "asc" })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    const tasks = (data ?? []).map(mapAiTaskRow);
    const total = count || 0;
    const hasMore = offset + limit < total;

    return { tasks, total, hasMore };
  },

  /**
   * Update a task (used during streaming)
   */
  async update(taskId: string, input: UpdateAiTaskInput): Promise<AiTask> {
    const { data, error } = await aiTasksTable("update")
      .update(input)
      .eq("task_id", taskId)
      .select()
      .single();

    if (error) throw error;
    return mapAiTaskRow(data);
  },

  /**
   * Update a task by database ID
   */
  async updateById(id: string, input: UpdateAiTaskInput): Promise<AiTask> {
    const { data, error } = await aiTasksTable("updateById")
      .update(input)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return mapAiTaskRow(data);
  },

  /**
   * Complete a task with final data
   */
  async complete(taskId: string, input: CompleteAiTaskInput): Promise<AiTask> {
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

    const { data, error } = await aiTasksTable("complete")
      .update(updateData)
      .eq("task_id", taskId)
      .select()
      .single();

    if (error) throw error;
    return mapAiTaskRow(data);
  },

  /**
   * Mark a task as failed
   */
  async fail(taskId: string, errorData?: Record<string, any>): Promise<AiTask> {
    const { data, error } = await aiTasksTable("fail")
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
  },

  /**
   * Cancel a task
   */
  async cancel(taskId: string): Promise<AiTask> {
    const { data, error } = await aiTasksTable("cancel")
      .update({
        status: "cancelled",
        response_complete: true,
      })
      .eq("task_id", taskId)
      .select()
      .single();

    if (error) throw error;
    return mapAiTaskRow(data);
  },

  /**
   * Update streaming status (convenience method)
   */
  async updateStreaming(
    taskId: string,
    responseText: string,
    additionalData?: {
      response_data?: Record<string, any>;
      response_info?: Record<string, any>;
      tool_updates?: Record<string, any>;
    },
  ): Promise<AiTask> {
    const updateData: UpdateAiTaskInput = {
      response_text: responseText,
      status: "streaming",
      ...additionalData,
    };

    const { data, error } = await aiTasksTable("updateStreaming")
      .update(updateData)
      .eq("task_id", taskId)
      .select()
      .single();

    if (error) throw error;
    return mapAiTaskRow(data);
  },

  /**
   * Delete a task (cascade will handle if run is deleted)
   */
  async delete(taskId: string): Promise<void> {
    const { error } = await aiTasksTable("delete")
      .delete()
      .eq("task_id", taskId);

    if (error) throw error;
  },

  /**
   * Get the latest task for a run
   */
  async getLatestForRun(runId: string): Promise<AiTask | null> {
    const { data, error } = await aiTasksTable("getLatestForRun")
      .select("*")
      .eq("run_id", runId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }

    return mapAiTaskRow(data);
  },
};
