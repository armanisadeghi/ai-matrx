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
 * ## Origin — who is driving the write
 *
 * A rendered kind component covers BOTH cases, so the caller must say which:
 *
 *   `origin: "user"` (default) — the viewer clicked a control the component
 *     rendered. The click IS the consent; the target's `applyPolicy` is not
 *     consulted.
 *   `origin: "agent"` — the component is applying model output on its own
 *     (on mount, on arrival, from a streamed instruction). This is gated by
 *     `applyPolicy`: refused when `manual` (the default), asked in place when
 *     `ask`, applied when `auto`.
 *
 * Getting this wrong in the safe direction matters more than convenience:
 * an agent-authored component could otherwise write on mount with no gate at
 * all, which is precisely what `applyPolicy` exists to prevent. So `"agent"`
 * is what an UNRECOGNIZED origin resolves to — a component that does not say
 * is treated as not having a human behind it.
 *
 * Input contract (malformed input is a safe `{ ok:false }`, never a throw):
 *   { target: string; value: unknown; surfaceName?: string;
 *     origin?: "user" | "agent"; actorLabel?: string }
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
  // Fail SAFE: only the literal "user" counts as a human gesture. Anything
  // else — omitted, misspelled, non-string — is treated as agent-originated
  // and goes through the policy gate.
  const origin = obj.origin === "user" ? "user" : "agent";
  const actorLabel =
    typeof obj.actorLabel === "string" && obj.actorLabel.trim()
      ? obj.actorLabel
      : undefined;

  // applySurfaceWrite owns loudness (toast + captureError) and never throws.
  const result = await applySurfaceWrite(target, obj.value, {
    surfaceName,
    origin,
    actorLabel,
  });
  if (result.ok) return { ok: true, result: { surfaceName: result.surfaceName } };
  // A decline is reported honestly as not-applied, but it is NOT a defect —
  // `applySurfaceWrite` already kept it quiet, and the runner must not toast
  // over the user's own choice.
  return { ok: false, error: result.error };
}

registerKindAction({
  key: "apply_surface_write",
  description:
    "Write a value into the current page via a surface-manifest write target (draft/entity/ui per the target's declared mode). Pass origin:'user' ONLY for a real click; anything else is gated by the target's applyPolicy.",
  handler: applySurfaceWriteHandler,
});
