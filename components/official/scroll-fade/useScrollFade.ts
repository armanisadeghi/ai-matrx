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
// Attach the returned ref to the scrolling element and spread `fadeProps`.
// Styling lives in styles/scroll-fade.css, keyed off the data attributes.

import { useCallback, useEffect, useRef, useState } from "react";

export interface ScrollFadeState {
  top: boolean;
  bottom: boolean;
}

export interface UseScrollFadeResult {
  ref: React.RefObject<HTMLDivElement | null>;
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
  const ref = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<ScrollFadeState>({
    top: false,
    bottom: false,
  });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const overflowing = el.scrollHeight - el.clientHeight > EPSILON;
    setState({
      top: overflowing && el.scrollTop > EPSILON,
      bottom:
        overflowing &&
        el.scrollTop + el.clientHeight < el.scrollHeight - EPSILON,
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    measure();
    el.addEventListener("scroll", measure, { passive: true });

    // Content can arrive after mount (lazy menu configs, async lists) and the
    // box can be resized by the viewport, so watch both.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const mo = new MutationObserver(measure);
    mo.observe(el, { childList: true, subtree: true });

    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
      mo.disconnect();
    };
  }, [measure]);

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
