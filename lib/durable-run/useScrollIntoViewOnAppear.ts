"use client";

import { useEffect, useRef } from "react";

/**
 * Bring a notice INTO VIEW the moment it appears.
 *
 * ## The defect this closes (census wall W17, 2026-09-16)
 *
 * The Prediction Ledger's "Turn the answered ones into rules" was driven live
 * with one correctly scored, reasoned call. The server refused honestly and
 * durably — `platform.masterwork_run` a6f401b9 carries
 * `masterwork_prediction_not_enough_outcomes`, "Still waiting on outcomes: 1 of
 * your 2 prediction(s) have an answer, and this needs 5…" — and the dialog
 * rendered that sentence, verbatim, exactly where it was supposed to.
 *
 * Nobody could see it. The dialog's body is a scroll container; the refusal
 * landed below the fold, behind the footer. Reading the DOM found the sentence;
 * a screenshot of the screen found an unchanged dialog and no rules. That is
 * the silent zero the doctrine forbids — the screen did not lie, it simply
 * never spoke where the person was looking.
 *
 * **An honest sentence rendered outside the viewport is a silent failure.** So
 * every durable-run notice — a failure, a refusal, a zero-result summary —
 * scrolls itself to where the person is looking, once, when it appears.
 *
 * Guarded by `useScrollIntoViewOnAppear.test.tsx`, which goes red the moment a
 * surface stops calling this. That file also records the one claim here it
 * CANNOT force red: the `announced` latch below is belt-and-braces against
 * React's dev-mode double effect invocation — the dependency array already
 * stops an identical re-render from scrolling twice.
 */
export function useScrollIntoViewOnAppear<T extends HTMLElement>(
  /** The notice exists right now. False → nothing is scrolled and the latch resets. */
  present: boolean,
  /**
   * Re-arm the latch when this changes, so a SECOND refusal on the same surface
   * scrolls again rather than being swallowed as "already announced".
   */
  token?: string | null,
): React.RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const announced = useRef<string | null>(null);

  useEffect(() => {
    if (!present) {
      announced.current = null;
      return;
    }
    const key = token ?? "present";
    if (announced.current === key) return;
    announced.current = key;
    const node = ref.current;
    // Never assume a browser: jsdom and older engines have no
    // scrollIntoView, and a missing one must not take the render down.
    if (!node || typeof node.scrollIntoView !== "function") return;
    node.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [present, token]);

  return ref;
}
