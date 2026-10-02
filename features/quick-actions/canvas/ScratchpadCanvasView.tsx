"use client";

/** The body of the scratchpad canvas tab; the tab carries the active scratchpad's name. */

import { useEffect } from "react";
import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { ScratchpadQuickPanel } from "@ai-matrx/chat/agents/components/working-document/ScratchpadQuickPanel";
import { useActiveScratchpadTitle } from "@ai-matrx/chat/agents/components/working-document/ScratchpadSwitcherMenu";
import { SCRATCHPAD_TITLE } from "./scratchpadKind";

export default function ScratchpadCanvasView({ item, canvas }: CanvasKindProps) {
  const title = useActiveScratchpadTitle() ?? SCRATCHPAD_TITLE;
  useEffect(() => {
    if (canvas.getState().items[item.id]?.title !== title) canvas.update(item.id, { title });
  }, [canvas, item.id, title]);
  return <ScratchpadQuickPanel className="bg-background" />;
}
