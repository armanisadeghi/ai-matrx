"use client";

// components/selection-toolbar/SelectionToolbarFrame.tsx
//
// The ONE selection toolbar's frame — loaded the first time a toolbar opens
// (SelectionToolbarRoot is the always-mounted shell). It renders the Alchemy
// package's selection layout (`@ai-matrx/alchemy/react/selection`: the strip,
// then More) or a zone's panel, in a portal, and owns the one position rule:
//   • desktop: above the selection, flipped below when there is no room —
//     measured against the NEAREST SCROLL CONTAINER, not the window, so it
//     never covers a pane's own header — and hidden while the selection is
//     scrolled out of that container's view; it follows as the pane scrolls;
//   • phone: docked at the bottom edge above the home indicator — never beside
//     the selection, so the native selection menu keeps its place.
// It floats (fixed, portal): it never adds rows or pushes content.
// Keyboard: the ARIA toolbar pattern — one tab stop (roving tabindex), arrows
// move within it.

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

/** The nearest ancestor that scrolls (or the viewport): the box the toolbar lives in. */
export function scrollBoundsOf(node: Node | null): { top: number; bottom: number; left: number; right: number } {
  const view = { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
  let el: Element | null = node instanceof Element ? node : node?.parentElement ?? null;
  while (el && el !== document.body && el !== document.documentElement) {
    const style = getComputedStyle(el);
    if (/(auto|scroll|hidden)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1) {
      const r = el.getBoundingClientRect();
      return {
        top: Math.max(view.top, r.top),
        bottom: Math.min(view.bottom, r.bottom),
        left: Math.max(view.left, r.left),
        right: Math.min(view.right, r.right),
      };
    }
    el = el.parentElement;
  }
  return view;
}

/** Where the frame goes for an anchor inside a box (pure; unit-tested). */
export function placeFrame(
  at: Rect,
  size: { w: number; h: number },
  box: { top: number; bottom: number; left: number; right: number },
  viewport: { w: number; h: number },
): { left: number; top: number; hidden: boolean } {
  const hidden = at.bottom <= box.top || at.top >= box.bottom;
  let top = at.top - size.h - GAP;
  if (top < box.top + EDGE) top = at.bottom + GAP;
  top = Math.max(box.top + EDGE, Math.min(Math.min(box.bottom, viewport.h) - size.h - EDGE, top));
  const left = Math.max(EDGE, Math.min(viewport.w - size.w - EDGE, at.left + at.width / 2 - size.w / 2));
  return { left, top, hidden };
}

export default function SelectionToolbarFrame({
  seq,
  mode,
  target,
  text,
  range,
  rect,
  anchor,
  docked,
  focusSignal,
  panel,
}: {
  seq: number;
  mode: SelectionMode;
  target: ClickTarget;
  text: string;
  range: Range | null;
  rect: Rect;
  /** The node the selection lives in — its scroll container bounds the toolbar. */
  anchor: Node | null;
  docked: boolean;
  /** Changes on every keyboard open (Ctrl/Cmd+Alt+M): focus the first control. */
  focusSignal: number;
  panel: React.ReactNode | null;
}): React.ReactElement | null {
  const frameRef = React.useRef<HTMLDivElement>(null);
  const current = React.useRef(0);
  const [position, setPosition] = React.useState<{ left: number; top: number; hidden: boolean } | null>(null);
  const place = React.useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let at = rect;
    if (range) {
      const live = range.getBoundingClientRect();
      if (live.width || live.height) at = { left: live.left, top: live.top, bottom: live.bottom, width: live.width };
    }
    const next = placeFrame(
      at,
      { w: frame.offsetWidth, h: frame.offsetHeight },
      scrollBoundsOf(anchor),
      { w: window.innerWidth, h: window.innerHeight },
    );
    setPosition((p) => (p && p.left === next.left && p.top === next.top && p.hidden === next.hidden ? p : next));
  }, [rect, range, anchor]);

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

  const buttons = () => [...(frameRef.current?.querySelectorAll<HTMLElement>("[role=toolbar] button:not([disabled])") ?? [])];

  // Roving tabindex: the strip is ONE tab stop; arrows move within it.
  React.useEffect(() => {
    const frame = frameRef.current;
    if (!frame || panel) return;
    const apply = () => {
      const list = buttons();
      if (list.length === 0) return;
      if (current.current >= list.length) current.current = 0;
      list.forEach((b, i) => {
        const want = i === current.current ? "0" : "-1";
        if (b.getAttribute("tabindex") !== want) b.setAttribute("tabindex", want);
      });
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(frame, { childList: true, subtree: true });
    const onFocusIn = (e: FocusEvent) => {
      const at = buttons().indexOf(e.target as HTMLElement);
      if (at >= 0 && at !== current.current) {
        current.current = at;
        apply();
      }
    };
    frame.addEventListener("focusin", onFocusIn);
    return () => {
      mo.disconnect();
      frame.removeEventListener("focusin", onFocusIn);
    };
  }, [seq, panel]);

  // Opened from the keyboard (Ctrl/Cmd+Alt+M): focus the first control once it draws.
  React.useEffect(() => {
    if (!focusSignal) return;
    let tries = 0;
    let id = 0;
    const focusFirst = () => {
      const first = buttons()[0];
      if (first) {
        current.current = 0;
        first.focus();
      } else if (tries++ < 20) id = requestAnimationFrame(focusFirst);
    };
    id = requestAnimationFrame(focusFirst);
    return () => cancelAnimationFrame(id);
  }, [focusSignal]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (panel) return; // a panel (a composer) owns its keys
    const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const list = buttons();
    if (list.length === 0) return;
    e.preventDefault();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home" ? 0
      : e.key === "End" ? list.length - 1
      : e.key === "ArrowRight" || e.key === "ArrowDown" ? (at + 1) % list.length
      : (at - 1 + list.length) % list.length;
    current.current = next;
    list.forEach((b, i) => b.setAttribute("tabindex", i === next ? "0" : "-1"));
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
              ...(position && !position.hidden
                ? {}
                : { visibility: "hidden" as const }),
            }
      }
    >
      {panel ? (
        // A panel that draws in its own layer (the record sheet) leaves this
        // wrapper empty — then it takes no space and shows no chrome.
        <div
          data-selection-panel=""
          className="w-[min(340px,calc(100vw-16px))] rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg empty:hidden"
        >
          {panel}
        </div>
      ) : (
        <SelectionToolbar key={seq} target={target} content={text} className={docked ? "max-w-full" : undefined} />
      )}
    </div>,
    document.body,
  );
}
