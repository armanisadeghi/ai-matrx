/**
 * Prompt System Thunks
 *
 * Centralized, organized system for managing prompts from both 'prompts' and 'prompt_builtins' tables.
 *
 * Architecture:
 * 1. Fetch & Cache Layer - Handles database fetching and cache updates
 * 2. Get Prompt Layer - Cache-first retrieval with automatic fetching
 * 3. Execute Layer - Core execution logic (messages, variables, no fetching/caching)
 *
 * Benefits:
 * - Single source of truth for each operation
 * - Clear separation of concerns
 * - Consistent behavior across all prompt types
 * - Reusable core logic
 * - Application layer never deals with fetching directly
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "../store";
import { supabase } from "@/utils/supabase/client";
import { graveyardDb } from "@/utils/supabase/graveyardDb";
import {
  cachePrompt,
  setFetchStatus,
  selectCachedPrompt,
  selectPromptFetchStatus,
  CachedPrompt,
} from "../slices/promptCacheSlice";
import { submitChatFastAPI as createAndSubmitTask } from "../socket-io/thunks/submitChatFastAPI";
import {
  selectPrimaryResponseTextByTaskId,
  selectPrimaryResponseEndedByTaskId,
} from "../socket-io/selectors/socket-response-selectors";
import { replaceVariablesInText } from "@/features/prompts/utils/variable-resolver";
import type { PromptData } from "@/features/prompts/types/core";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Source table for prompts
 */
export type PromptSource = "prompts" | "prompt_builtins";

/**
 * Payload for fetching a single prompt
 */
export interface FetchPromptPayload {
  promptId: string;
  source: PromptSource;
  forceFetch?: boolean; // Skip cache and force fetch from database
}

/**
 * Result from fetching a prompt
 */
export interface FetchPromptResult {
  promptData: PromptData;
  source: PromptSource;
  fromCache: boolean;
}

/**
 * Payload for getting a prompt (cache-first)
 */
export interface GetPromptPayload {
  promptId: string;
  source: PromptSource;
  allowStale?: boolean; // If true, return stale cache without refetching
}

/**
 * Payload for executing a prompt
 */
export interface ExecutePromptPayload {
  promptId: string;
  source: PromptSource;
  variables?: Record<string, string>;
  contextMessage?: string;
  initialMessage?: string;
  modelOverrides?: Record<string, any>;
}

/**
 * Result from executing a prompt
 */
export interface ExecutePromptResult {
  response: string;
  taskId: string;
  promptId: string;
  source: PromptSource;
  metadata?: {
    tokens?: number;
    timeToFirstToken?: number;
    totalTime?: number;
  };
}

// ============================================================================
// 1. FETCH & CACHE LAYER
// ============================================================================

/**
 * Fetch a prompt from the 'prompts' table and cache it
 *
 * @example
 * ```typescript
 * await dispatch(fetchPrompt({
 *   promptId: 'text-analyzer',
 *   source: 'prompts'
 * })).unwrap();
 * ```
 */
export const fetchPromptFromTable = createAsyncThunk<
  FetchPromptResult,
  FetchPromptPayload,
  { dispatch: AppDispatch; state: RootState }
>(
  "promptSystem/fetchFromTable",
  async ({ promptId, source, forceFetch = false }, { dispatch, getState }) => {
    try {
      const state = getState();
      const cachedPrompt = selectCachedPrompt(state, promptId);
      const fetchStatus = selectPromptFetchStatus(state, promptId);

      // Return cache if available and not forcing fetch
      if (cachedPrompt && !forceFetch) {
        return {
          promptData: {
            id: cachedPrompt.id,
            name: cachedPrompt.name,
            description: cachedPrompt.description,
            messages: cachedPrompt.messages,
            variableDefaults: cachedPrompt.variableDefaults,
            settings: cachedPrompt.settings,
          },
          source: cachedPrompt.source,
          fromCache: true,
        };
      }

      // Prevent duplicate fetches
      if (fetchStatus === "loading" && !forceFetch) {
        throw new Error(`Prompt ${promptId} is already being fetched`);
      }

      // Set loading status
      dispatch(setFetchStatus({ promptId, status: "loading" }));

      // Fetch from appropriate table
      const { data: prompt, error } = await graveyardDb(supabase)
        .from(source)
        .select("*")
        .eq("id", promptId)
        .single();

      if (error || !prompt) {
        dispatch(setFetchStatus({ promptId, status: "error" }));
        throw new Error(
          `Failed to fetch prompt ${promptId} from ${source}: ${error?.message || "Not found"}`,
        );
      }

      // Owner column differs per table: `prompts` uses `user_id`, while
      // `prompt_builtins` uses `created_by_user_id`. Read the right one by
      // source so the cache always holds the actual owner.
      const userId =
        source === "prompts"
          ? (prompt as { user_id: string | null }).user_id
          : (prompt as { created_by_user_id: string | null })
              .created_by_user_id;

      // Build cached prompt object
      const cachedPromptData: CachedPrompt = {
        id: prompt.id,
        name: prompt.name,
        description: prompt.description,
        messages: (Array.isArray(prompt.messages)
          ? prompt.messages
          : []) as CachedPrompt["messages"],
        variableDefaults: (Array.isArray(prompt.variable_defaults)
          ? prompt.variable_defaults
          : []) as CachedPrompt["variableDefaults"],
        settings: (prompt.settings &&
        typeof prompt.settings === "object" &&
        !Array.isArray(prompt.settings)
          ? prompt.settings
          : {}) as CachedPrompt["settings"],
        userId: userId ?? "",
        source,
        fetchedAt: Date.now(),
        status: "cached",
      };

      // Cache the prompt
      dispatch(cachePrompt(cachedPromptData));

      // Return prompt data
      return {
        promptData: {
          id: cachedPromptData.id,
          name: cachedPromptData.name,
          description: cachedPromptData.description,
          messages: cachedPromptData.messages,
          variableDefaults: cachedPromptData.variableDefaults,
          settings: cachedPromptData.settings,
          userId: cachedPromptData.userId,
        },
        source,
        fromCache: false,
      };
    } catch (error) {
      console.error(
        `[fetchPromptFromTable] Error fetching ${promptId} from ${source}:`,
        error,
      );
      throw error;
    }
  },
);

/**
 * Fetch a prompt from 'prompts' table (convenience wrapper)
 *
 * @example
 * ```typescript
 * await dispatch(fetchPrompt({ promptId: 'text-analyzer' })).unwrap();
 * ```
 */
export const fetchPrompt = createAsyncThunk<
  FetchPromptResult,
  Omit<FetchPromptPayload, "source">,
  { dispatch: AppDispatch; state: RootState }
>("promptSystem/fetchPrompt", async (payload, { dispatch }) => {
  return dispatch(
    fetchPromptFromTable({ ...payload, source: "prompts" }),
  ).unwrap();
});

/**
 * Fetch a prompt from 'prompt_builtins' table (convenience wrapper)
 *
 * @example
 * ```typescript
 * await dispatch(fetchBuiltinPrompt({ promptId: 'code-reviewer' })).unwrap();
 * ```
 */
export const fetchBuiltinPrompt = createAsyncThunk<
  FetchPromptResult,
  Omit<FetchPromptPayload, "source">,
  { dispatch: AppDispatch; state: RootState }
>("promptSystem/fetchBuiltinPrompt", async (payload, { dispatch }) => {
  return dispatch(
    fetchPromptFromTable({ ...payload, source: "prompt_builtins" }),
  ).unwrap();
});

// ============================================================================
// 2. GET PROMPT LAYER (Cache-First Retrieval)
// ============================================================================

/**
 * Get a prompt with cache-first logic
 *
 * This is the main interface for the application layer.
 * - Checks cache first
 * - Fetches if not cached
 * - Handles stale prompts (refetches if stale unless allowStale is true)
 * - Application never needs to worry about fetching directly
 *
 * @example
 * ```typescript
 * const result = await dispatch(getPrompt({
 *   promptId: 'text-analyzer',
 *   source: 'prompts'
 * })).unwrap();
 *
 * // Use result.promptData for execution
 * ```
 */
export const getPrompt = createAsyncThunk<
  FetchPromptResult,
  GetPromptPayload,
  { dispatch: AppDispatch; state: RootState }
>(
  "promptSystem/getPrompt",
  async ({ promptId, source, allowStale = false }, { dispatch, getState }) => {
    try {
      const state = getState();
      const cachedPrompt = selectCachedPrompt(state, promptId);

      // If cached and not stale (or stale is allowed), return from cache
      if (cachedPrompt) {
        const isStale = cachedPrompt.status === "stale";

        // Return cache if not stale or if stale is allowed
        if (!isStale || allowStale) {
          console.log(`✅ Using cached prompt data (no fetch):`, promptId);
          return {
            promptData: {
              id: cachedPrompt.id,
              name: cachedPrompt.name,
              description: cachedPrompt.description,
              messages: cachedPrompt.messages,
              variableDefaults: cachedPrompt.variableDefaults,
              settings: cachedPrompt.settings,
            },
            source: cachedPrompt.source,
            fromCache: true,
          };
        }

        // If stale and stale not allowed, refetch
        console.log(`[getPrompt] Prompt ${promptId} is stale, refetching...`);
      }

      // Not cached or stale - fetch from database
      console.log(`🔄 Fetching prompt from database:`, promptId);
      return dispatch(
        fetchPromptFromTable({ promptId, source, forceFetch: true }),
      ).unwrap();
    } catch (error) {
      console.error(`[getPrompt] Error getting prompt ${promptId}:`, error);
      throw error;
    }
  },
);

/**
 * Get a prompt from 'prompts' table (convenience wrapper)
 */
export const getUserPrompt = createAsyncThunk<
  FetchPromptResult,
  Omit<GetPromptPayload, "source">,
  { dispatch: AppDispatch; state: RootState }
>("promptSystem/getUserPrompt", async (payload, { dispatch }) => {
  return dispatch(getPrompt({ ...payload, source: "prompts" })).unwrap();
});

/**
 * Get a prompt from 'prompt_builtins' table (convenience wrapper)
 */
export const getBuiltinPrompt = createAsyncThunk<
  FetchPromptResult,
  Omit<GetPromptPayload, "source">,
  { dispatch: AppDispatch; state: RootState }
>("promptSystem/getBuiltinPrompt", async (payload, { dispatch }) => {
  return dispatch(
    getPrompt({ ...payload, source: "prompt_builtins" }),
  ).unwrap();
});

// ============================================================================
// 3. EXECUTE LAYER (Core Execution Logic)
// ============================================================================

/**
 * Execute a prompt by ID and source
 *
 * This handles the core execution logic:
 * - Fetches prompt if not cached (via getPrompt)
 * - Processes messages with variables
 * - Adds context and initial messages
 * - Submits to chat service
 * - Returns response
 *
 * Does NOT handle:
 * - UI rendering (that's for display layer)
 * - Modal opening (that's for UI layer)
 *
 * @example
 * ```typescript
 * const result = await dispatch(executePromptById({
 *   promptId: 'text-analyzer',
 *   source: 'prompts',
 *   variables: { text: 'Hello world' },
 *   contextMessage: 'User is analyzing marketing copy',
 *   initialMessage: 'Please analyze this text'
 * })).unwrap();
 *
 * console.log(result.response); // AI response
 * ```
 */
export const executePromptById = createAsyncThunk<
  ExecutePromptResult,
  ExecutePromptPayload,
  { dispatch: AppDispatch; state: RootState }
>(
  "promptSystem/executeById",
  async (
    {
      promptId,
      source,
      variables = {},
      contextMessage,
      initialMessage,
      modelOverrides,
    },
    { dispatch, getState },
  ) => {
    const startTime = performance.now();

    try {
      // Step 1: Get prompt data (cache-first)
      const { promptData } = await dispatch(
        getPrompt({ promptId, source, allowStale: false }),
      ).unwrap();

      // Step 2: Replace variables in base messages
      const messagesWithVariables = (promptData.messages || []).map((msg) => ({
        ...msg,
        content: replaceVariablesInText(msg.content, variables),
      }));

      // Step 3: Build final message array with optional context and initial message
      let finalMessages = messagesWithVariables;

      // Add context message before the user's initial message if provided
      if (contextMessage) {
        finalMessages = [
          ...finalMessages,
          { role: "user" as const, content: contextMessage },
        ];
      }

      // Add initial message as the final user message if provided
      if (initialMessage) {
        finalMessages = [
          ...finalMessages,
          { role: "user" as const, content: initialMessage },
        ];
      }

      // Step 4: Build chat config
      const chatConfig: Record<string, any> = {
        model_id: promptData.settings?.model_id,
        messages: finalMessages,
        stream: true,
        ...promptData.settings,
        ...modelOverrides,
      };

      // Safety net: normalizer should have handled this upstream.
      if (chatConfig.output_format !== undefined) {
        const fmt = chatConfig.output_format;
        delete chatConfig.output_format;
        if (typeof fmt === "string" && fmt !== "text" && fmt !== "") {
          chatConfig.response_format = { type: fmt };
        }
      }

      // Step 5: Submit task via Socket.IO
      const result = await dispatch(
        createAndSubmitTask({
          service: "chat_service",
          taskName: "prompt_execution",
          taskData: {
            chat_config: chatConfig,
          },
        }),
      ).unwrap();

      const taskId = result.taskId;
      let timeToFirstToken: number | undefined;
      let firstTokenReceived = false;

      // Step 6: Wait for streaming to complete
      return new Promise<ExecutePromptResult>((resolve, reject) => {
        const checkInterval = setInterval(() => {
          const state = getState() as RootState;
          const streamingText =
            selectPrimaryResponseTextByTaskId(taskId)(state);
          const isEnded = selectPrimaryResponseEndedByTaskId(taskId)(state);

          // Track time to first token
          if (
            !firstTokenReceived &&
            streamingText &&
            streamingText.length > 0
          ) {
            firstTokenReceived = true;
            timeToFirstToken = Math.round(performance.now() - startTime);
          }

          // Check if response ended
          if (isEnded) {
            clearInterval(checkInterval);

            const totalTime = Math.round(performance.now() - startTime);
            const tokenCount = Math.round(streamingText.length / 4); // Rough estimate

            resolve({
              response: streamingText,
              taskId,
              promptId,
              source,
              metadata: {
                tokens: tokenCount,
                timeToFirstToken,
                totalTime,
              },
            });
          }
        }, 100); // Check every 100ms

        // Timeout after 5 minutes
        setTimeout(
          () => {
            clearInterval(checkInterval);
            reject(new Error("Prompt execution timed out after 5 minutes"));
          },
          5 * 60 * 1000,
        );
      });
    } catch (error) {
      console.error(
        `[executePromptById] Error executing ${promptId} from ${source}:`,
        error,
      );
      throw error;
    }
  },
);

/**
 * Execute a user prompt (convenience wrapper)
 *
 * @example
 * ```typescript
 * const result = await dispatch(executeUserPrompt({
 *   promptId: 'text-analyzer',
 *   variables: { text: 'Hello' },
 *   initialMessage: 'Analyze this'
 * })).unwrap();
 * ```
 */
export const executeUserPrompt = createAsyncThunk<
  ExecutePromptResult,
  Omit<ExecutePromptPayload, "source">,
  { dispatch: AppDispatch; state: RootState }
>("promptSystem/executeUserPrompt", async (payload, { dispatch }) => {
  return dispatch(
    executePromptById({ ...payload, source: "prompts" }),
  ).unwrap();
});

/**
 * Execute a builtin prompt (convenience wrapper)
 *
 * @example
 * ```typescript
 * const result = await dispatch(executeBuiltinPrompt({
 *   promptId: 'code-reviewer',
 *   variables: { code: 'function test() {}' }
 * })).unwrap();
 * ```
 */
export const executeBuiltinPrompt = createAsyncThunk<
  ExecutePromptResult,
  Omit<ExecutePromptPayload, "source">,
  { dispatch: AppDispatch; state: RootState }
>("promptSystem/executeBuiltinPrompt", async (payload, { dispatch }) => {
  return dispatch(
    executePromptById({ ...payload, source: "prompt_builtins" }),
  ).unwrap();
});

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Fetch layer
  fetchPromptFromTable,
  fetchPrompt,
  fetchBuiltinPrompt,

  // Get layer (main interface for apps)
  getPrompt,
  getUserPrompt,
  getBuiltinPrompt,

  // Execute layer
  executePromptById,
  executeUserPrompt,
  executeBuiltinPrompt,
};
