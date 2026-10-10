"use client";

/**
 * Quick Data as a canvas tab — QuickDataSheet (table picker + the located
 * table viewer) in a tab of its own. One tab: reopening focuses it; a caller
 * naming a table re-points it at that table.
 */

import { Database } from "lucide-react";
import { defineCanvasKind } from "@ai-matrx/canvas/react";
import type { CanvasJson } from "@ai-matrx/canvas";
import { canvasText } from "@/features/canvas/host/toolCanvas";

import { QUICK_DATA_KIND, QUICK_DATA_TITLE as TITLE } from "@/features/canvas/host/quickToolLaunchers";

export { QUICK_DATA_KIND };

export function readQuickDataTableId(data: CanvasJson | undefined | null): string | null {
  return canvasText(data, "tableId");
}

export const quickDataKind = defineCanvasKind<CanvasJson>({
  id: QUICK_DATA_KIND,
  surface: "dom",
  label: TITLE,
  icon: Database,
  load: () => import("./QuickDataCanvasView"),
  restore: true,
});
