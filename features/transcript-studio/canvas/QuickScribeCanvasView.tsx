"use client";

/** The body of a Quick Scribe canvas tab. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { QuickScribeSheet } from "../components/QuickScribeSheet";
import { readScribeSessionId } from "./quickScribeKind";

export default function QuickScribeCanvasView({ data }: CanvasKindProps) {
  return <QuickScribeSheet sessionId={readScribeSessionId(data)} />;
}
