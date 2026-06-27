/**
 * Prompt Builder Service
 *
 * Reusable service for creating prompts from builder components
 * Handles database operations and navigation flow
 */

import { v4 as uuidv4 } from "uuid";
import { createClient } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { toast } from "sonner";
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { graveyardDb } from "@/utils/supabase/graveyardDb";

export interface PromptBuilderConfig {
  name: string;
  description?: string; // Optional - not shown in UI
  systemMessage: string;
  userMessage?: string;
  variableDefaults?: Array<{ name: string; defaultValue: string }>;
  settings?: {
    model_id?: string;
    store?: boolean;
    tools?: any[];
    top_p?: number;
    stream?: boolean;
    temperature?: number;
    max_tokens?: number;
  };
}

export interface PromptBuilderResult {
  success: boolean;
  promptId?: string;
  error?: string;
}

/**
 * Default settings for new prompts
 */
const DEFAULT_SETTINGS = {
  model_id: "c6539f9a-14ff-4449-8a33-644dfe49d2ea",
  store: true,
  stream: true,
  max_tokens: 8192,
};

/**
 * Creates a new prompt and handles the complete flow
 * @param config - The prompt configuration
 * @param router - Next.js router instance for navigation
 * @param onClose - Optional callback to close modal/dialog
 * @returns Promise with result containing success status and promptId
 */
export async function createPromptFromBuilder(
  config: PromptBuilderConfig,
  router: AppRouterInstance,
  onClose?: () => void,
  basePath: string = "/ai/prompts",
): Promise<PromptBuilderResult> {
  try {
    // Validate required fields
    if (!config.name?.trim()) {
      toast.error("Please enter a name for your prompt");
      return { success: false, error: "Name is required" };
    }

    if (!config.systemMessage?.trim()) {
      toast.error("System message cannot be empty");
      return { success: false, error: "System message is required" };
    }

    const supabase = createClient();

    // Get current user
    const userId = requireUserId();
    // Generate prompt ID
    const promptId = uuidv4();

    // Build messages array
    const messages = [
      {
        role: "system",
        content: config.systemMessage.trim(),
      },
      {
        role: "user",
        content: config.userMessage?.trim() || "",
      },
    ];

    // Merge settings with defaults
    const settings = {
      ...DEFAULT_SETTINGS,
      ...config.settings,
    };

    // Create prompt data
    const dbPromptData = {
      id: promptId,
      user_id: userId,
      name: config.name.trim(),
      description: config.description?.trim() || null,
      messages,
      variable_defaults: config.variableDefaults || [],
      settings,
    };

    // Insert into database
    const { error: insertError } = await graveyardDb(supabase)
      .from("prompts")
      .insert([dbPromptData]);

    if (insertError) {
      console.error("Database insert error:", insertError);
      toast.error("Failed to create prompt", {
        description: insertError.message,
      });
      return { success: false, error: insertError.message };
    }

    // Success!
    toast.success("Prompt created successfully!", {
      description: "Opening prompt editor with test runner...",
    });

    // Close modal if callback provided
    if (onClose) {
      onClose();
    }

    // Navigate to edit page with autoRun query param
    router.push(`${basePath}/edit/${promptId}?autoRun=true`);
    router.refresh();

    return { success: true, promptId };
  } catch (error) {
    console.error("Error creating prompt:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    toast.error("Failed to create prompt", {
      description: errorMessage,
    });
    return { success: false, error: errorMessage };
  }
}

/**
 * Hook-like wrapper for using prompt builder service in components
 * Returns a function that can be called with config to create a prompt
 */
export function usePromptBuilder(
  router: AppRouterInstance,
  onClose?: () => void,
  basePath: string = "/ai/prompts",
) {
  return {
    createPrompt: async (config: PromptBuilderConfig) => {
      return createPromptFromBuilder(config, router, onClose, basePath);
    },
  };
}
