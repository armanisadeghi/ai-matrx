/**
 * Prompt Import Service
 *
 * Handles importing prompts from JSON format into the database
 */

import { v4 as uuidv4 } from "uuid";
import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { graveyardDb } from "@/utils/supabase/graveyardDb";
import type {
  PromptImportResult,
  PromptBatchImportResult,
} from "../types/prompt-json";
import { PromptData, PromptsBatchData } from "@/features/prompts/types/core";
import {
  normalizePromptMessagesFromDb,
  normalizePromptSettingsFromDb,
  normalizePromptVariablesFromDb,
} from "../utils/normalize-prompt-db-json";

/**
 * Extract variable names from messages
 * Also normalizes variable syntax by removing spaces
 */
function extractVariablesFromMessages(messages: any[]): string[] {
  const variablePattern = /\{\{\s*([^}]+?)\s*\}\}/g;
  const variables = new Set<string>();

  messages.forEach((msg) => {
    const matches = msg.content.matchAll(variablePattern);
    for (const match of matches) {
      variables.add(match[1].trim());
    }
  });

  return Array.from(variables);
}

/**
 * Normalize variable syntax in message content
 * Converts {{ variable }} to {{variable}}
 */
function normalizeVariableSyntax(content: string): string {
  return content.replace(/\{\{\s*([^}]+?)\s*\}\}/g, "{{$1}}");
}

/**
 * Validate prompt JSON
 */
function validatePromptJSON(prompt: PromptData): {
  valid: boolean;
  error?: string;
} {
  if (!prompt.name || prompt.name.trim() === "") {
    return { valid: false, error: "Prompt name is required" };
  }

  if (!prompt.messages || prompt.messages.length === 0) {
    return { valid: false, error: "At least one message is required" };
  }

  // Validate message structure
  for (const msg of prompt.messages) {
    if (!msg.role || !["system", "user", "assistant"].includes(msg.role)) {
      return { valid: false, error: `Invalid message role: ${msg.role}` };
    }
    if (typeof msg.content !== "string") {
      return { valid: false, error: "Message content must be a string" };
    }
  }

  return { valid: true };
}

/**
 * Import a single prompt from JSON
 */
export async function importPrompt(
  promptData: PromptData,
): Promise<PromptImportResult> {
  try {
    // Validate input
    const validation = validatePromptJSON(promptData);
    if (!validation.valid) {
      return {
        success: false,
        promptId: "",
        promptName: promptData.name || "",
        error: validation.error,
      };
    }

    // Get current user
    const userId = requireUserId();
    // Generate ID if not provided
    const promptId = promptData.id || uuidv4();

    // Normalize variable syntax in all messages (remove spaces from {{ var }})
    const normalizedMessages = (promptData.messages || []).map((msg) => ({
      ...msg,
      content: normalizeVariableSyntax(msg.content),
    }));

    // Extract variables from normalized messages
    const extractedVariables = extractVariablesFromMessages(normalizedMessages);

    // Build variable defaults array, preserving customComponent
    const variableDefaults = extractedVariables.map((varName) => {
      const provided = promptData.variableDefaults?.find(
        (v) => v.name === varName,
      );
      return {
        name: varName,
        defaultValue: provided?.defaultValue || "",
        ...(provided?.customComponent && {
          customComponent: provided.customComponent,
        }),
      };
    });

    // Prepare prompt data for database (use snake_case for DB fields)
    const dbPromptData = {
      id: promptId,
      user_id: userId,
      name: promptData.name,
      description: promptData.description || null,
      messages: normalizedMessages, // Use normalized messages
      variable_defaults: variableDefaults,
      settings: promptData.settings || {},
      tags: promptData.tags ?? null,
      category: promptData.category ?? null,
      model_id: promptData.modelId ?? null,
      output_format: promptData.outputFormat ?? null,
      output_schema: promptData.outputSchema ?? null,
      is_favorite: promptData.isFavorite ?? false,
      is_archived: promptData.isArchived ?? false,
      // created_at and updated_at are automatically set by the database
    };

    // Check if prompt with this ID already exists
    const { data: existing } = await graveyardDb(supabase)
      .from("prompts")
      .select("id")
      .eq("id", promptId)
      .single();

    if (existing) {
      // Update existing prompt
      const { error } = await graveyardDb(supabase)
        .from("prompts")
        .update(dbPromptData)
        .eq("id", promptId);

      if (error) throw error;

      return {
        success: true,
        promptId,
        promptName: promptData.name || "",
        message: "Prompt updated successfully",
      };
    } else {
      // Insert new prompt
      const { error } = await graveyardDb(supabase).from("prompts").insert(dbPromptData);

      if (error) throw error;

      return {
        success: true,
        promptId,
        promptName: promptData.name || "",
        message: "Prompt created successfully",
      };
    }
  } catch (error) {
    console.error("Error importing prompt:", error);
    return {
      success: false,
      promptId: promptData.id || "",
      promptName: promptData.name || "",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Import multiple prompts from batch JSON
 */
export async function importPromptBatch(
  batchJSON: PromptsBatchData,
): Promise<PromptBatchImportResult> {
  const results: PromptImportResult[] = [];

  for (const promptData of batchJSON.prompts) {
    const result = await importPrompt(promptData);
    results.push(result);
  }

  const totalImported = results.filter((r) => r.success).length;
  const totalFailed = results.filter((r) => !r.success).length;

  return {
    success: totalFailed === 0,
    results,
    totalImported,
    totalFailed,
  };
}

/**
 * Export a prompt as JSON
 * Includes all variable data including customComponent configurations
 */
export async function exportPromptAsJSON(
  promptId: string,
): Promise<PromptData | null> {
  try {
    const { data: prompt, error } = await graveyardDb(supabase)
      .from("prompts")
      .select("*")
      .eq("id", promptId)
      .single();

    if (error || !prompt) {
      console.error("Error fetching prompt:", error);
      return null;
    }

    // Export all variable data including customComponent configurations
    // Convert from database snake_case to camelCase for the JSON format
    return {
      id: prompt.id,
      name: prompt.name,
      description: prompt.description,
      messages: normalizePromptMessagesFromDb(prompt.messages),
      variableDefaults: normalizePromptVariablesFromDb(
        prompt.variable_defaults,
      ),
      settings: normalizePromptSettingsFromDb(prompt.settings),
      tags: prompt.tags ?? undefined,
      category: prompt.category ?? undefined,
      modelId: prompt.model_id ?? undefined,
      outputFormat: prompt.output_format ?? undefined,
      outputSchema: prompt.output_schema ?? undefined,
      isFavorite: prompt.is_favorite ?? false,
      isArchived: prompt.is_archived ?? false,
    };
  } catch (error) {
    console.error("Error exporting prompt:", error);
    return null;
  }
}
