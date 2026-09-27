"use client";

/**
 * Drives one search at a time for the bar: debounce while typing (~120 ms,
 * `as_you_type: true`), immediate on submit (`as_you_type: false`), abort the
 * previous run, and keep an honest per-section state — loading, answered,
 * failed — as each section streams in (Spotlight fills sections as they
 * arrive; nothing waits for the slowest lane).
 */

import { useEffect, useRef, useState } from "react";
import {
  KNOWLEDGE_SECTION_KEYS,
  searchKnowledge,
  type KnowledgeQuery,
  type KnowledgeSearchEngine,
  type KnowledgeSearchRunner,
  type KnowledgeSection,
  type KnowledgeSectionKey,
} from "@/features/knowledge/api/knowledgeSearch";

export const AS_YOU_TYPE_DEBOUNCE_MS = 120;

export interface SectionState {
  status: "idle" | "loading" | "ready" | "error";
  /** Last answer for this section (kept while re-loading, so rows don't flash). */
  section: KnowledgeSection | null;
  /** Set when status is `error`. */
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

export function useKnowledgeSearchStream(
  runner: KnowledgeSearchRunner = searchKnowledge,
) {
  const [sections, setSections] = useState<SectionStates>(() =>
    allSections({ status: "idle", section: null }),
  );
  const [engine, setEngine] = useState<KnowledgeSearchEngine | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const seq = useRef(0);
  const lastQuery = useRef<KnowledgeQuery | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      controller.current?.abort();
    },
    [],
  );

  const run = (query: KnowledgeQuery, asYouType: boolean) => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    const mine = ++seq.current;
    lastQuery.current = query;
    const arrived = new Set<KnowledgeSectionKey>();
    setSections((prev) =>
      Object.fromEntries(
        KNOWLEDGE_SECTION_KEYS.map((k) => [
          k,
          { status: "loading", section: prev[k].section },
        ]),
      ) as SectionStates,
    );
    runner(query, {
      signal: ctrl.signal,
      asYouType,
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
            if (!arrived.has(k) && next[k].status === "loading") {
              next[k] = narrowed
                ? { status: "idle", section: null }
                : {
                    status: "error",
                    section: null,
                    message: "This section did not answer.",
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

  /** Typing: debounced, `as_you_type`. Submit: immediate, full lanes. */
  const search = (query: KnowledgeQuery, opts: { asYouType: boolean }) => {
    if (timer.current) clearTimeout(timer.current);
    if (opts.asYouType) {
      timer.current = setTimeout(
        () => run(query, true),
        AS_YOU_TYPE_DEBOUNCE_MS,
      );
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
