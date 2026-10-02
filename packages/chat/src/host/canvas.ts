"use client";

/**
 * host/canvas — the seam package code uses for the host's canvas.
 *
 * Generic canvas machinery (controller, ids, selectors) is `@ai-matrx/canvas`
 * and package code may import it directly. What lives HERE is the app half:
 * putting a content-typed artifact on the canvas and reading which sources
 * it holds — that vocabulary belongs to the host, so it arrives through the
 * host's `canvas` port. Both hooks read the port from <ChatProvider>'s
 * context; the port's own hooks are stable for the host's lifetime.
 */

import type { ChatCanvasOpeners, ChatCanvasView } from "./contract";
import { useChatHost } from "./react";

/** Live view of what the canvas holds. Re-renders when that changes. */
export function useChatCanvasView(): ChatCanvasView {
  return useChatHost().canvas.useView();
}

/** Open / offer / hide / toggle with stable identities; never subscribes. */
export function useChatCanvasOpeners(): ChatCanvasOpeners {
  return useChatHost().canvas.useOpeners();
}
