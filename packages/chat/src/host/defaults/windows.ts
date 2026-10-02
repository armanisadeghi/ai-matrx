/**
 * Default windows port. The package's own floating-window host ships at P18;
 * until then a bare host cannot open a chat window, and every attempt says so
 * (console once per window id, recorded in diagnostics) instead of doing nothing.
 */

import type { ChatDiagnosticsPort, ChatWindowsPort } from "../contract";
import { announceOnce } from "../errors";

export function createUnhostedWindows(
  diagnostics: () => ChatDiagnosticsPort,
): ChatWindowsPort {
  return {
    open(id, _data, instanceId) {
      if (
        announceOnce(
          `windows-unhosted:${id}`,
          `Chat window "${id}" was not opened: this host has no window host. ` +
            "Pass a `windows` port to the chat host.",
        )
      ) {
        diagnostics().capture(new Error(`No window host for "${id}"`), {
          area: "windows",
          code: "window-host-missing",
          detail: { id, instanceId },
        });
      }
    },
    close() {
      /* nothing was opened */
    },
  };
}
