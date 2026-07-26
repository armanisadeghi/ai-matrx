"use client";

// components/official/scroll-fade/useScrollFade.ts
//
// "There is more below" — told to the eye, not to nobody.
//
// A scroll container that simply hard-clips its last row reads as FINISHED.
// The user never scrolls, because nothing suggested there was anything to
// scroll to. A soft fade at the overflowing edge is the standard cue, and it
// must appear ONLY on the edges that actually overflow — a permanent fade on a
// non-scrolling list just makes the last item look broken.
//
// Attach `ref` to the scrolling element and spread `fadeProps`. Styling lives
// in app/globals.css (.matrx-scroll-fade), keyed off the data attributes.
//
// The ref is a CALLBACK ref, not a useRef object, on purpose: these containers
// are usually mounted conditionally (a popover body, a lazily-resolved menu),
// so an effect that reads `ref.current` on mount finds null and — with no
// dependency that ever changes — never runs again. The fade then silently
// never appears, which is exactly the failure this hook exists to prevent.
//
// TWO RULES THE CALLBACK MUST OBEY (both learned the hard way — breaking
// either one produced "Maximum update depth exceeded" on a page of 13 menus):
//   1. NEVER setState synchronously inside the callback. Radix composes our
//      ref with its own via useComposedRefs, whose identity changes every render,
//      so the ref detaches+reattaches on every commit. A synchronous setState
//      there re-renders, which re-attaches, which sets state again — forever.
//      Measurement is always deferred to rAF.
//   2. NEVER setState on detach (node === null). A detach/attach pair would
//      otherwise flip the fade off and on and drive the same loop.

import { useCallback, useEffect, useRef, useState } from "react";

export interface ScrollFadeState {
  top: boolean;
  bottom: boolean;
}

export interface UseScrollFadeResult {
  ref: (node: HTMLElement | null) => void;
  fadeProps: {
    "data-fade-top": "" | undefined;
    "data-fade-bottom": "" | undefined;
    className: string;
  };
  state: ScrollFadeState;
}

/** Slack below which we treat the edge as reached (sub-pixel scroll math). */
const EPSILON = 2;

export function useScrollFade(): UseScrollFadeResult {
  const [state, setState] = useState<ScrollFadeState>({
    top: false,
    bottom: false,
  });
  const nodeRef = useRef<HTMLElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const measure = useCallback(() => {
    const el = nodeRef.current;
    if (!el) return;
    const overflowing = el.scrollHeight - el.clientHeight > EPSILON;
    const next: ScrollFadeState = {
      top: overflowing && el.scrollTop > EPSILON,
      bottom:
        overflowing &&
        el.scrollTop + el.clientHeight < el.scrollHeight - EPSILON,
    };
    setState((prev) =>
      prev.top === next.top && prev.bottom === next.bottom ? prev : next,
    );
  }, []);

  const ref = useCallback(
    (node: HTMLElement | null) => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      nodeRef.current = node;
      // Rule 2: no state change on detach.
      if (!node) return;

      node.addEventListener("scroll", measure, { passive: true });
      // Content can arrive after mount (lazy menu configs, async lists) and the
      // box can be resized by the viewport, so watch both.
      const ro = new ResizeObserver(measure);
      ro.observe(node);
      const mo = new MutationObserver(measure);
      mo.observe(node, { childList: true, subtree: true });

      cleanupRef.current = () => {
        node.removeEventListener("scroll", measure);
        ro.disconnect();
        mo.disconnect();
      };

      // Rule 1: deferred, never synchronous. Radix also animates the panel in,
      // so its final height is not known on the frame it mounts anyway.
      requestAnimationFrame(measure);
    },
    [measure],
  );

  useEffect(() => () => cleanupRef.current?.(), []);

  return {
    ref,
    state,
    fadeProps: {
      "data-fade-top": state.top ? "" : undefined,
      "data-fade-bottom": state.bottom ? "" : undefined,
      className: "matrx-scroll-fade",
    },
  };
}
