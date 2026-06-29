"use client";

// FindMatchOverlay — Visible highlight layer for find matches in a <textarea>.
//
// Why this exists: a native textarea can only show one selection at a time, so
// we can't use setSelectionRange to render "all matches + one active match".
// Instead we render an absolutely-positioned mirror div on top of the textarea
// that copies the exact text and styling and paints <mark> spans where each
// match falls. Because the overlay is pointer-events:none the textarea keeps
// receiving every keystroke / click / scroll.
//
// The overlay also drives scroll-into-view for the active match: we measure
// the active <mark>'s offsetTop inside the mirror and set textarea.scrollTop
// directly. This scrolls without blur/focus, so the user's focus (find input
// or textarea, whichever it was) is preserved.
//
// The overlay does NOT touch the textarea's native selection — that's managed
// by the FindReplaceBar when the user explicitly navigates next/prev, so the
// browser's caret sits on the active match for replace operations.

import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { FindMatch } from "../utils/findMatches";

interface FindMatchOverlayProps {
  /** Ref to the textarea being overlaid. */
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  /** Current content of the textarea. Must match textareaRef.current.value. */
  content: string;
  /** All matches to render. */
  matches: FindMatch[];
  /** Index of the currently active match (0-based). -1 for none. */
  activeIndex: number;
  /** Bumped by the parent each time the user hits next/prev (or matches
   * change such that the active match moved). Triggers scroll-into-view. */
  scrollToken: number;
}

// Styles copied from the textarea into the overlay so text wraps identically.
// Any style that affects text flow needs to be here.
const COPIED_STYLES: Array<keyof CSSStyleDeclaration> = [
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
    // @ts-expect-error — string-indexed style assignment
    overlay.style[prop] = cs[prop];
  }
  // Force textarea-compatible wrap behavior.
  overlay.style.whiteSpace = "pre-wrap";
  overlay.style.wordWrap = "break-word";
  overlay.style.overflowWrap = "break-word";
}

export function FindMatchOverlay({
  textareaRef,
  content,
  matches,
  activeIndex,
  scrollToken,
}: FindMatchOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Build the segmented render: plain text + <mark> at each match range.
  // Marks carry their absolute `matchIndex` so scroll-into-view can query
  // them directly via `data-match-index`.
  const segments = useMemo(() => {
    if (matches.length === 0) {
      return [{ kind: "text" as const, text: content }];
    }
    const out: Array<
      | { kind: "text"; text: string }
      | { kind: "mark"; text: string; matchIndex: number; active: boolean }
    > = [];
    let cursor = 0;
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      if (m.start > cursor) {
        out.push({ kind: "text", text: content.slice(cursor, m.start) });
      }
      out.push({
        kind: "mark",
        text: content.slice(m.start, m.end),
        matchIndex: i,
        active: i === activeIndex,
      });
      cursor = m.end;
    }
    if (cursor < content.length) {
      out.push({ kind: "text", text: content.slice(cursor) });
    }
    return out;
  }, [content, matches, activeIndex]);

  // Style + position sync: run whenever refs resolve or on resize.
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    const overlay = overlayRef.current;
    if (!ta || !overlay) return undefined;

    syncStyles(overlay, ta);

    const ro = new ResizeObserver(() => {
      syncStyles(overlay, ta);
      // On resize the textarea may have reflowed — re-sync scroll too.
      overlay.scrollTop = ta.scrollTop;
      overlay.scrollLeft = ta.scrollLeft;
    });
    ro.observe(ta);
    return () => ro.disconnect();
  }, [textareaRef]);

  // Scroll sync: overlay must scroll in lockstep with the textarea.
  useEffect(() => {
    const ta = textareaRef.current;
    const overlay = overlayRef.current;
    if (!ta || !overlay) return undefined;

    const onScroll = () => {
      overlay.scrollTop = ta.scrollTop;
      overlay.scrollLeft = ta.scrollLeft;
    };
    // Initial alignment.
    onScroll();
    ta.addEventListener("scroll", onScroll, { passive: true });
    return () => ta.removeEventListener("scroll", onScroll);
  }, [textareaRef]);

  // Also re-align after a content rebuild — the overlay's innerHTML just
  // changed, so its scrollTop may have been reset to 0 by the browser.
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    const overlay = overlayRef.current;
    if (!ta || !overlay) return;
    overlay.scrollTop = ta.scrollTop;
    overlay.scrollLeft = ta.scrollLeft;
  }, [segments, textareaRef]);

  // Scroll the active match into view — but only on explicit navigation,
  // never on content change. If we fired on every `matches` change the
  // textarea would jump around while the user types unrelated characters.
  const lastScrollTokenRef = useRef(scrollToken);
  useEffect(() => {
    if (lastScrollTokenRef.current === scrollToken) return;
    lastScrollTokenRef.current = scrollToken;

    const ta = textareaRef.current;
    const overlay = overlayRef.current;
    if (!ta || !overlay) return;
    if (activeIndex < 0 || matches.length === 0) return;

    const mark = overlay.querySelector<HTMLElement>(
      `mark[data-match-index="${activeIndex}"]`,
    );
    if (!mark) return;

    const markTop = mark.offsetTop;
    const markHeight = mark.offsetHeight || 20;
    const viewTop = ta.scrollTop;
    const viewHeight = ta.clientHeight;
    const viewBottom = viewTop + viewHeight;
    const pad = 40;

    if (markTop < viewTop + pad) {
      ta.scrollTop = Math.max(0, markTop - pad);
    } else if (markTop + markHeight > viewBottom - pad) {
      ta.scrollTop = markTop + markHeight - viewHeight + pad;
    }
    // Keep overlay in sync immediately so the highlight paints aligned.
    overlay.scrollTop = ta.scrollTop;
    overlay.scrollLeft = ta.scrollLeft;
  }, [scrollToken, activeIndex, matches, textareaRef]);

  return (
    <div
      ref={overlayRef}
      aria-hidden="true"
      className="find-match-overlay pointer-events-none absolute inset-0 overflow-hidden text-transparent"
      style={{
        // Runtime syncStyles() copies the active font, padding and border
        // widths off the textarea so lines wrap identically. These inline
        // values just establish a safe baseline before that first sync.
        margin: 0,
        background: "transparent",
        zIndex: 1,
      }}
    >
      {segments.map((seg, i) => {
        if (seg.kind === "text") {
          return <React.Fragment key={i}>{seg.text}</React.Fragment>;
        }
        return (
          <mark
            key={i}
            data-match-index={seg.matchIndex}
            className={
              seg.active ? "find-match find-match-active" : "find-match"
            }
          >
            {seg.text}
          </mark>
        );
      })}
    </div>
  );
}
