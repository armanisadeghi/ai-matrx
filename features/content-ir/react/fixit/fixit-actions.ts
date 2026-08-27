"use client";

/**
 * The fix-it bar's ACTIONS — each one is the whole repair in a single call,
 * because the bar's promise is "click once, watch it render" (Arman,
 * 2026-08-27: "upon click, it will instantly switch the generic renderer to
 * the custom renderer").
 *
 * Kept beside the bar rather than in shape-authoring-service: these compose
 * the service's stable primitives into render-context repairs, kept separate
 * from that file's own churn (most recently the 2026-08-27 manual
 * `data_only`-flag eradication).
 */

import { createClient } from "@/utils/supabase/client";
import {
  createOwnedShapeExample,
  makeOwnedShapeExampleCanonical,
  setShapeActivation,
} from "../../studio/shape-authoring-service";
import { refreshKindComponents } from "../../registry/component-registry";
import { invalidateKindRenderGap } from "./diagnose-kind-render-gap";
import type { KindRenderGapDiagnosis } from "./diagnose-kind-render-gap";

/**
 * Flip a component row's kill switch back on, then refresh the resolver so
 * every mounted block of this kind repaints into the real component without
 * a reload (replaceDbRows bumps the per-kind repaint counters).
 */
export async function reactivateComponent(
  diagnosis: KindRenderGapDiagnosis,
): Promise<void> {
  if (!diagnosis.inactiveComponentId) {
    throw new Error("No disabled component to re-activate.");
  }
  const supabase = createClient();
  const { error } = await supabase
    .schema("content_ir")
    .from("kind_component")
    .update({ is_active: true })
    .eq("id", diagnosis.inactiveComponentId);
  if (error) throw new Error(error.message);
  invalidateKindRenderGap(diagnosis.kind);
  await refreshKindComponents(0);
}

/**
 * Activate the kind — and when the quality gate refuses because no canonical
 * example exists, use THE VALUE ON SCREEN as the example and try once more.
 * The instance in front of the user is exactly the proof the gate asks for;
 * if it genuinely fails the schema, the gate's own sentence (which field
 * disagreed) surfaces verbatim — a real finding, not an obstacle.
 */
export async function activateKindUsingInstance(
  diagnosis: KindRenderGapDiagnosis,
  instanceValue: unknown,
): Promise<void> {
  if (!diagnosis.kindDefinitionId) {
    throw new Error("This kind is not registered.");
  }
  const supabase = createClient();
  try {
    await setShapeActivation(supabase, diagnosis.kindDefinitionId, true);
  } catch (firstError) {
    const canSeedExample =
      !diagnosis.hasCanonicalExample &&
      instanceValue !== null &&
      typeof instanceValue === "object";
    if (!canSeedExample) throw firstError;
    const created = await createOwnedShapeExample(supabase, {
      definitionId: diagnosis.kindDefinitionId,
      data: instanceValue,
      label: "Captured from a live result",
      description:
        "Saved by the fix-it bar from the exact instance on screen (2026-08-27 flow).",
    });
    await makeOwnedShapeExampleCanonical(
      supabase,
      diagnosis.kindDefinitionId,
      created.id,
    );
    await setShapeActivation(supabase, diagnosis.kindDefinitionId, true);
  }
  invalidateKindRenderGap(diagnosis.kind);
}
