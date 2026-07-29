/**
 * `apply_surface_write` — kind capability #2: a rendered kind component writes
 * an agent-produced value INTO the page it is sitting on.
 *
 * This is the bridge between the two registries: the component (which knows
 * its kind's data and renders the action buttons) calls
 * `runAction("apply_surface_write", { target, value })`; the host routes it
 * through the surface-writeback seam
 * (`features/surfaces/runtime/surface-writeback.ts`), which validates the
 * target against the mounted surface's DECLARED `writeTargets` and invokes
 * the handler the page registered on its `SurfaceRuntimeProvider`.
 *
 * The component never touches supabase, redux, or the page's internals — it
 * names a declared target, the surface decides how (and whether) the value
 * lands. Draft-mode targets stage into the page's editor for the user to
 * review and save; entity-mode targets persist through the page's canonical
 * service; ui-mode targets move ephemeral state (selection, focus).
 *
 * Input contract (malformed input is a safe `{ ok:false }`, never a throw):
 *   { target: string; value: unknown; surfaceName?: string }
 */

import { applySurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";
import type { KindActionResult } from "../kind-action-registry";
import { registerKindAction } from "../kind-action-registry";

async function applySurfaceWriteHandler(
  input: unknown,
): Promise<KindActionResult> {
  if (!input || typeof input !== "object") {
    return {
      ok: false,
      error: "apply_surface_write expects an object { target, value }",
    };
  }
  const obj = input as Record<string, unknown>;
  const target = obj.target;
  if (typeof target !== "string" || !target.trim()) {
    return {
      ok: false,
      error: "apply_surface_write: target is required and must be a string",
    };
  }
  if (!("value" in obj)) {
    return {
      ok: false,
      error: "apply_surface_write: value is required (may be null)",
    };
  }
  const surfaceName =
    typeof obj.surfaceName === "string" && obj.surfaceName.trim()
      ? obj.surfaceName
      : undefined;

  // applySurfaceWrite owns loudness (toast + captureError) and never throws.
  const result = await applySurfaceWrite(target, obj.value, { surfaceName });
  return result.ok
    ? { ok: true, result: { surfaceName: result.surfaceName } }
    : { ok: false, error: result.error };
}

registerKindAction({
  key: "apply_surface_write",
  description:
    "Write a value into the current page via a surface-manifest write target (draft/entity/ui per the target's declared mode).",
  handler: applySurfaceWriteHandler,
});
