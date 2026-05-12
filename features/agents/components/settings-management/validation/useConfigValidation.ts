"use client";

/**
 * Hook: useConfigValidation
 *
 * Bridges the validation engine into React components.
 * Takes the same inputs AgentSettingsCore already has access to
 * and returns a stable ValidationResult + highlight map.
 */

import { useMemo } from "react";
import type { NormalizedControls } from "@/lib/redux/slices/agent-settings/types";
import type { FeLlmParams } from "@/features/agents/types/agent-api-types";
import type { ModelConstraint } from "@/features/ai-models/types";
import type { ValidationResult } from "./types";
import { resolveConfig } from "./resolve-config";
import { validateConfig, buildHighlightMap } from "./engine";

interface UseConfigValidationParams {
  settings: FeLlmParams | null;
  modelId: string | null;
  normalizedControls: NormalizedControls | null;
  constraints?: ModelConstraint[] | null;
}

interface UseConfigValidationResult {
  validation: ValidationResult;
  highlightMap: Record<string, "error" | "warning" | "info">;
  recognizedKeys: Set<string>;
}

export function useConfigValidation({
  settings,
  modelId,
  normalizedControls,
  constraints,
}: UseConfigValidationParams): UseConfigValidationResult {
  const resolved = useMemo(
    () => resolveConfig(settings, modelId, normalizedControls, constraints),
    [settings, modelId, normalizedControls, constraints],
  );

  const validation = useMemo(() => validateConfig(resolved), [resolved]);

  const highlightMap = useMemo(
    () => buildHighlightMap(validation),
    [validation],
  );

  return {
    validation,
    highlightMap,
    recognizedKeys: resolved.recognizedKeys,
  };
}
