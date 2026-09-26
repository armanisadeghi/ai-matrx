"use client";

/**
 * The reference-image role limits of the offering a model will actually run
 * on: the lowest-priority-number available offering, exactly as the server's
 * catalog resolver picks it (aidream `catalog/manager.py`, priority-ordered).
 *
 * Returns `null` while loading, when no model is chosen, or when the offering
 * cannot be read, so a caller never mistakes "not known" for "this model takes
 * no references". (ai.offering rows are visibility 'internal'; a signed-in
 * member who is not a platform admin reads none. Treating that empty read as
 * "declares no roles" greyed out every role — "Veo 3.1 cannot take a First
 * frame image" — on a model that takes one.)
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
    .from("offering")
    .select("capabilities_override, priority")
    .eq("model_id", modelId)
    .eq("is_available", true)
    .is("deleted_at", null)
    .order("priority", { ascending: true })
    .limit(1);
  if (error) throw error;
  if (!data || data.length === 0) {
    captureError({
      source: "data-shape",
      relation: "ai.offering.capabilities_override",
      message: `No readable offering for model ${modelId}; reference roles are not judged`,
      details: "ai.offering returned no row to this user (RLS: visibility 'internal').",
    });
    cache.set(modelId, null);
    return null;
  }
  const limits = readImageRoleLimits(data[0]?.capabilities_override);
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
          relation: "ai.offering.capabilities_override",
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
