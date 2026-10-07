"use client";

import { SignaturePad } from "@ai-matrx/records-ui";

export function DrawTab({ drawing, onDrawing }: { drawing: string | null; onDrawing: (v: string | null) => void }) {
  return <SignaturePad value={drawing} onChange={onDrawing} />;
}
