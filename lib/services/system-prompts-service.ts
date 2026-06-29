// @ts-nocheck
import { requireUserId } from "@/utils/auth/getUserId";
import { buildSearchOr } from "@/utils/supabase-search";
/**
 * System Prompts Service
 *
 * Handles all database operations for system prompts.
 * Similar to content-blocks-service.ts pattern.
 */

import { createClient } from "@/utils/supabase/client";
import type {
  SystemPromptDB,
  SystemPromptQueryOptions,
  CreateSystemPromptInput,
  UpdateSystemPromptInput,
  PublishSystemPromptUpdateInput,
  SystemPromptWithStats,
} from "@/types/system-prompts-db";

// TODO: Fix Linter Errors

/**
 * Fetch all system prompts with optional filtering
 */
export async function fetchSystemPrompts(
  options: SystemPromptQueryOptions = {},
) {
  const supabase = createClient();

  let query = supabase.schema("graveyard").from("system_prompts").select("*");

  // Apply filters
  if (options.placement_type) {
    query = query.eq("placement_type", options.placement_type);
  }

  if (options.functionality_id) {
    query = query.eq("functionality_id", options.functionality_id);
  }

  if (options.category) {
    query = query.eq("category", options.category);
  }

  if (options.subcategory) {
    query = query.eq("subcategory", options.subcategory);
  }

  if (options.status) {
    query = query.eq("status", options.status);
  }

  if (options.is_active !== undefined) {
    query = query.eq("is_active", options.is_active);
  }

  if (options.tags && options.tags.length > 0) {
    query = query.contains("tags", options.tags);
  }

  if (options.search) {
    query = query.or(
      buildSearchOr(options.search, [
        "name",
        "description",
        "system_prompt_id",
      ]),
    );
  }

  // Order by category, then sort_order, then name
  query = query.order("category", { ascending: true });
  query = query.order("sort_order", { ascending: true });
  query = query.order("name", { ascending: true });

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching system prompts:", error);
    throw error;
  }

  return data as SystemPromptDB[];
}

/**
 * Fetch a single system prompt by ID
 */
export async function fetchSystemPromptById(id: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .schema("graveyard")
    .from("system_prompts")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching system prompt:", error);
    throw error;
  }

  return data as SystemPromptDB;
}

/**
 * Fetch a single system prompt by system_prompt_id
 */
export async function fetchSystemPromptBySystemId(systemPromptId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .schema("graveyard")
    .from("system_prompts")
    .select("*")
    .eq("system_prompt_id", systemPromptId)
    .single();

  if (error) {
    console.error("Error fetching system prompt:", error);
    throw error;
  }

  return data as SystemPromptDB;
}

/**
 * Fetch system prompts for context menu
 */
export async function fetchContextMenuPrompts() {
  const prompts = await fetchSystemPrompts({
    is_active: true,
    status: "published",
  });

  // Filter to only those enabled for context menu
  return prompts.filter(
    (prompt) => prompt.placement_config?.contextMenu?.enabled === true,
  );
}

/**
 * Fetch system prompts for cards
 */
export async function fetchCardPrompts() {
  const prompts = await fetchSystemPrompts({
    is_active: true,
    status: "published",
  });

  // Filter to only those enabled for cards
  return prompts.filter(
    (prompt) => prompt.placement_config?.card?.enabled === true,
  );
}

/**
 * Fetch system prompts for buttons
 */
export async function fetchButtonPrompts() {
  const prompts = await fetchSystemPrompts({
    is_active: true,
    status: "published",
  });

  // Filter to only those enabled for buttons
  return prompts.filter(
    (prompt) => prompt.placement_config?.button?.enabled === true,
  );
}

/**
 * Create a new system prompt
 */
export async function createSystemPrompt(input: CreateSystemPromptInput) {
  const supabase = createClient();

  const userId = requireUserId();
  const { data, error } = await supabase
    .schema("graveyard")
    .from("system_prompts")
    .insert({
      system_prompt_id: input.system_prompt_id,
      name: input.name,
      description: input.description || null,
      source_prompt_id: input.source_prompt_id || null,
      prompt_snapshot: input.prompt_snapshot,
      display_config: input.display_config || {},
      placement_config: input.placement_config || {},
      category: input.category || "general",
      subcategory: input.subcategory || null,
      tags: input.tags || [],
      sort_order: input.sort_order || 0,
      required_variables: input.required_variables || [],
      optional_variables: input.optional_variables || [],
      variable_mappings: input.variable_mappings || {},
      is_active: input.is_active !== undefined ? input.is_active : true,
      is_featured: input.is_featured || false,
      status: input.status || "published",
      metadata: input.metadata || {},
      published_by: userId,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating system prompt:", error);
    throw error;
  }

  return data as SystemPromptDB;
}

/**
 * Update an existing system prompt
 */
export async function updateSystemPrompt(
  id: string,
  input: UpdateSystemPromptInput,
) {
  const supabase = createClient();

  const userId = requireUserId();
  // Build update object (only include defined fields)
  const updateData: any = {
    last_updated_by: userId,
    last_updated_at: new Date().toISOString(),
  };

  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined)
    updateData.description = input.description;
  if (input.display_config !== undefined)
    updateData.display_config = input.display_config;
  if (input.placement_config !== undefined)
    updateData.placement_config = input.placement_config;
  if (input.category !== undefined) updateData.category = input.category;
  if (input.subcategory !== undefined)
    updateData.subcategory = input.subcategory;
  if (input.tags !== undefined) updateData.tags = input.tags;
  if (input.sort_order !== undefined) updateData.sort_order = input.sort_order;
  if (input.required_variables !== undefined)
    updateData.required_variables = input.required_variables;
  if (input.optional_variables !== undefined)
    updateData.optional_variables = input.optional_variables;
  if (input.variable_mappings !== undefined)
    updateData.variable_mappings = input.variable_mappings;
  if (input.is_active !== undefined) updateData.is_active = input.is_active;
  if (input.is_featured !== undefined)
    updateData.is_featured = input.is_featured;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.update_notes !== undefined)
    updateData.update_notes = input.update_notes;
  if (input.metadata !== undefined) updateData.metadata = input.metadata;

  const { data, error } = await supabase
    .schema("graveyard")
    .from("system_prompts")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error updating system prompt:", error);
    throw error;
  }

  return data as SystemPromptDB;
}

/**
 * Publish an update to a system prompt (updates prompt_snapshot)
 */
export async function publishSystemPromptUpdate(
  id: string,
  input: PublishSystemPromptUpdateInput,
) {
  const supabase = createClient();

  const userId = requireUserId();
  const { data, error } = await supabase
    .schema("graveyard")
    .from("system_prompts")
    .update({
      prompt_snapshot: input.prompt_snapshot,
      update_notes: input.update_notes,
      last_updated_by: userId,
      last_updated_at: new Date().toISOString(),
      // version will be auto-incremented by trigger
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error publishing system prompt update:", error);
    throw error;
  }

  return data as SystemPromptDB;
}

/**
 * Delete a system prompt
 */
export async function deleteSystemPrompt(id: string) {
  const supabase = createClient();

  const { error } = await supabase
    .schema("graveyard")
    .from("system_prompts")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting system prompt:", error);
    throw error;
  }

  return true;
}

/**
 * Track a system prompt execution
 */
export async function trackSystemPromptExecution(
  systemPromptId: string,
  triggerType: "context-menu" | "card" | "button" | "api" | "other",
  variablesUsed: Record<string, any> = {},
  success: boolean = true,
  errorMessage?: string,
  executionTimeMs?: number,
) {
  const supabase = createClient();

  const userId = requireUserId();

  const { error } = await supabase
    .schema("graveyard")
    .from("system_prompt_executions")
    .insert({
      system_prompt_id: systemPromptId,
      user_id: userId,
      trigger_type: triggerType,
      variables_used: variablesUsed,
      success,
      error_message: errorMessage || null,
      execution_time_ms: executionTimeMs || null,
      metadata: {},
    });

  if (error) {
    console.error("Error tracking system prompt execution:", error);
    // Don't throw - tracking failures shouldn't break execution
  }
}

/**
 * Get system prompt categories
 */
export async function getSystemPromptCategories() {
  const supabase = createClient();

  const { data, error } = await supabase
    .schema("graveyard")
    .from("system_prompts")
    .select("category")
    .eq("is_active", true);

  if (error) {
    console.error("Error fetching categories:", error);
    return [];
  }

  // Get unique categories
  const categories = [...new Set(data.map((p) => p.category))].sort();
  return categories;
}

/**
 * Get system prompt statistics
 */
export async function getSystemPromptStats(id: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .schema("graveyard")
    .from("system_prompt_executions")
    .select("success, execution_time_ms, created_at")
    .eq("system_prompt_id", id);

  if (error) {
    console.error("Error fetching stats:", error);
    return null;
  }

  const successCount = data.filter((e) => e.success).length;
  const totalCount = data.length;
  const avgTime =
    data.length > 0
      ? data.reduce((sum, e) => sum + (e.execution_time_ms || 0), 0) /
        data.length
      : 0;

  return {
    totalExecutions: totalCount,
    successfulExecutions: successCount,
    failedExecutions: totalCount - successCount,
    successRate: totalCount > 0 ? (successCount / totalCount) * 100 : 0,
    averageExecutionTime: Math.round(avgTime),
  };
}
