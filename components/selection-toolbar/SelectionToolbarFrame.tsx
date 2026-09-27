"use client";

// components/selection-toolbar/SelectionToolbarFrame.tsx
//
// The ONE selection toolbar's frame — loaded the first time a toolbar opens
// (SelectionToolbarRoot is the always-mounted shell). It renders the Alchemy
// package's selection layout (`@ai-matrx/alchemy/react/selection`: the strip,
// then More) or a zone's panel, in a portal, and owns the one position rule:
//   • desktop: above the selection, flipped below when there is no room,
//     clamped to the viewport, following the selection as the page scrolls;
//   • phone: docked at the bottom edge above the home indicator — never beside
//     the selection, so the native selection menu keeps its place.
// It floats (fixed, portal): it never adds rows or pushes content.

import * as React from "react";
import { createPortal } from "react-dom";
import type { ClickTarget } from "@ai-matrx/alchemy/actions";
import { SelectionToolbar } from "@ai-matrx/alchemy/react/selection";
import type { SelectionMode } from "./selection-zones";

export interface Rect {
  left: number;
  top: number;
  bottom: number;
  width: number;
}

const GAP = 8;
const EDGE = 8;

export default function SelectionToolbarFrame({
  seq,
  mode,
  target,
  text,
  range,
  rect,
  docked,
  focusToolbar,
  panel,
}: {
  seq: number;
  mode: SelectionMode;
  target: ClickTarget;
  text: string;
  range: Range | null;
  rect: Rect;
  docked: boolean;
  focusToolbar: boolean;
  panel: React.ReactNode | null;
}): React.ReactElement | null {
  const frameRef = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState<{ left: number; top: number; hidden: boolean } | null>(null);
  const place = React.useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let at = rect;
    if (range) {
      const live = range.getBoundingClientRect();
      if (live.width || live.height) at = { left: live.left, top: live.top, bottom: live.bottom, width: live.width };
    }
    const w = frame.offsetWidth;
    const h = frame.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const hidden = at.bottom < 0 || at.top > vh;
    let top = at.top - h - GAP;
    if (top < EDGE) top = at.bottom + GAP;
    top = Math.max(EDGE, Math.min(vh - h - EDGE, top));
    const left = Math.max(EDGE, Math.min(vw - w - EDGE, at.left + at.width / 2 - w / 2));
    setPosition((p) => (p && p.left === left && p.top === top && p.hidden === hidden ? p : { left, top, hidden }));
  }, [rect, range]);

  React.useLayoutEffect(() => {
    if (docked) return;
    place();
    const frame = frameRef.current;
    const ro = frame && typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => place()) : null;
    if (frame) ro?.observe(frame);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      ro?.disconnect();
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [docked, place, panel]);

  // Opened from the keyboard (Ctrl/Cmd+Alt+M): focus the first control once it draws.
  React.useEffect(() => {
    if (!focusToolbar) return;
    let tries = 0;
    let id = 0;
    const focusFirst = () => {
      const first = frameRef.current?.querySelector<HTMLElement>("button:not([disabled])");
      if (first) first.focus();
      else if (tries++ < 20) id = requestAnimationFrame(focusFirst);
    };
    id = requestAnimationFrame(focusFirst);
    return () => cancelAnimationFrame(id);
  }, [seq, focusToolbar]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (panel) return; // a panel (a composer) owns its keys
    const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const list = [...(frameRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? [])];
    if (list.length === 0) return;
    e.preventDefault();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home" ? 0
      : e.key === "End" ? list.length - 1
      : e.key === "ArrowRight" || e.key === "ArrowDown" ? (at + 1) % list.length
      : (at - 1 + list.length) % list.length;
    list[next].focus();
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={frameRef}
      data-selection-toolbar={docked ? "docked" : "floating"}
      data-selection-mode={mode}
      onKeyDown={onKeyDown}
      className={docked ? "fixed inset-x-2 z-[9999] flex justify-center" : "fixed z-[9999]"}
      style={
        docked
          ? { bottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }
          : {
              left: position?.left ?? -10_000,
              top: position?.top ?? -10_000,
              visibility: position && !position.hidden ? "visible" : "hidden",
            }
      }
    >
      {panel ? (
        <div
          data-selection-panel=""
          className="w-[min(340px,calc(100vw-16px))] rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {panel}
        </div>
      ) : (
        <SelectionToolbar
          key={seq}
          target={target}
          content={text}
          className={docked ? "max-w-full overflow-x-auto" : undefined}
        />
      )}
    </div>,
    document.body,
  );
}
