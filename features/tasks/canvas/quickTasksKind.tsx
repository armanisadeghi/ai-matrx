"use client";

/**
 * Quick Tasks as a canvas tab — QuickTasksSheet in a tab of its own. A caller
 * may hand it a task to pre-fill (`prePopulate`); the body applies it once and
 * clears it from the tab, so a reload never re-fills the form.
 */

import { CheckSquare, ExternalLink } from "lucide-react";
import { defineCanvasKind } from "@ai-matrx/canvas/react";
import type { CanvasJson } from "@ai-matrx/canvas";
import { canvasRecord, canvasText, useToolOpener } from "@/features/canvas/host/toolCanvas";

export const QUICK_TASKS_KIND = "quick-tasks";
const TITLE = "Quick Tasks";

export interface QuickTaskPrefill {
  title?: string;
  description?: string;
  metadataInfo?: string;
}

export function readQuickTaskPrefill(data: CanvasJson | undefined | null): QuickTaskPrefill | null {
  const raw = canvasRecord(data).prePopulate;
  if (!raw || typeof raw !== "object") return null;
  return {
    title: canvasText(raw, "title") ?? undefined,
    description: canvasText(raw, "description") ?? undefined,
    metadataInfo: canvasText(raw, "metadataInfo") ?? undefined,
  };
}

export const quickTasksKind = defineCanvasKind<CanvasJson>({
  id: QUICK_TASKS_KIND,
  surface: "dom",
  label: TITLE,
  icon: CheckSquare,
  load: () => import("./QuickTasksCanvasView"),
  restore: true,
  launcher: { key: "default", data: null, title: TITLE },
  menuItems: () => [
    {
      id: "open-tasks-page",
      label: "Open Tasks",
      icon: <ExternalLink />,
      onSelect: () => window.open("/tasks", "_blank", "noopener"),
    },
  ],
});

export interface OpenQuickTasksOptions {
  prePopulate?: QuickTaskPrefill;
}

/** Opens Quick Tasks in the canvas (or focuses its tab), optionally pre-filling a task. */
export function useOpenQuickTasks() {
  const open = useToolOpener((options: OpenQuickTasksOptions) => {
    const prefill = options.prePopulate;
    const prePopulate: CanvasJson = prefill
      ? {
          title: prefill.title ?? null,
          description: prefill.description ?? null,
          metadataInfo: prefill.metadataInfo ?? null,
        }
      : null;
    return {
      kind: QUICK_TASKS_KIND,
      key: "default",
      title: TITLE,
      data: prefill ? { prePopulate } : null,
      replaceData: Boolean(prefill),
    };
  });
  return (options: OpenQuickTasksOptions = {}) => open(options);
}
