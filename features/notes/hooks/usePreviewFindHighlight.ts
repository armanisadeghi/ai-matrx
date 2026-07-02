"use client";

// usePreviewFindHighlight — Highlight find matches inside rendered markdown
// preview using the CSS Custom Highlight API.
//
// The preview pane renders arbitrary HTML (headings, code blocks, lists, etc.)
// so we can't rely on character offsets from the plain-text source: those
// indices don't line up with the rendered DOM. Instead we re-run the search
// against the visible text nodes and build Ranges over the matching text.
//
// CSS.highlights is widely supported in modern browsers; in older engines
// (or during SSR) we silently no-op — highlights are a nice-to-have, search
// still works in the textarea side.

import { useEffect } from "react";
import type { FindMatch } from "../utils/findMatches";

function getHighlights(): HighlightRegistry | null {
  // The CSS Custom Highlight API is declared in lib.dom.d.ts (always typed as
  // present), but real support varies by engine — guard both `CSS` itself and
  // its `highlights` registry at runtime rather than trusting the type.
  if (typeof CSS === "undefined" || !CSS.highlights) return null;
  return CSS.highlights;
}

interface Options {
  /** The container holding the rendered markdown (preview root). */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Current find query — we re-run the search against visible text nodes. */
  query: string;
  caseSensitive: boolean;
  useRegex: boolean;
  wholeWord: boolean;
  /** Index of the active match among the computed source matches. */
  activeIndex: number;
  /** Total match count from source (only used to detect active validity). */
  matchCount: number;
  /** When this changes we re-scroll the active match into view. */
  scrollToken: number;
  /** Whether find is open — if not, we clear highlights. */
  enabled: boolean;
  /**
   * Bumped by the consumer (on a bounded interval after mount) to force a full
   * re-evaluation. A cold switch into preview renders its markdown seconds
   * later and React can swap the scroll-container element after Suspense
   * resolves — re-running on each nonce lets us re-acquire the real, now-filled
   * container and apply highlights + scroll once it's ready.
   */
  refreshNonce: number;
}

function buildRegex(
  query: string,
  caseSensitive: boolean,
  useRegex: boolean,
  wholeWord: boolean,
): RegExp | null {
  if (!query) return null;
  let pattern: string;
  if (useRegex) {
    try {
      new RegExp(query);
      pattern = query;
    } catch {
      return null;
    }
  } else {
    pattern = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  if (wholeWord) pattern = `\\b${pattern}\\b`;
  try {
    return new RegExp(pattern, caseSensitive ? "g" : "gi");
  } catch {
    return null;
  }
}

export function usePreviewFindHighlight({
  containerRef,
  query,
  caseSensitive,
  useRegex,
  wholeWord,
  activeIndex,
  matchCount,
  scrollToken,
  enabled,
  refreshNonce,
}: Options) {
  useEffect(() => {
    const highlights = getHighlights();
    if (!highlights) return undefined;

    const clearHighlights = () => {
      const h = getHighlights();
      if (!h) return;
      h.delete("notes-find-match");
      h.delete("notes-find-match-active");
    };

    // Returns true when the work is "settled" (nothing to do, or matches were
    // applied) and false when the container has no rendered text yet — i.e.
    // the preview markdown hasn't mounted, so we should retry shortly.
    const apply = (): boolean => {
      clearHighlights();
      // Nothing to highlight — settled, stop watching.
      if (!enabled || !query) return true;

      // Container not mounted yet. On the very FIRST cold switch into preview,
      // NoteEditorCore's preview subtree suspends on the lazy markdown chunk,
      // so the scroll container (and thus this ref) is still null when the
      // effect first runs. Treat that as "not ready" and keep polling/watching
      // until it appears — never as "settled", or we'd give up before the
      // preview ever mounts.
      const container = containerRef.current;
      if (!container) return false;

      const regex = buildRegex(query, caseSensitive, useRegex, wholeWord);
      if (!regex) return true;

      // Walk every visible text node, running the regex and collecting ranges.
      // We reset lastIndex for each node because the regex is in exec loop mode.
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        null,
      );

      const allRanges: Range[] = [];
      let node: Node | null = walker.nextNode();
      // Safety cap — pathological docs shouldn't hang the browser.
      let rangeBudget = 20_000;

      while (node && rangeBudget > 0) {
        const text = node.nodeValue ?? "";
        if (text.length > 0) {
          regex.lastIndex = 0;
          let m: RegExpExecArray | null;
          let iterCap = 10_000;
          while ((m = regex.exec(text)) !== null && iterCap-- > 0) {
            if (m[0].length === 0) {
              regex.lastIndex++;
              continue;
            }
            const range = document.createRange();
            try {
              range.setStart(node, m.index);
              range.setEnd(node, m.index + m[0].length);
              allRanges.push(range);
              rangeBudget--;
            } catch {
              // Bad offset — skip this match and move on.
            }
          }
        }
        node = walker.nextNode();
      }

      if (allRanges.length === 0) {
        // Distinguish "no matches in a rendered doc" (settled — stop) from
        // "preview hasn't rendered its content yet" (retry). After a mode
        // switch into preview, the markdown remounts asynchronously, so the
        // first pass runs against an empty container and must retry.
        const hasRenderedText = (container.textContent ?? "").trim().length > 0;
        return hasRenderedText;
      }

      // If the active index from the source (plain-text) is out of range for
      // the preview matches, fall back to marking every range as non-active.
      const activeRange =
        activeIndex >= 0 && activeIndex < allRanges.length
          ? allRanges[activeIndex]
          : null;

      const nonActive = activeRange
        ? allRanges.filter((r) => r !== activeRange)
        : allRanges;

      if (nonActive.length > 0) {
        highlights.set("notes-find-match", new Highlight(...nonActive));
      }
      if (activeRange) {
        highlights.set(
          "notes-find-match-active",
          new Highlight(activeRange),
        );
      }

      // Scroll-into-view for the active match in the preview. Uses the range's
      // bounding rect, which works regardless of the scrollable ancestor.
      if (activeRange) {
        const rect = activeRange.getBoundingClientRect();
        // Find a scrollable ancestor (container or first scroll parent).
        let el: HTMLElement | null = container;
        while (el && el !== document.body) {
          const overflowY = window.getComputedStyle(el).overflowY;
          if (overflowY === "auto" || overflowY === "scroll") break;
          el = el.parentElement;
        }
        if (el) {
          const ancRect = el.getBoundingClientRect();
          const pad = 40;
          if (rect.top < ancRect.top + pad) {
            el.scrollTop += rect.top - ancRect.top - pad;
          } else if (rect.bottom > ancRect.bottom - pad) {
            el.scrollTop += rect.bottom - ancRect.bottom + pad;
          }
        }
      }
      return true;
    };

    let cancelled = false;
    let observer: MutationObserver | null = null;
    let rafId = 0;
    let pollId: ReturnType<typeof setTimeout> | null = null;
    let polls = 0;

    const stopWatching = () => {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (pollId) {
        clearTimeout(pollId);
        pollId = null;
      }
    };

    // Try to apply now; if the preview markdown hasn't rendered yet (`apply`
    // returns false) keep watching. A cold switch into preview on a large note
    // can take seconds to render its content (lazy markdown chunk + parse), and
    // on the very first mount the scroll container may not even exist on this
    // pass. We use two complementary mechanisms:
    //   1. A MutationObserver that re-applies when the container's subtree
    //      changes (attached as soon as the container exists).
    //   2. A slow poll backstop that re-attempts + (re)attaches the observer —
    //      this covers the first-mount race where the container is still null,
    //      and the case where content mutated in the gap before we observed.
    // Everything self-terminates the instant matches are applied (or the doc
    // settles with rendered text but no matches), so nothing lingers. The walk
    // is trivial while the container is empty, so polling stays cheap.
    const attemptAndWatch = () => {
      if (cancelled) return;
      if (apply()) {
        stopWatching();
        return;
      }
      const container = containerRef.current;
      if (container && !observer) {
        observer = new MutationObserver(() => {
          if (cancelled) return;
          cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => {
            if (cancelled) return;
            if (apply()) stopWatching();
          });
        });
        observer.observe(container, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      }
      // ~6s budget — a cold first mount can suspend on the lazy markdown chunk
      // for several seconds before the container even exists. The walk is
      // trivial while the container is empty/absent, so polling stays cheap.
      if (polls < 80) {
        polls += 1;
        pollId = setTimeout(attemptAndWatch, 75);
      }
    };
    attemptAndWatch();

    // Cleanup on unmount / next run.
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      stopWatching();
      clearHighlights();
    };
  }, [
    containerRef,
    query,
    caseSensitive,
    useRegex,
    wholeWord,
    activeIndex,
    matchCount,
    scrollToken,
    enabled,
    refreshNonce,
  ]);
}
