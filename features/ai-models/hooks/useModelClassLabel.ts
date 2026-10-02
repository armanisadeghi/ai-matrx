"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchModelClasses,
  selectModelLabelWithClass,
} from "@/features/ai-models/redux/modelRegistrySlice";

/** Loads every model's classes once (no-op after the first success). */
export function useModelClassLabels(): void {
  const dispatch = useAppDispatch();
  const status = useAppSelector((s) => s.modelRegistry?.modelClassStatus);
  useEffect(() => {
    if (!status) void dispatch(fetchModelClasses());
  }, [dispatch, status]);
}

/**
 * THE label for the model an agent or run uses — "Qwen3.8 27B · Matrx
 * Lightning" when the model has several classes, else its name.
 * `offeringId` = the pin (none = the preferred class the server runs).
 */
export function useModelLabelWithClass(
  modelId: string | null | undefined,
  offeringId: string | null | undefined,
): string | undefined {
  useModelClassLabels();
  return useAppSelector((s) => selectModelLabelWithClass(s, modelId, offeringId));
}
