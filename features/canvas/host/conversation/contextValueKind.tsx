"use client";

/**
 * One context value a sent message carried, in full, as a canvas tab — the
 * chat package's ContextPolicyDetail (key, type, policy, the frozen value; a
 * document key shows the editable document). ONE tab per conversation, keyed
 * by its id; a context chip (or a row of the "N sent" list) toggles it through
 * the chat canvas port's `useTab` (`contextValueTab.ts`). The kind id lives in
 * the chat package (`host/canvas-tabs.ts`).
 */

import { Boxes } from "lucide-react";
import { defineCanvasKind } from "@ai-matrx/canvas/react";
import type { CanvasJson } from "@ai-matrx/canvas";
import { CONTEXT_VALUE_KIND } from "@ai-matrx/chat/host/canvas-tabs";
import { canvasText } from "@/features/canvas/host/toolCanvas";

export { CONTEXT_VALUE_KIND };

export const contextValueKind = defineCanvasKind<CanvasJson>({
  id: CONTEXT_VALUE_KIND,
  surface: "dom",
  label: "Context value",
  icon: Boxes,
  load: () => import("./ContextValueCanvasView"),
  unavailable: (data) => (canvasText(data, "contextKey") ? null : "No value"),
  // The snapshot is a copy of the message's; the chip re-sends it on every press.
  restore: false,
});
