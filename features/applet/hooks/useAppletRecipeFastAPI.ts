"use client";

/**
 * useAppletRecipeFastAPI
 *
 * Drop-in replacement for useAppletRecipe that routes execution through the
 * FastAPI agent endpoint instead of Socket.IO.
 *
 * Activated by ?fx=1 on the applet URL. The existing Socket.IO path is
 * completely unaffected.
 *
 * Key differences from useAppletRecipe:
 * - Calls POST /api/ai/agents/{agentId} (not socket "run_recipe_to_chat")
 * - Converts recipe → agentId once via /api/recipes/{id}/convert-to-prompt
 *   then reads the cached promptId from data_source_config.config.promptId
 * - Maps broker values by name into variables: Record<string, unknown>
 * - Returns the same interface shape as useAppletRecipe — AppletRunComponent
 *   needs no other changes
 *
 * Future work (tracked in plan):
 * - user_input: allow a primary broker to supply the user_input field
 * - conversationId: expose resolvedConversationId for follow-up turns
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import type { NeededBroker } from "@/types/customAppTypes";
import { brokerSelectors } from "@/lib/redux/brokerSlice";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAppletRuntimeDataSourceConfig } from "@/lib/redux/app-runner/slices/customAppletRuntimeSlice";
import { useAppDispatch } from "@/lib/redux/hooks";

interface UseAppletRecipeFastAPIProps {
  appletId: string;
  /**
   * When false, all execution side effects are short-circuited — notably the
   * recipe→agent conversion fetch (POST /api/recipes/{id}/convert-to-prompt),
   * whose route was removed with the prompts system. Used while applet
   * execution is temporarily under construction. Defaults to true so the hook's
   * normal behavior is restored simply by passing `enabled` truthy (or omitting
   * it). See AppletRunComponent.
   */
  enabled?: boolean;
}

export function useAppletRecipeFastAPI({
  appletId,
  enabled = true,
}: UseAppletRecipeFastAPIProps) {
  const dispatch = useAppDispatch();
  const sourceConfig = useAppSelector((state) =>
    selectAppletRuntimeDataSourceConfig(state, appletId),
  );

  const [taskId] = useState<string>(() => uuidv4());
  const [neededBrokerIds, setNeededBrokerIds] = useState<string[]>([]);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep a ref to neededBrokers so submitRecipe can access names without being
  // a dependency (prevents stale closure without extra re-renders)
  const neededBrokersRef = useRef<NeededBroker[]>([]);

  // Subscribe to broker values from Redux
  const rawBrokerValues = useAppSelector((state) =>
    brokerSelectors.selectMultipleValues(state, neededBrokerIds),
  );

  // Read conversationId from taskData — dispatched by the thunk immediately from the response header.
  const taskData = undefined;
  const conversationId = taskData?.conversationId as string | undefined;

  // Expose broker values in the same shape as useAppletRecipe for compatibility
  const brokerValues = Object.entries(rawBrokerValues ?? {}).reduce<
    Record<string, unknown>
  >((acc, [id, value]) => {
    acc[id] = value;
    return acc;
  }, {});

  const notReadyBrokers = neededBrokersRef.current.filter(
    (b) => b.required && !rawBrokerValues?.[b.id],
  );

  // ── Initialization: resolve agentId (from cache or fresh conversion) ──────
  useEffect(() => {
    // Applet execution under construction (prompts-system removal): skip the
    // recipe→agent conversion fetch so the deleted route is never called.
    if (!enabled) return;
    if (
      !sourceConfig ||
      sourceConfig.sourceType !== "recipe" ||
      !sourceConfig.config
    )
      return;

    const config = sourceConfig.config as {
      id: string;
      compiledId: string;
      version: number;
      neededBrokers: NeededBroker[];
      promptId?: string;
    };

    const ids = config.neededBrokers.map((b) => b.id);
    setNeededBrokerIds(ids);
    neededBrokersRef.current = config.neededBrokers;

    if (config.promptId) {
      setAgentId(config.promptId);
      return;
    }

    // No cached promptId — this applet hasn't been converted yet. Trigger conversion.
    console.warn(
      `[useAppletRecipeFastAPI] No agentId cached for applet "${appletId}" (recipe "${config.id}"). Converting now — this should only happen once.`,
    );
    setIsLoading(true);

    fetch(`/api/recipes/${config.id}/convert-to-prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        compiledRecipeId: config.compiledId || null,
        appletId,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            body.error || `Conversion failed: HTTP ${res.status}`,
          );
        }
        return res.json() as Promise<{ success: boolean; promptId: string }>;
      })
      .then(({ promptId }) => {
        setAgentId(promptId);
      })
      .catch((err) => {
        console.error(
          "[useAppletRecipeFastAPI] Recipe conversion failed:",
          err,
        );
        setError(
          err instanceof Error ? err.message : "Failed to prepare applet",
        );
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [sourceConfig, appletId, enabled]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const submitRecipe = useCallback(() => {
    if (!enabled) return;
    if (!agentId) {
      setError("Agent not ready — recipe conversion may still be in progress");
      return;
    }

    // Map broker values by name → variables Record<string, unknown>
    // Broker name is the template variable name the agent expects.
    // Empty strings are fine — the agent API does not validate presence.
    const variables: Record<string, unknown> = {};
    for (const broker of neededBrokersRef.current) {
      variables[broker.name] = rawBrokerValues?.[broker.id] ?? "";
    }

    setIsLoading(true);

    dispatch(
      submitAppletAgentThunk({
        agentId,
        variables,
        userInput: "",
        taskId,
      }),
    )
      .unwrap()
      .then(() => {
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("[useAppletRecipeFastAPI] Agent execution failed:", err);
        setError("Failed to process the request.");
        setIsLoading(false);
      });
  }, [agentId, dispatch, rawBrokerValues, taskId, enabled]);

  return {
    taskId,
    isLoading,
    error,
    isTaskValid: !!agentId,
    validationErrors: {} as Record<string, string>,
    submitRecipe,
    notReadyBrokers,
    brokerValues,
    /** Populated after the first submission completes. Used for follow-up turns. */
    conversationId,
    /**
     * True when this applet has a cached promptId (agent conversion done).
     * AppletRunComponent uses this to auto-enable the FastAPI path without requiring ?fx=1.
     */
    hasAgent: !!agentId,
  };
}

export default useAppletRecipeFastAPI;
