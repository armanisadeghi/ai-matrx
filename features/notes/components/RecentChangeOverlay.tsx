"use client";

// RecentChangeOverlay — Briefly highlights the region of the textarea that
// just changed from an external source (undo, redo, realtime update). Same
// mirror-div technique as FindMatchOverlay so the highlight aligns to the
// exact text bounds, then fades out via CSS animation and unmounts.
//
// For pure deletions the changed range collapses to a caret position
// (start === end). We render a thin 2px-wide marker at that position so
// the user can still see "something happened here".

import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { DiffRange } from "../utils/diffRange";

interface RecentChangeOverlayProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  /** Current content of the textarea (post-change). */
  content: string;
  /** Range in `content` to highlight. Null disables the overlay. */
  range: DiffRange | null;
  /** Bumped by the parent each time a new change happens. Used as the
   *  CSS animation key so the fade restarts cleanly. */
  flashKey: number;
}

// Typed as a Pick over the settable string properties (not
// `keyof CSSStyleDeclaration`, which also includes methods like
// `getPropertyValue`) so indexed get/set both type-check honestly.
const COPIED_STYLES: Array<
  keyof Pick<
    CSSStyleDeclaration,
    | "fontFamily"
    | "fontSize"
    | "fontWeight"
    | "fontStyle"
    | "fontVariant"
    | "letterSpacing"
    | "lineHeight"
    | "textTransform"
    | "textIndent"
    | "tabSize"
    | "wordSpacing"
    | "whiteSpace"
    | "wordBreak"
    | "wordWrap"
    | "overflowWrap"
    | "paddingTop"
    | "paddingRight"
    | "paddingBottom"
    | "paddingLeft"
    | "borderTopWidth"
    | "borderRightWidth"
    | "borderBottomWidth"
    | "borderLeftWidth"
    | "borderTopStyle"
    | "borderRightStyle"
    | "borderBottomStyle"
    | "borderLeftStyle"
    | "boxSizing"
    | "direction"
  >
> = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontVariant",
  "letterSpacing",
  "lineHeight",
  "textTransform",
  "textIndent",
  "tabSize",
  "wordSpacing",
  "whiteSpace",
  "wordBreak",
  "wordWrap",
  "overflowWrap",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderTopStyle",
  "borderRightStyle",
  "borderBottomStyle",
  "borderLeftStyle",
  "boxSizing",
  "direction",
];

function syncStyles(overlay: HTMLDivElement, textarea: HTMLTextAreaElement) {
  const cs = window.getComputedStyle(textarea);
  for (const prop of COPIED_STYLES) {
    overlay.style[prop] = cs[prop];
  }
  overlay.style.whiteSpace = "pre-wrap";
  overlay.style.wordWrap = "break-word";
  overlay.style.overflowWrap = "break-word";
}

export function RecentChangeOverlay({
  textareaRef,
  content,
  range,
  flashKey,
}: RecentChangeOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Build before / mark / after segments. Pure-deletion ranges (start ===
  // end) are rendered as a zero-width <mark> with a left border so the
  // user still gets a visible "here" marker.
  const segments = useMemo(() => {
    if (!range) return null;
    const start = Math.max(0, Math.min(range.start, content.length));
    const end = Math.max(start, Math.min(range.end, content.length));
    return {
      before: content.slice(0, start),
      mark: content.slice(start, end),
      after: content.slice(end),
      isCaret: start === end,
    };
  }, [content, range]);

  useLayoutEffect(() => {
    const ta = textareaRef.current;
    const overlay = overlayRef.current;
    if (!ta || !overlay) return undefined;
    syncStyles(overlay, ta);
    const ro = new ResizeObserver(() => syncStyles(overlay, ta));
    ro.observe(ta);
    return () => ro.disconnect();
  }, [textareaRef]);

  useEffect(() => {
    const ta = textareaRef.current;
    const overlay = overlayRef.current;
    if (!ta || !overlay) return undefined;
    const onScroll = () => {
      overlay.scrollTop = ta.scrollTop;
      overlay.scrollLeft = ta.scrollLeft;
    };
    onScroll();
    ta.addEventListener("scroll", onScroll, { passive: true });
    return () => ta.removeEventListener("scroll", onScroll);
  }, [textareaRef]);

  // After a content change the overlay's innerHTML resets — re-sync scroll
  // and also pull the changed region into view if it's offscreen.
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    const overlay = overlayRef.current;
    if (!ta || !overlay) return;
    overlay.scrollTop = ta.scrollTop;
    overlay.scrollLeft = ta.scrollLeft;

    if (!segments) return;
    const mark = overlay.querySelector<HTMLElement>("mark.recent-change");
    if (!mark) return;
    const markTop = mark.offsetTop;
    const markHeight = mark.offsetHeight || 20;
    const viewTop = ta.scrollTop;
    const viewBottom = viewTop + ta.clientHeight;
    const pad = 60;
    if (markTop < viewTop + pad) {
      ta.scrollTop = Math.max(0, markTop - pad);
    } else if (markTop + markHeight > viewBottom - pad) {
      ta.scrollTop = markTop + markHeight - ta.clientHeight + pad;
    }
    overlay.scrollTop = ta.scrollTop;
    overlay.scrollLeft = ta.scrollLeft;
  }, [segments, flashKey, textareaRef]);

  if (!segments) return null;

  return (
    <div
      ref={overlayRef}
      aria-hidden="true"
      className="find-match-overlay pointer-events-none absolute inset-0 overflow-hidden text-transparent"
      style={{ margin: 0, background: "transparent", zIndex: 2 }}
    >
      {segments.before}
      <mark
        // flashKey in the key forces a fresh DOM node so the CSS animation
        // restarts even when consecutive changes hit the same range.
        key={flashKey}
        className={
          segments.isCaret
            ? "recent-change recent-change-caret"
            : "recent-change"
        }
      >
        {segments.mark || "​"}
      </mark>
      {segments.after}
    </div>
  );
}
