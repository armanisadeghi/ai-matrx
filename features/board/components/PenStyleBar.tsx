"use client";

/**
 * The Draw tool's style bar: colour and weight for the next strokes, shown while the pen is the
 * active tool (the selection toolbar is hidden then, so this is where the pen is styled).
 */

import { useSyncExternalStore } from "react";
import { getPenStyle, setPenStyle, subscribePenStyle } from "../engine/pen-style";
import { useActiveTool } from "../engine/react";
import { ChoiceRow, ColorSwatches } from "./SelectionToolbar";

export function PenStyleBar() {
  const tool = useActiveTool();
  const pen = useSyncExternalStore(subscribePenStyle, getPenStyle, getPenStyle);
  if (tool !== "pen") return null;
  return (
    <div
      data-board-chrome
      data-board-pen-style
      role="toolbar"
      aria-label="Pen style"
      className="absolute left-4 top-16 z-30 flex flex-col gap-2 rounded-lg border border-border bg-card/95 p-2 shadow-md backdrop-blur"
    >
      <ColorSwatches value={pen.stroke} onPick={(c) => c !== "none" && setPenStyle({ stroke: c })} />
      <ChoiceRow
        label="Weight"
        value={pen.size}
        options={[
          { value: "s", label: "S" },
          { value: "m", label: "M" },
          { value: "l", label: "L" },
          { value: "xl", label: "XL" },
        ]}
        onPick={(size) => setPenStyle({ size })}
      />
    </div>
  );
}
