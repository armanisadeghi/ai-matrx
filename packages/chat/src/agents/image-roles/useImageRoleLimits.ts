"use client";

/**
 * The reference-image role limits of the offering a model will actually run
 * on: the pinned CLASS (offering) when the agent or run pins one, otherwise the
 * lowest-priority-number available offering, exactly as the server's catalog
 * resolver picks it (aidream `catalog/manager.py`, priority-ordered).
 *
 * Read through `ai.offering_capabilities` — the member-readable door that
 * returns only capability metadata (ai.offering rows themselves are
 * organization-level rows; pricing and internal fields stay hidden).
 *
 * Returns `null` while loading, when no model is chosen, or when the read
 * fails or returns nothing, so a caller never mistakes "not known" for "this
 * model takes no references".
 */

import { useEffect, useState } from "react";
import { supabase } from "../../host/db";
import { captureError } from "../../host/diagnostics";
import { readImageRoleLimits, type ImageRoleLimits } from "@ai-matrx/agents";
import {
  isMissingFunctionError,
  warnClassAwareSqlPending,
} from "./class-aware-rpc";

const cache = new Map<string, ImageRoleLimits | null>();

type CapabilityRow = {
  offering_id: string | null;
  reference_roles: unknown;
};

async function readCapabilityRow(
  modelId: string,
  offeringId: string | null | undefined,
): Promise<CapabilityRow | undefined> {
  if (offeringId) {
    const { data, error } = await supabase
      .schema("ai")
      .rpc("offering_capabilities", {
        p_model_ids: [modelId],
        p_offering_ids: [offeringId],
      });
    if (!error) return data?.[0];
    // A foreign pin (P0002) and every other failure throw: unknown, never
    // the preferred class's limits.
    if (!isMissingFunctionError(error)) throw error;
    warnClassAwareSqlPending("ai.offering_capabilities");
  }
  const { data, error } = await supabase
    .schema("ai")
    .rpc("offering_capabilities", { p_model_ids: [modelId] });
  if (error) throw error;
  return data?.[0];
}

/** `null` = the offering is not readable here, so nothing can be judged. */
export async function fetchImageRoleLimits(
  modelId: string,
  offeringId?: string | null,
): Promise<ImageRoleLimits | null> {
  const key = `${modelId}::${offeringId ?? ""}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const row = await readCapabilityRow(modelId, offeringId);
  if (!row || !row.offering_id) {
    captureError({
      source: "data-shape",
      relation: "ai.offering_capabilities",
      message: `No readable offering for model ${modelId}; reference roles are not judged`,
      details: row
        ? "The model has no available offering."
        : "ai.offering_capabilities returned no row for this model to this user.",
    });
    cache.set(key, null);
    return null;
  }
  const limits = readImageRoleLimits(row.reference_roles);
  cache.set(key, limits);
  return limits;
}

export function useImageRoleLimits(
  modelId: string | null | undefined,
  enabled: boolean,
  offeringId?: string | null,
): ImageRoleLimits | null {
  const [state, setState] = useState<{
    key: string;
    limits: ImageRoleLimits | null;
  } | null>(null);
  const key = modelId ? `${modelId}::${offeringId ?? ""}` : null;

  useEffect(() => {
    if (!modelId || !key || !enabled) return;
    let cancelled = false;
    fetchImageRoleLimits(modelId, offeringId)
      .then((limits) => {
        if (!cancelled) setState({ key, limits });
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
        if (!cancelled) setState({ key, limits: null });
      });
    return () => {
      cancelled = true;
    };
  }, [key, modelId, offeringId, enabled]);

  if (!modelId || !enabled || state?.key !== key) return null;
  return state.limits;
}
