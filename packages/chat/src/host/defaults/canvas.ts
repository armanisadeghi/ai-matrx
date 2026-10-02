/**
 * Default canvas port. A bare host has no canvas column, so nothing the chat
 * puts "on the canvas" can appear. Every verb that would show something
 * returns false and says so (console once per verb, recorded in diagnostics)
 * instead of pretending it worked. Nothing is ever on this canvas, so the
 * view is permanently closed and empty, and `hide` has nothing to put away.
 *
 * matrx-frontend passes its `@ai-matrx/canvas` binding
 * (`features/canvas/host/chatCanvasPort.ts`).
 */

import type {
  ChatCanvasOpeners,
  ChatCanvasPort,
  ChatCanvasView,
  ChatDiagnosticsPort,
} from "../contract";
import { announceOnce } from "../errors";

export const UNHOSTED_CANVAS_VIEW: ChatCanvasView = Object.freeze({
  isOpen: false,
  sourceIds: Object.freeze([]) as readonly string[],
  activeSourceId: null,
  activeArtifactId: null,
});

export function createUnhostedCanvas(
  diagnostics: () => ChatDiagnosticsPort,
): ChatCanvasPort {
  const refuse = (verb: string, type: string | null): false => {
    if (
      announceOnce(
        `canvas-unhosted:${verb}`,
        `Canvas ${verb}${type ? ` of "${type}"` : ""} did nothing: this host has no canvas. ` +
          "Pass a `canvas` port to the chat host.",
      )
    ) {
      diagnostics().capture(new Error(`No canvas host for ${verb}`), {
        area: "canvas",
        code: "canvas-host-missing",
        detail: { verb, type },
      });
    }
    return false;
  };

  const openers: ChatCanvasOpeners = {
    isAvailable: false,
    open: (content) => refuse("open", content?.type ?? null),
    offer: (content) => refuse("offer", content?.type ?? null),
    openPointer: (pointer) => refuse("openPointer", pointer?.type ?? null),
    hide() {
      /* nothing was shown */
    },
    toggle() {
      refuse("toggle", null);
    },
  };

  return {
    useView: () => UNHOSTED_CANVAS_VIEW,
    useOpeners: () => openers,
  };
}
