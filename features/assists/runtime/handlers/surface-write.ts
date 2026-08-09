/**
 * `surface_write` — accepting the assist applies a prepared value to a
 * declared surface write target through the ONE write-back seam
 * (`applySurfaceWrite`). The chip click IS the human gesture, so the write
 * runs with `origin: "user"` — the surface's own manifest validation and
 * handler wiring still apply, loudly.
 */

import { applySurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";
import {
  registerAssistAction,
  type AssistActionResult,
} from "../assist-action-registry";

registerAssistAction({
  kind: "surface_write",
  description:
    "Apply the assist's prepared value to a declared surface write target (origin: user — the chip click is the gesture).",
  handler: async (assist): Promise<AssistActionResult> => {
    if (assist.action.kind !== "surface_write") {
      return { ok: false, error: "surface_write: wrong action payload" };
    }
    const { target, value, surfaceName } = assist.action;
    const outcome = await applySurfaceWrite(target, value, {
      surfaceName,
      origin: "user",
      actorLabel: "Assist",
    });
    if (!outcome.ok) {
      return { ok: false, error: outcome.error };
    }
    return { ok: true, result: outcome };
  },
});
