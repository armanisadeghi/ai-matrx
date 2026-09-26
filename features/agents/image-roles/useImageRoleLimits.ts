"use client";

/**
 * The reference-image role limits of the offering a model will actually run
 * on: the lowest-priority-number available offering, exactly as the server's
 * catalog resolver picks it (aidream `catalog/manager.py`, priority-ordered).
 *
 * Read through `ai.offering_capabilities` — the member-readable door that
 * returns only capability metadata (ai.offering rows themselves are
 * visibility 'internal'; pricing and internal fields stay hidden).
 *
 * Returns `null` while loading, when no model is chosen, or when the read
 * fails or returns nothing, so a caller never mistakes "not known" for "this
 * model takes no references".
 */

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { readImageRoleLimits, type ImageRoleLimits } from "@ai-matrx/agents";

const cache = new Map<string, ImageRoleLimits | null>();

/** `null` = the offering is not readable here, so nothing can be judged. */
export async function fetchImageRoleLimits(
  modelId: string,
): Promise<ImageRoleLimits | null> {
  if (cache.has(modelId)) return cache.get(modelId) ?? null;
  const { data, error } = await supabase
    .schema("ai")
    .rpc("offering_capabilities", { p_model_ids: [modelId] });
  if (error) throw error;
  const row = data?.[0];
  if (!row || !row.offering_id) {
    captureError({
      source: "data-shape",
      relation: "ai.offering_capabilities",
      message: `No readable offering for model ${modelId}; reference roles are not judged`,
      details: row
        ? "The model has no available offering."
        : "ai.offering_capabilities returned no row for this model to this user.",
    });
    cache.set(modelId, null);
    return null;
  }
  const limits = readImageRoleLimits(row.reference_roles);
  cache.set(modelId, limits);
  return limits;
}

export function useImageRoleLimits(
  modelId: string | null | undefined,
  enabled: boolean,
): ImageRoleLimits | null {
  const [state, setState] = useState<{
    modelId: string;
    limits: ImageRoleLimits | null;
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
          relation: "ai.offering_capabilities",
          message: `Could not read reference-image role limits for model ${modelId}`,
          details: err instanceof Error ? err.message : String(err),
        });
        // Unknown, never "takes nothing": a failed read must not grey out
        // every role the model actually accepts.
        if (!cancelled) setState({ modelId, limits: null });
      });
    return () => {
      cancelled = true;
    };
  }, [modelId, enabled]);

  if (!modelId || !enabled || state?.modelId !== modelId) return null;
  return state.limits;
}
