"use client";

/** The body of a Quick Tasks canvas tab. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { QuickTasksSheet } from "../components/QuickTasksSheet";
import { readQuickTaskPrefill } from "./quickTasksKind";

export default function QuickTasksCanvasView({ item, data, canvas }: CanvasKindProps) {
  return (
    <QuickTasksSheet
      className="bg-background"
      prePopulate={readQuickTaskPrefill(data)}
      // Applied once — clear it so a reload or a refocus never re-fills the form.
      onPrePopulated={() => canvas.update(item.id, { data: null })}
    />
  );
}
