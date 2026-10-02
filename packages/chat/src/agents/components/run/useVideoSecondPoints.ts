"use client";

/**
 * The per-second POINTS price of the offering a video model will actually run
 * on — the lowest-priority-number available offering, as the server's catalog
 * resolver picks it. Read from `ai.model_offering`, the member-readable
 * catalog view whose `points_per_million_output` is `ceil(output_price ×
 * 20,000)` — for a `video_second_output` offering that is points per second.
 * No dollar price leaves the admin-only `ai.offering` table for this, so every
 * member gets an estimate (Arman, 2026-09-27: everyone sees points).
 *
 * Null while loading, when no model is chosen, or when the offering is not
 * priced per second: a caller then says the cost arrives with the result,
 * never guesses.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

const cache = new Map<string, number | null>();

export function readVideoSecondPoints(
  row: { usage_basis?: unknown; points_per_million_output?: unknown } | null | undefined,
): number | null {
  if (!row || row.usage_basis !== "video_second_output") return null;
  const points = row.points_per_million_output;
  return typeof points === "number" && Number.isFinite(points) && points >= 0
    ? points
    : null;
}

export function useVideoSecondPoints(modelId: string | null): number | null {
  const [state, setState] = useState<{ modelId: string; points: number | null } | null>(
    null,
  );

  useEffect(() => {
    if (!modelId) return;
    if (cache.has(modelId)) {
      setState({ modelId, points: cache.get(modelId) ?? null });
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .schema("ai")
        .from("model_offering")
        .select("usage_basis, points_per_million_output, priority")
        .eq("model_id", modelId)
        .order("priority", { ascending: true })
        .limit(1);
      if (error) {
        captureError({
          source: "data-shape",
          relation: "ai.model_offering.points_per_million_output",
          message: `Could not read the video points price for model ${modelId}`,
          details: error.message,
        });
      }
      const points = error ? null : readVideoSecondPoints(data?.[0]);
      cache.set(modelId, points);
      if (!cancelled) setState({ modelId, points });
    })();
    return () => {
      cancelled = true;
    };
  }, [modelId]);

  return state && state.modelId === modelId ? state.points : null;
}
