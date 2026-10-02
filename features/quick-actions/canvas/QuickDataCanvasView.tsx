"use client";

/** The body of a Quick Data canvas tab. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { QuickDataSheet } from "../components/QuickDataSheet";
import { readQuickDataTableId } from "./quickDataKind";

export default function QuickDataCanvasView({ data }: CanvasKindProps) {
  return <QuickDataSheet className="bg-background" initialTableId={readQuickDataTableId(data)} />;
}
