"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { effectiveOfferingPinOf } from "@/lib/redux/slices/agent-settings/internal-utils";
import {
  classConfigKey,
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
  const key = modelId && offeringId ? classConfigKey(modelId, offeringId) : null;
  const config = useAppSelector((state) =>
    key ? state.modelRegistry?.classConfigByOffering?.[key] : undefined,
  );
  const status = useAppSelector((state) =>
    key ? state.modelRegistry?.classConfigStatusByOffering?.[key] : undefined,
  );
  useEffect(() => {
    if (modelId && offeringId) {
      void dispatch(fetchModelClassConfig({ modelId, offeringId }));
    }
  }, [dispatch, modelId, offeringId]);

  if (!modelId || !offeringId) return undefined;
  if (config) return { config };
  if (status === "failed") return { failed: true };
  return { pending: true };
}

/**
 * Loads the pinned class's controls for an agent-settings entry so
 * `selectNormalizedControls` reads that class, not the preferred one.
 */
export function useAgentSettingsClassControls(agentId: string): void {
  const modelId = useAppSelector((state) => {
    const entry = state.agentSettings?.entries[agentId];
    const id = entry?.overrides?.model ?? entry?.defaults?.model;
    return typeof id === "string" ? id : null;
  });
  const offeringId = useAppSelector((state) => {
    return effectiveOfferingPinOf(state.agentSettings?.entries[agentId]) ?? null;
  });
  useModelClassControls(modelId, offeringId);
}
