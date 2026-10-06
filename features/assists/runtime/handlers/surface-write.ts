/**
 * `surface_write` — accepting the assist applies a prepared value to a
 * declared surface write target through the app's ONE write door
 * (`writeToPageThroughDoor`). The chip click IS the human gesture, so the write
 * runs with `origin: "user"` — the surface's own manifest validation and
 * handler wiring still apply, loudly.
 */

import { writeToPageThroughDoor } from "@/components/agent-copy/alchemy-door";
import type {
  AssistActionDefinition,
  AssistActionResult,
} from "../assist-action-types";

export const surfaceWriteAssistAction: AssistActionDefinition = {
  label: "Apply to page",
  kind: "surface_write",
  description:
    "Apply the assist's prepared value to a declared surface write target (origin: user — the chip click is the gesture).",
  handler: async (assist): Promise<AssistActionResult> => {
    if (assist.action.kind !== "surface_write") {
      return { ok: false, error: "surface_write: wrong action payload" };
    }
    const { target, value, surfaceName } = assist.action;
    const outcome = await writeToPageThroughDoor(target, value, {
      surfaceName,
      origin: "user",
      actorLabel: "Assist",
    });
    if (!outcome.ok) {
      return { ok: false, error: outcome.error };
    }
    return { ok: true, result: outcome };
  },
};
