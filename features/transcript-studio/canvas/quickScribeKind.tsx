"use client";

/**
 * Quick Scribe as a canvas tab — voice capture from any page. A live
 * recording cannot survive a reload, so the tab does not come back after one;
 * it stays mounted while another tab is in front so a recording keeps running.
 */

import { Mic } from "lucide-react";
import { defineCanvasKind } from "@ai-matrx/canvas/react";
import type { CanvasJson } from "@ai-matrx/canvas";
import { canvasText, useToolOpener } from "@/features/canvas/host/toolCanvas";

import { QUICK_SCRIBE_KIND, QUICK_SCRIBE_TITLE as TITLE } from "@/features/canvas/host/quickToolLaunchers";

export { QUICK_SCRIBE_KIND };

export function readScribeSessionId(data: CanvasJson | undefined | null): string | undefined {
  return canvasText(data, "sessionId") ?? undefined;
}

export const quickScribeKind = defineCanvasKind<CanvasJson>({
  id: QUICK_SCRIBE_KIND,
  surface: "dom",
  label: TITLE,
  icon: Mic,
  load: () => import("./QuickScribeCanvasView"),
  restore: false,
});

export interface OpenQuickScribeOptions {
  /** Resume an existing Scribe session instead of minting one. */
  sessionId?: string;
}
