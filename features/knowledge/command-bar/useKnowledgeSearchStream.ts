"use client";

/**
 * Drives the bar's searches: while typing, the INSTANT pass (top hit, items,
 * messages) debounced ~120 ms, then the CONTENT pass (Segments) once typing pauses
 * for ~600 ms — Segments never run per keystroke (their floor is ~0.4–0.8 s even
 * with a cached vector). Submit runs both passes in one stream. The previous run
 * is aborted, and every section keeps an honest state — loading, answered, failed —
 * as it streams in (Spotlight fills sections as they arrive).
 */

import { useEffect, useRef, useState } from "react";
import {
  KNOWLEDGE_SECTION_KEYS,
  searchKnowledge,
  SECTION_SENTENCE,
  type KnowledgeQuery,
  type KnowledgeSearchEngine,
  type KnowledgeSearchRunner,
  type KnowledgeSection,
  type KnowledgeSectionKey,
} from "@/features/knowledge/api/knowledgeSearch";
import { withMentionResolution } from "@/features/knowledge/api/mentionResolution";

export const AS_YOU_TYPE_DEBOUNCE_MS = 120;
/** How long typing must pause before the content pass (Segments) runs. */
export const CONTENT_PASS_PAUSE_MS = 600;
/** What the Segments section says while its pass is waiting for a typing pause. */
export const SEARCHING_CONTENT = "Searching content…";

export interface SectionState {
  status: "idle" | "loading" | "ready" | "error";
  /** Last answer for this section (kept while re-loading, so rows don't flash). */
  section: KnowledgeSection | null;
  /** Set when status is `error`, or a loading section's own words (e.g. "Searching content…"). */
  message?: string;
  retryable?: boolean;
}

export type SectionStates = Record<KnowledgeSectionKey, SectionState>;

function allSections(state: SectionState): SectionStates {
  return Object.fromEntries(
    KNOWLEDGE_SECTION_KEYS.map((k) => [k, { ...state }]),
  ) as SectionStates;
}

function stateFor(section: KnowledgeSection): SectionState {
  return section.error
    ? {
        status: "error",
        section,
        message: section.error.message,
        retryable: section.error.retryable,
      }
    : { status: "ready", section };
}

// Mentions (`@Ava`) resolve to a container or an entity before the query leaves.
const LIVE_RUNNER = withMentionResolution(searchKnowledge);

export function useKnowledgeSearchStream(
  runner: KnowledgeSearchRunner = LIVE_RUNNER,
) {
  const [sections, setSections] = useState<SectionStates>(() =>
    allSections({ status: "idle", section: null }),
  );
  const [engine, setEngine] = useState<KnowledgeSearchEngine | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const contentController = useRef<AbortController | null>(null);
  const seq = useRef(0);
  const lastQuery = useRef<KnowledgeQuery | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (contentTimer.current) clearTimeout(contentTimer.current);
      controller.current?.abort();
      contentController.current?.abort();
    },
    [],
  );

  /** The content pass: Segments only, into the Segments section alone. */
  const runContent = (query: KnowledgeQuery) => {
    contentController.current?.abort();
    const ctrl = new AbortController();
    contentController.current = ctrl;
    const mine = seq.current;
    runner(query, { signal: ctrl.signal, pass: "content" })
      .then((result) => {
        if (seq.current !== mine || ctrl.signal.aborted) return;
        const seg = result.find((s) => s.key === "segments");
        setSections((prev) => ({
          ...prev,
          segments: seg ? stateFor(seg) : { status: "idle", section: null },
        }));
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted || seq.current !== mine) return;
        const message = err instanceof Error ? err.message : "The content search could not run.";
        setSections((prev) => ({
          ...prev,
          segments: { status: "error", section: null, message, retryable: true },
        }));
      });
  };

  const run = (query: KnowledgeQuery, asYouType: boolean) => {
    controller.current?.abort();
    contentController.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    const mine = ++seq.current;
    lastQuery.current = query;
    const arrived = new Set<KnowledgeSectionKey>();
    setSections((prev) =>
      Object.fromEntries(
        KNOWLEDGE_SECTION_KEYS.map((k) => [
          k,
          asYouType && k === "segments"
            ? { status: "loading", section: prev[k].section, message: SEARCHING_CONTENT }
            : { status: "loading", section: prev[k].section },
        ]),
      ) as SectionStates,
    );
    runner(query, {
      signal: ctrl.signal,
      asYouType,
      ...(asYouType ? { pass: "instant" as const } : {}),
      onEngine: (e) => {
        if (seq.current === mine) setEngine(e);
      },
      onSection: (section) => {
        if (seq.current !== mine) return;
        arrived.add(section.key);
        setSections((prev) => ({ ...prev, [section.key]: stateFor(section) }));
      },
    })
      .then(() => {
        if (seq.current !== mine) return;
        // A section the query narrowed away (type:/kind: chips) is simply not
        // part of this search. Any other lane that never reported is said out
        // loud, never left spinning.
        const narrowed = Boolean(query.types?.length || query.source_kinds?.length);
        setSections((prev) => {
          const next = { ...prev };
          for (const k of KNOWLEDGE_SECTION_KEYS) {
            // While typing, Segments belong to the content pass that follows the pause.
            if (asYouType && k === "segments") continue;
            if (!arrived.has(k) && next[k].status === "loading") {
              next[k] = narrowed
                ? { status: "idle", section: null }
                : {
                    status: "error",
                    section: null,
                    message: SECTION_SENTENCE.didNotAnswer,
                    retryable: true,
                  };
            }
          }
          return next;
        });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted || seq.current !== mine) return;
        const message =
          err instanceof Error ? err.message : "The search could not run.";
        setSections((prev) => {
          const next = { ...prev };
          for (const k of KNOWLEDGE_SECTION_KEYS) {
            if (next[k].status === "loading") {
              next[k] = { status: "error", section: null, message, retryable: true };
            }
          }
          return next;
        });
      });
  };

  /**
   * Typing: the instant pass (debounced), then the content pass once typing pauses.
   * Submit: immediate, both passes in one stream.
   */
  const search = (query: KnowledgeQuery, opts: { asYouType: boolean }) => {
    if (timer.current) clearTimeout(timer.current);
    if (contentTimer.current) clearTimeout(contentTimer.current);
    if (opts.asYouType) {
      timer.current = setTimeout(() => run(query, true), AS_YOU_TYPE_DEBOUNCE_MS);
      if (query.text?.trim()) {
        contentTimer.current = setTimeout(() => runContent(query), CONTENT_PASS_PAUSE_MS);
      }
    } else {
      run(query, false);
    }
  };

  /** Re-run the last query (a section's Retry). */
  const retry = () => {
    if (lastQuery.current) run(lastQuery.current, false);
  };

  /** "Show all" — page ONE section with its own cursor and append its rows. */
  const showMore = async (key: KnowledgeSectionKey) => {
    const q = lastQuery.current;
    const cursor = sections[key].section?.next_cursor;
    if (!q || !cursor) return;
    const result = await runner(
      { ...q, cursors: { [key]: cursor } },
      { asYouType: false },
    );
    const page = result.find((s) => s.key === key);
    if (!page) return;
    setSections((prev) => {
      const current = prev[key].section;
      if (!current || page.error) return { ...prev, [key]: stateFor(page) };
      return {
        ...prev,
        [key]: stateFor({
          ...page,
          items: [...current.items, ...page.items],
        }),
      };
    });
  };

  return { sections, engine, search, retry, showMore };
}
