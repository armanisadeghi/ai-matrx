"use client";

/**
 * SelectionBox — ONE box around a multi-selection (Figma / tldraw), in world
 * space. A single selected tile draws its own ring and handles; two or more
 * draw this instead. It follows a group drag by writing its own style from the
 * camera store's item channel — never a React render per pointer frame, and
 * never a re-render of any tile.
 */

import { useEffect, useRef } from "react";
import { useBoardCameraStore, useSelection } from "../engine/react";
import { boundsOf, frameBody, frameKey } from "../engine/selection";
import type { Rect } from "../engine/camera";

/** Screen px between the selection and its box. */
const OUTSET_PX = 6;

export function SelectionBox() {
  const store = useBoardCameraStore();
  const selection = useSelection();
  const ref = useRef<HTMLDivElement>(null);
  const many = selection.length > 1;

  useEffect(() => {
    const el = ref.current;
    if (!el || !many) return;
    const draw = () => {
      const items = store.getItems();
      const rects: Rect[] = [];
      for (const id of store.getSelection()) {
        const tile = items.get(id);
        if (tile) rects.push(tile);
        else {
          const frame = items.get(frameKey(id));
          if (frame) rects.push(frameBody(frame));
        }
      }
      const box = boundsOf(rects);
      if (!box) {
        el.style.display = "none";
        return;
      }
      el.style.display = "";
      el.style.left = `${box.x}px`;
      el.style.top = `${box.y}px`;
      el.style.width = `${box.w}px`;
      el.style.height = `${box.h}px`;
    };
    draw();
    return store.subscribeItems(draw);
  }, [store, many, selection]);

  if (!many) return null;
  const outset = `calc(${-OUTSET_PX}px / var(--board-z, 1))`;
  return (
    <div
      ref={ref}
      data-board-selection-box
      aria-hidden
      className="pointer-events-none absolute z-[6] max-w-none"
    >
      <div
        className="absolute max-w-none rounded-md border-primary"
        style={{
          inset: outset,
          borderWidth: "calc(1.5px / var(--board-z, 1))",
          borderStyle: "solid",
        }}
      />
    </div>
  );
}
