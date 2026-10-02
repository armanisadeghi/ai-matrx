"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchModelClassConfig,
  type ModelClassConfig,
} from "@/features/ai-models/redux/modelRegistrySlice";

/**
 * The resolved controls for the CLASS a model runs on.
 *
 * A model served in several classes (Matrx Fast, Matrx Lightning, ...) runs
 * through a different API per class, so its controls differ by class. With a
 * pin, this loads that class's controls; without one it returns `undefined`
 * and callers keep the model's own (preferred-class) controls.
 *
 * Returns `{ pending: true }` while the pinned class loads and
 * `{ failed: true }` when the pin is not an available offering of the model —
 * never another class's controls in either case.
 */
export type ModelClassControls =
  | undefined
  | { pending: true; failed?: false; config?: undefined }
  | { pending?: false; failed: true; config?: undefined }
  | { pending?: false; failed?: false; config: ModelClassConfig };

export function useModelClassControls(
  modelId: string | null | undefined,
  offeringId: string | null | undefined,
): ModelClassControls {
  const dispatch = useAppDispatch();
  const config = useAppSelector((state) =>
    offeringId ? state.modelRegistry?.classConfigByOffering?.[offeringId] : undefined,
  );
  const status = useAppSelector((state) =>
    offeringId
      ? state.modelRegistry?.classConfigStatusByOffering?.[offeringId]
      : undefined,
  );
  useEffect(() => {
    if (modelId && offeringId) {
      void dispatch(fetchModelClassConfig({ modelId, offeringId }));
    }
  }, [dispatch, modelId, offeringId]);

  if (!modelId || !offeringId) return undefined;
  if (config && config.modelId === modelId) return { config };
  if (status === "failed") return { failed: true };
  return { pending: true };
}
