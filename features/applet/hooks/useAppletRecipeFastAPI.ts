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
import type { NeededBroker, RecipeSourceConfig } from "@/types/customAppTypes";
import { brokerSelectors } from "@/lib/redux/brokerSlice/selectors";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAppletRuntimeDataSourceConfig } from "@/lib/redux/app-runner/slices/customAppletRuntimeSlice";

interface UseAppletRecipeFastAPIProps {
  appletId: string | null;
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

const EMPTY_VALIDATION_ERRORS: Record<string, string> = {};

function isNeededBroker(value: unknown): value is NeededBroker {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    "required" in value &&
    typeof value.required === "boolean" &&
    "dataType" in value &&
    typeof value.dataType === "string" &&
    "defaultValue" in value &&
    typeof value.defaultValue === "string"
  );
}

function isRecipeSourceConfig(value: unknown): value is RecipeSourceConfig {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "compiledId" in value &&
    typeof value.compiledId === "string" &&
    "version" in value &&
    typeof value.version === "number" &&
    "neededBrokers" in value &&
    Array.isArray(value.neededBrokers) &&
    value.neededBrokers.every(isNeededBroker) &&
    (!("promptId" in value) ||
      value.promptId === undefined ||
      typeof value.promptId === "string")
  );
}

function isConversionResponse(
  value: unknown,
): value is { success: boolean; promptId: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "success" in value &&
    typeof value.success === "boolean" &&
    "promptId" in value &&
    typeof value.promptId === "string"
  );
}

export function useAppletRecipeFastAPI({
  appletId,
  enabled = true,
}: UseAppletRecipeFastAPIProps) {
  const sourceConfig = useAppSelector((state) =>
    appletId ? selectAppletRuntimeDataSourceConfig(state, appletId) : undefined,
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

  const conversationId: string | undefined = undefined;

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

    if (!isRecipeSourceConfig(sourceConfig.config)) {
      console.error(
        "[useAppletRecipeFastAPI] Recipe source config has an invalid runtime shape.",
      );
      setError("Applet recipe configuration is invalid.");
      return;
    }
    const config = sourceConfig.config;

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
        const body: unknown = await res.json();
        if (!isConversionResponse(body)) {
          throw new Error("Conversion returned an invalid response shape");
        }
        return body;
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

    setError(
      "Applet agent execution is unavailable while the legacy recipe runner is being rebuilt.",
    );
  }, [agentId, enabled]);

  return {
    taskId,
    isLoading,
    error,
    isTaskValid: !!agentId,
    validationErrors: EMPTY_VALIDATION_ERRORS,
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
