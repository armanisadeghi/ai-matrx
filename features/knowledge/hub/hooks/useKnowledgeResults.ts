"use client";

/**
 * Runs the ONE query through the ONE runner and keeps every typed section's
 * own state: loading (skeleton), ready, or failed (sentence + retry) — one
 * lane failing never blanks another (KNOWLEDGE-HUB §3). "Show all" pages ONE
 * section by its own cursor.
 *
 * `data: "sample"` swaps in the fixture runner; the page announces it.
 */

import { useEffect, useRef, useState } from "react";
import {
  KNOWLEDGE_SECTION_KEYS,
  KNOWLEDGE_SECTION_LABEL,
  searchKnowledge,
  resetKnowledgeSearchEngine,
  type KnowledgeQuery,
  type KnowledgeSearchEngine,
  type KnowledgeSearchRunner,
  type KnowledgeSection,
  type KnowledgeSectionKey,
} from "@/features/knowledge/api/knowledgeSearch";
import {
  findFixtureContainer,
  searchKnowledgeFixture,
} from "@/features/knowledge/api/knowledgeSearchFixture";
import { withMentionResolution } from "@/features/knowledge/api/mentionResolution";
import { normalizeQuery } from "@/features/knowledge/hub/hubState";

export interface SectionState {
  key: KnowledgeSectionKey;
  status: "loading" | "ready" | "error";
  section: KnowledgeSection | null;
  loadingMore: boolean;
  moreError: string | null;
}

export interface KnowledgeResults {
  sections: SectionState[];
  engine: KnowledgeSearchEngine | null;
  /** True while the first answer for the current query is still arriving. */
  loading: boolean;
  showMore: (key: KnowledgeSectionKey) => void;
  retry: (key: KnowledgeSectionKey) => void;
  /** Run the whole query again (after a write changed what it returns). */
  refresh: () => void;
}

export const SECTION_DID_NOT_ANSWER =
  "This section did not answer. The search service sent nothing for it.";

function initial(): SectionState[] {
  return KNOWLEDGE_SECTION_KEYS.map((key) => ({
    key,
    status: "loading",
    section: null,
    loadingMore: false,
    moreError: null,
  }));
}

function toState(key: KnowledgeSectionKey, s: KnowledgeSection | undefined): SectionState {
  if (!s)
    return {
      key,
      status: "error",
      section: {
        key,
        label: KNOWLEDGE_SECTION_LABEL[key],
        count: null,
        items: [],
        next_cursor: null,
        error: { message: SECTION_DID_NOT_ANSWER, retryable: true },
      },
      loadingMore: false,
      moreError: null,
    };
  return {
    key,
    status: s.error ? "error" : "ready",
    section: s,
    loadingMore: false,
    moreError: null,
  };
}

function describe(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "The search failed and did not say why.";
}

// `@name` resolves to a container (or an entity) before any runner sees it.
const LIVE_RUNNER = withMentionResolution(searchKnowledge);
const SAMPLE_RUNNER = withMentionResolution(searchKnowledgeFixture, findFixtureContainer);

export function runnerFor(data: "live" | "sample"): KnowledgeSearchRunner {
  return data === "sample" ? SAMPLE_RUNNER : LIVE_RUNNER;
}

export function useKnowledgeResults(
  query: KnowledgeQuery,
  data: "live" | "sample",
  runnerOverride?: KnowledgeSearchRunner,
): KnowledgeResults {
  const runner = runnerOverride ?? runnerFor(data);
  const normalized = normalizeQuery(query);
  const key = `${data}|${JSON.stringify(normalized)}`;
  const [sections, setSections] = useState<SectionState[]>(initial);
  const [engine, setEngine] = useState<KnowledgeSearchEngine | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const queryRef = useRef(normalized);
  queryRef.current = normalized;

  useEffect(() => {
    const ctrl = new AbortController();
    setSections(initial());
    setLoading(true);
    const q = queryRef.current;
    runner(q, {
      signal: ctrl.signal,
      onEngine: (e) => {
        if (!ctrl.signal.aborted) setEngine(e);
      },
      onSection: (s) => {
        if (ctrl.signal.aborted) return;
        setSections((prev) => prev.map((p) => (p.key === s.key ? toState(s.key, s) : p)));
      },
    })
      .then((all) => {
        if (ctrl.signal.aborted) return;
        if (data === "sample") setEngine("fixture");
        const byKey = new Map(all.map((s) => [s.key, s]));
        setSections((prev) =>
          prev.map((p) =>
            p.status === "loading" ? toState(p.key, byKey.get(p.key)) : p,
          ),
        );
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        const message = describe(err);
        setSections((prev) =>
          prev.map((p) =>
            p.status === "loading"
              ? {
                  ...toState(p.key, undefined),
                  section: {
                    key: p.key,
                    label: KNOWLEDGE_SECTION_LABEL[p.key],
                    count: null,
                    items: [],
                    next_cursor: null,
                    error: { message, retryable: true },
                  },
                }
              : p,
          ),
        );
        setLoading(false);
      });
    return () => ctrl.abort();
    // `key` is the normalized query + data source: a new key is a new search.
  }, [key, runner, data, tick]);

  const showMore = (sectionKey: KnowledgeSectionKey) => {
    const current = sections.find((s) => s.key === sectionKey);
    const cursor = current?.section?.next_cursor;
    if (!current || !cursor || current.loadingMore) return;
    setSections((prev) =>
      prev.map((p) => (p.key === sectionKey ? { ...p, loadingMore: true, moreError: null } : p)),
    );
    runner({ ...queryRef.current, cursors: { [sectionKey]: cursor } })
      .then((all) => {
        const page = all.find((s) => s.key === sectionKey);
        setSections((prev) =>
          prev.map((p) => {
            if (p.key !== sectionKey || !p.section) return p;
            if (!page || page.error)
              return {
                ...p,
                loadingMore: false,
                moreError: page?.error?.message ?? SECTION_DID_NOT_ANSWER,
              };
            const seen = new Set(p.section.items.map((i) => `${i.entity}:${i.id}`));
            return {
              ...p,
              loadingMore: false,
              section: {
                ...p.section,
                items: [
                  ...p.section.items,
                  ...page.items.filter((i) => !seen.has(`${i.entity}:${i.id}`)),
                ],
                next_cursor: page.next_cursor,
              },
            };
          }),
        );
      })
      .catch((err: unknown) => {
        setSections((prev) =>
          prev.map((p) =>
            p.key === sectionKey ? { ...p, loadingMore: false, moreError: describe(err) } : p,
          ),
        );
      });
  };

  const retry = (sectionKey: KnowledgeSectionKey) => {
    if (engine !== "fixture") resetKnowledgeSearchEngine();
    setSections((prev) =>
      prev.map((p) => (p.key === sectionKey ? { ...p, status: "loading", section: null } : p)),
    );
    runner(queryRef.current)
      .then((all) => {
        setSections((prev) =>
          prev.map((p) => (p.key === sectionKey ? toState(sectionKey, all.find((s) => s.key === sectionKey)) : p)),
        );
      })
      .catch((err: unknown) => {
        const message = describe(err);
        setSections((prev) =>
          prev.map((p) =>
            p.key === sectionKey
              ? {
                  ...toState(sectionKey, undefined),
                  section: {
                    key: sectionKey,
                    label: KNOWLEDGE_SECTION_LABEL[sectionKey],
                    count: null,
                    items: [],
                    next_cursor: null,
                    error: { message, retryable: true },
                  },
                }
              : p,
          ),
        );
      });
  };

  return { sections, engine, loading, showMore, retry, refresh: () => setTick((n) => n + 1) };
}
