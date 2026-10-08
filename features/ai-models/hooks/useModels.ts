"use client";

import { useEffect } from "react";
import { selectActiveModels, selectActiveModelsReady, selectAllModelOptions, selectAllModels, selectAllModelsReady, selectDeprecatedModels, selectDeprecatedModelsReady, selectModelById, selectModelFetchType, selectModelFullyLoaded, selectModelOptions } from "@ai-matrx/agents/models";
import { type AIModel, type AIModelRecord } from "@ai-matrx/chat/agents/redux/model-registry";
import { getModelRecords, useModelRecords } from "@ai-matrx/chat/agents/identity/model-catalog";

// ---------------------------------------------------------------------------
// Options hooks — lightweight, for dropdowns
// ---------------------------------------------------------------------------

/**
 * Fetches and returns active model options (id + common_name only).
 * This is the default hook for all dropdowns and pickers.
 * Does NOT fetch full model data.
 */
export function useModels() {
  const models = useModelRecords(selectActiveModels);
  const isLoading = useModelRecords((s) => s.isLoading);
  const error = useModelRecords((s) => s.error);
  const isReady = useModelRecords(selectActiveModelsReady);

  useEffect(() => {
    void getModelRecords().loadOptions();
  }, []);

  return { models, isLoading, error, isReady };
}

/**
 * Active models as { value, label, maker } for dropdown components.
 * Triggers fetchModelOptions if not yet loaded.
 */
export function useModelOptions() {
  const { isLoading, error, isReady } = useModels();
  const options = useModelRecords(selectModelOptions);
  return { options, isLoading, error, isReady };
}

/**
 * All models (active + deprecated) as dropdown options.
 * For admin tooling that needs the full catalog.
 */
export function useAllModelOptions() {
  const { isLoading, error } = useModels();
  const options = useModelRecords(selectAllModelOptions);
  const isReady = useModelRecords(selectAllModelsReady);
  const fetchScope = useModelRecords((s) => s.fetchScope);
  return { options, isLoading, error, isReady, fetchScope };
}

/**
 * Deprecated models list.
 */
export function useDeprecatedModels() {
  const models = useModelRecords(selectDeprecatedModels);
  const isLoading = useModelRecords((s) => s.isLoading);
  const error = useModelRecords((s) => s.error);
  const isReady = useModelRecords(selectDeprecatedModelsReady);

  useEffect(() => {
    void getModelRecords().loadOptions();
  }, []);

  return { models, isLoading, error, isReady };
}

/**
 * All models regardless of deprecation.
 */
export function useAllModels() {
  const { isLoading, error } = useModels();
  const models = useModelRecords(selectAllModels);
  const isReady = useModelRecords(selectAllModelsReady);
  const fetchScope = useModelRecords((s) => s.fetchScope);
  return { models, isLoading, error, isReady, fetchScope };
}

// ---------------------------------------------------------------------------
// Full-record hooks — for components that need controls, context_window, etc.
// ---------------------------------------------------------------------------

/**
 * Fetches and returns the full record for a single model.
 *
 * - Automatically triggers fetchModelById when the record is not yet full.
 * - Also ensures options are loaded (for the dropdown) via useModels().
 * - Returns undefined until the full record is available.
 * - Each call gets its own memoized selector to avoid cache thrashing.
 *
 * Handle undefined at the render boundary — do not default to null/empty object.
 */
export function useModelFull(
  modelId: string | null | undefined,
): AIModelRecord | undefined {
  useModels(); // ensures options fetch is triggered

  const record = useModelRecords((s) => selectModelById(s, modelId));
  const isFull = useModelRecords((s) => selectModelFullyLoaded(s, modelId));

  useEffect(() => {
    if (modelId && !isFull) {
      void getModelRecords().loadModel(modelId);
    }
  }, [modelId, isFull]);

  return isFull ? record : undefined;
}

/**
 * Returns the fetchType of a specific model record: 'options', 'full', or undefined.
 * Useful for conditional rendering — show skeleton until 'full'.
 */
export function useModelFetchType(modelId: string | null | undefined) {
  return useModelRecords((s) => (modelId ? selectModelFetchType(s, modelId) : undefined));
}

/**
 * Look up a model record by ID (any fetchType).
 * Returns the record if it exists at any data level, undefined if unknown.
 *
 * Use useModelFull() when you specifically need full data.
 */
export function useModelById(modelId: string): AIModelRecord | undefined {
  useModels();
  return useModelRecords((s) => selectModelById(s, modelId));
}

export type { AIModel, AIModelRecord };
