"use client";

/**
 * Quick Data as a canvas tab — QuickDataSheet (table picker + the located
 * table viewer) in a tab of its own. One tab: reopening focuses it; a caller
 * naming a table re-points it at that table.
 */

import { Database } from "lucide-react";
import { defineCanvasKind } from "@ai-matrx/canvas/react";
import type { CanvasJson } from "@ai-matrx/canvas";
import { useToolOpener } from "@/features/canvas/host/toolCanvas";

export const QUICK_DATA_KIND = "quick-data";
const TITLE = "Quick Data";

export function readQuickDataTableId(data: CanvasJson | undefined | null): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return typeof data.tableId === "string" && data.tableId ? data.tableId : null;
}

export const quickDataKind = defineCanvasKind<CanvasJson>({
  id: QUICK_DATA_KIND,
  label: TITLE,
  icon: Database,
  load: () => import("./QuickDataCanvasView"),
  restore: true,
});

export interface OpenQuickDataOptions {
  /** A table to show first. */
  initialTableId?: string | null;
}

/** Opens Quick Data in the canvas (or focuses its tab). */
export function useOpenQuickData() {
  return useToolOpener((options: OpenQuickDataOptions = {}) => ({
    kind: QUICK_DATA_KIND,
    key: "default",
    title: TITLE,
    data: { tableId: options.initialTableId ?? null },
    replaceData: Boolean(options.initialTableId),
  }));
}
