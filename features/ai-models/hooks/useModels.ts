"use client";

import { useEffect, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchModelById,
  fetchModelOptions,
  makeSelectModelById,
  selectActiveModels,
  selectActiveModelsReady,
  selectAllModelOptions,
  selectAllModels,
  selectAllModelsReady,
  selectDeprecatedModels,
  selectDeprecatedModelsReady,
  selectModelFetchScope,
  selectModelFetchType,
  selectModelFullyLoaded,
  selectModelOptions,
  selectModelRegistryError,
  selectModelRegistryLoading,
  type AIModel,
  type AIModelRecord,
} from "@/features/ai-models/redux/modelRegistrySlice";

// ---------------------------------------------------------------------------
// Options hooks — lightweight, for dropdowns
// ---------------------------------------------------------------------------

/**
 * Fetches and returns active model options (id + common_name only).
 * This is the default hook for all dropdowns and pickers.
 * Does NOT fetch full model data.
 */
export function useModels() {
  const dispatch = useAppDispatch();
  const models = useAppSelector(selectActiveModels);
  const isLoading = useAppSelector(selectModelRegistryLoading);
  const error = useAppSelector(selectModelRegistryError);
  const isReady = useAppSelector(selectActiveModelsReady);

  useEffect(() => {
    dispatch(fetchModelOptions());
  }, [dispatch]);

  return { models, isLoading, error, isReady };
}

/**
 * Active models as { value, label, maker } for dropdown components.
 * Triggers fetchModelOptions if not yet loaded.
 */
export function useModelOptions() {
  const { isLoading, error, isReady } = useModels();
  const options = useAppSelector(selectModelOptions);
  return { options, isLoading, error, isReady };
}

/**
 * All models (active + deprecated) as dropdown options.
 * For admin tooling that needs the full catalog.
 */
export function useAllModelOptions() {
  const { isLoading, error } = useModels();
  const options = useAppSelector(selectAllModelOptions);
  const isReady = useAppSelector(selectAllModelsReady);
  const fetchScope = useAppSelector(selectModelFetchScope);
  return { options, isLoading, error, isReady, fetchScope };
}

/**
 * Deprecated models list.
 */
export function useDeprecatedModels() {
  const dispatch = useAppDispatch();
  const models = useAppSelector(selectDeprecatedModels);
  const isLoading = useAppSelector(selectModelRegistryLoading);
  const error = useAppSelector(selectModelRegistryError);
  const isReady = useAppSelector(selectDeprecatedModelsReady);

  useEffect(() => {
    dispatch(fetchModelOptions());
  }, [dispatch]);

  return { models, isLoading, error, isReady };
}

/**
 * All models regardless of deprecation.
 */
export function useAllModels() {
  const { isLoading, error } = useModels();
  const models = useAppSelector(selectAllModels);
  const isReady = useAppSelector(selectAllModelsReady);
  const fetchScope = useAppSelector(selectModelFetchScope);
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
  const dispatch = useAppDispatch();
  useModels(); // ensures options fetch is triggered

  const selectModel = useMemo(makeSelectModelById, []);
  const record = useAppSelector((state) =>
    modelId ? selectModel(state, modelId) : undefined,
  );
  const isFull = useAppSelector((state) =>
    modelId ? selectModelFullyLoaded(state, modelId) : false,
  );

  useEffect(() => {
    if (modelId && !isFull) {
      dispatch(fetchModelById(modelId));
    }
  }, [dispatch, modelId, isFull]);

  return isFull ? record : undefined;
}

/**
 * Returns the fetchType of a specific model record: 'options', 'full', or undefined.
 * Useful for conditional rendering — show skeleton until 'full'.
 */
export function useModelFetchType(modelId: string | null | undefined) {
  return useAppSelector((state) =>
    modelId ? selectModelFetchType(state, modelId) : undefined,
  );
}

/**
 * Look up a model record by ID (any fetchType).
 * Returns the record if it exists at any data level, undefined if unknown.
 *
 * Use useModelFull() when you specifically need full data.
 */
export function useModelById(modelId: string): AIModelRecord | undefined {
  useModels();
  const selectModel = useMemo(makeSelectModelById, []);
  return useAppSelector((state) => selectModel(state, modelId));
}

export type { AIModel, AIModelRecord };
