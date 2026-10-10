"use client";

/**
 * The person's scratchpad as a canvas tab — the ONE tab every scratchpad door
 * opens (Quick Access, the composer rail's Scratch pill, an editor's "Open in
 * Canvas"). The body is the chat package's ScratchpadQuickPanel (the shared
 * working-document editor on the ACTIVE scratchpad); the pool switcher (pick /
 * new / delete) is the tab's header button, and the tab is named after the
 * active scratchpad.
 *
 * The kind id and key live in the chat package (`host/canvas-tabs.ts`) so the
 * package recognises this tab on the canvas by the same identity.
 */

import { NotebookPen } from "lucide-react";
import { SelectChevron } from "@ai-matrx/design-system";
import { TapTargetButtonTransparent } from "@ai-matrx/design-system/tap-target";
import { defineCanvasKind } from "@ai-matrx/canvas/react";
import type { CanvasJson } from "@ai-matrx/canvas";
import { ScratchpadSwitcherMenu } from "@ai-matrx/chat/agents/components/working-document/ScratchpadSwitcherMenu";
import { SCRATCHPAD_KIND, SCRATCHPAD_TAB_KEY } from "@ai-matrx/chat/host/canvas-tabs";
import type { OpenScratchpadPanelOptions } from "@ai-matrx/chat/host/window-openers";
import { canvasText, useToolOpener } from "@/features/canvas/host/toolCanvas";

export { SCRATCHPAD_KIND };
export const SCRATCHPAD_TITLE = "Scratchpad";

/** The chat this tab was opened from, when a chat opened it. */
export function readScratchpadGate(data: CanvasJson | undefined | null): string | undefined {
  return canvasText(data, "gateConversationId") ?? undefined;
}

function ScratchpadHeaderAction() {
  return (
    <ScratchpadSwitcherMenu
      trigger={<TapTargetButtonTransparent ariaLabel="Switch scratchpad" icon={<SelectChevron size="sm" />} />}
    />
  );
}

export const scratchpadKind = defineCanvasKind<CanvasJson>({
  id: SCRATCHPAD_KIND,
  surface: "dom",
  label: SCRATCHPAD_TITLE,
  icon: NotebookPen,
  load: () => import("./ScratchpadCanvasView"),
  restore: true,
  launcher: { key: SCRATCHPAD_TAB_KEY, data: null, title: SCRATCHPAD_TITLE },
  HeaderAction: ScratchpadHeaderAction,
});

/**
 * Opens the scratchpad in the canvas (or focuses its tab). A chat that opens
 * it names itself, so the tab offers "Share with this chat"; a door with no
 * chat (Quick Access) leaves an open tab's chat as it was.
 */
export function useOpenScratchpadPanel() {
  return useToolOpener((options: OpenScratchpadPanelOptions | undefined) => ({
    kind: SCRATCHPAD_KIND,
    key: SCRATCHPAD_TAB_KEY,
    title: SCRATCHPAD_TITLE,
    data: options?.gateConversationId ? { gateConversationId: options.gateConversationId } : null,
    replaceData: Boolean(options?.gateConversationId),
  }));
}
