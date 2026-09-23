"use client";

/**
 * The per-second output price of the offering a video model will actually run
 * on — the lowest-priority-number available offering, as the server's catalog
 * resolver picks it (same rule as `useImageRoleLimits`). Null while loading,
 * when no model is chosen, or when the offering is not priced per second: a
 * caller then says the cost arrives with the result, never guesses.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

const cache = new Map<string, number | null>();

export function readVideoSecondPrice(pricing: unknown): number | null {
  if (!Array.isArray(pricing)) return null;
  for (const row of pricing) {
    if (!row || typeof row !== "object") continue;
    const { usage_basis, output_price } = row as {
      usage_basis?: unknown;
      output_price?: unknown;
    };
    if (
      usage_basis === "video_second_output" &&
      typeof output_price === "number" &&
      output_price >= 0
    ) {
      return output_price;
    }
  }
  return null;
}

export function useVideoSecondPrice(modelId: string | null): number | null {
  const [state, setState] = useState<{ modelId: string; price: number | null } | null>(
    null,
  );

  useEffect(() => {
    if (!modelId) return;
    if (cache.has(modelId)) {
      setState({ modelId, price: cache.get(modelId) ?? null });
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .schema("ai")
        .from("offering")
        .select("pricing, priority")
        .eq("model_id", modelId)
        .eq("is_available", true)
        .is("deleted_at", null)
        .order("priority", { ascending: true })
        .limit(1);
      if (error) {
        captureError({
          source: "data-shape",
          relation: "ai.offering.pricing",
          message: `Could not read the video price for model ${modelId}`,
          details: error.message,
        });
      }
      const price = error ? null : readVideoSecondPrice(data?.[0]?.pricing);
      cache.set(modelId, price);
      if (!cancelled) setState({ modelId, price });
    })();
    return () => {
      cancelled = true;
    };
  }, [modelId]);

  return state && state.modelId === modelId ? state.price : null;
}
