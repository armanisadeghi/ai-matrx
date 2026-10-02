"use client";

/**
 * The person's global scratchpad as a canvas tab. The body is the chat
 * package's ScratchpadQuickPanel (the shared working-document editor on the
 * active scratchpad); the pool switcher (pick / new / delete) is the tab's
 * header button, and the tab is named after the active scratchpad.
 *
 * Kind id is not "scratchpad": that id is the artifact content type that shows
 * one scratchpad document an agent wrote.
 */

import { ChevronsUpDown, NotebookPen } from "lucide-react";
import { TapTargetButton } from "@ai-matrx/tap-target";
import { defineCanvasKind } from "@ai-matrx/canvas/react";
import { ScratchpadSwitcherMenu } from "@ai-matrx/chat/agents/components/working-document/ScratchpadSwitcherMenu";
import { useToolOpener } from "@/features/canvas/host/toolCanvas";

export const SCRATCHPAD_KIND = "global-scratchpad";
export const SCRATCHPAD_TITLE = "Scratchpad";

function ScratchpadHeaderAction() {
  return (
    <ScratchpadSwitcherMenu
      trigger={<TapTargetButton ariaLabel="Switch scratchpad" icon={<ChevronsUpDown className="h-4 w-4" />} />}
    />
  );
}

export const scratchpadKind = defineCanvasKind<null>({
  id: SCRATCHPAD_KIND,
  label: SCRATCHPAD_TITLE,
  icon: NotebookPen,
  load: () => import("./ScratchpadCanvasView"),
  restore: true,
  // The editor holds unsaved keystrokes between autosaves.
  keepAlive: true,
  launcher: { key: "default", data: null, title: SCRATCHPAD_TITLE },
  HeaderAction: ScratchpadHeaderAction,
});

/** Opens the scratchpad in the canvas (or focuses its tab). */
export function useOpenScratchpad() {
  const open = useToolOpener((_: null) => ({ kind: SCRATCHPAD_KIND, key: "default", title: SCRATCHPAD_TITLE, data: null }));
  return () => open(null);
}
