/**
 * The app's diagnostics port for `@ai-matrx/chat` (PACKAGE-INDEPENDENCE P5).
 *
 * Maps the package's diagnostics seam onto this app's Error Inspector, so a
 * package failure lands exactly where it did when the package imported
 * `errorCaptureStore` itself:
 *   - structured entries (`record`) go to `captureError` as they are — every
 *     package source is one of the store's own (compile-checked here);
 *   - the package's own failures (`capture`) file under the "chat" source,
 *     `name` = `chat:<area>`;
 *   - `wasCaptured` is the stream transport's already-recorded marker;
 *   - `requests` drive the netRequests slice (connection health) when a
 *     dispatch is given.
 * Used by providers/ChatHostAdapter.tsx, and by tests that run package code
 * against the real Error Inspector.
 */
import type { ChatDiagnosticsPort } from "@ai-matrx/chat/host";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { wasStreamErrorCaptured } from "@/lib/diagnostics/captureStreamError";
import {
  beatHeartbeat,
  finishRequest,
  setPhase,
  startRequest,
} from "@/lib/redux/net/netRequestsSlice";
import type { UnknownAction } from "@reduxjs/toolkit";

export function createAppChatDiagnostics(
  dispatch?: (action: UnknownAction) => unknown,
): ChatDiagnosticsPort {
  return {
    capture(error, ctx) {
      captureError({
        source: "chat",
        name: `chat:${ctx.area}`,
        code: ctx.code,
        message: error instanceof Error ? error.message : String(error),
        ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
        ...(ctx.detail !== undefined ? { raw: ctx.detail } : {}),
      });
    },
    record: (entry) => captureError(entry),
    wasCaptured: (error) => wasStreamErrorCaptured(error),
    ...(dispatch
      ? {
          requests: {
            start: (request) => void dispatch(startRequest(request)),
            phase: (id, phase) => void dispatch(setPhase({ id, phase })),
            heartbeat: (id) => void dispatch(beatHeartbeat(id)),
            finish: (result) => void dispatch(finishRequest(result)),
          },
        }
      : {}),
  };
}
