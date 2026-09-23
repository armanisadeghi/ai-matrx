"use client";

/**
 * The reference-image role limits of the offering a model will actually run
 * on: the lowest-priority-number available offering, exactly as the server's
 * catalog resolver picks it (aidream `catalog/manager.py`, priority-ordered).
 *
 * Returns `null` while loading or when no model is chosen, so a caller never
 * mistakes "not loaded yet" for "this model takes no references".
 */

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { readImageRoleLimits, type ImageRoleLimits } from "./roles";

const cache = new Map<string, ImageRoleLimits>();

export async function fetchImageRoleLimits(
  modelId: string,
): Promise<ImageRoleLimits> {
  const cached = cache.get(modelId);
  if (cached) return cached;
  const { data, error } = await supabase
    .schema("ai")
    .from("offering")
    .select("capabilities_override, priority")
    .eq("model_id", modelId)
    .eq("is_available", true)
    .is("deleted_at", null)
    .order("priority", { ascending: true })
    .limit(1);
  if (error) throw error;
  const limits = readImageRoleLimits(data?.[0]?.capabilities_override);
  cache.set(modelId, limits);
  return limits;
}

export function useImageRoleLimits(
  modelId: string | null | undefined,
  enabled: boolean,
): ImageRoleLimits | null {
  const [state, setState] = useState<{
    modelId: string;
    limits: ImageRoleLimits;
  } | null>(null);

  useEffect(() => {
    if (!modelId || !enabled) return;
    let cancelled = false;
    fetchImageRoleLimits(modelId)
      .then((limits) => {
        if (!cancelled) setState({ modelId, limits });
      })
      .catch((err: unknown) => {
        captureError({
          source: "data-shape",
          relation: "ai.offering.capabilities_override",
          message: `Could not read reference-image role limits for model ${modelId}`,
          details: err instanceof Error ? err.message : String(err),
        });
        if (!cancelled) setState({ modelId, limits: {} });
      });
    return () => {
      cancelled = true;
    };
  }, [modelId, enabled]);

  if (!modelId || !enabled || state?.modelId !== modelId) return null;
  return state.limits;
}
