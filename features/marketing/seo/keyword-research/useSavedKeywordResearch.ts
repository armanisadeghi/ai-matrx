"use client";

/**
 * useSavedKeywordResearch — THE one query for "the latest durable research
 * artifact for this keyword". Backs every surface that must remember a
 * completed run after remount (launcher, window, Keyword Intelligence tab):
 * the live stream is ephemeral, but the pipeline persisted the artifact to
 * `content_ir.kind_instance` — this hook reads it back.
 *
 * MSR-26 (Arman): keyword research belongs to a SITE, never the
 * organization — so the read this hook backs is site-scoped, through the
 * `content_ir_kind_instance` -> `web_site` binding in
 * `platform.associations` (see `data/queries.ts`).
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { normalizeKeywordPhrase } from "@/features/marketing/seo/keyword/data";

import { getLatestSavedKeywordResearch } from "./data/queries";

/** Query key shared with every consumer — invalidate THIS after a run lands. */
export function savedKeywordResearchQueryKey(
  siteId: string | null | undefined,
  phrase: string,
) {
  return [
    "seo",
    "keyword-research",
    "saved",
    siteId ?? null,
    normalizeKeywordPhrase(phrase),
  ] as const;
}

export function useSavedKeywordResearch(
  phrase: string,
  siteId: string | null | undefined,
  options?: { debounceMs?: number },
) {
  // Launcher hosts feed a live input — debounce so we don't query per keystroke.
  const debounceMs = options?.debounceMs ?? 0;
  const [debouncedPhrase, setDebouncedPhrase] = useState(phrase);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedPhrase(phrase), debounceMs);
    return () => clearTimeout(timer);
  }, [phrase, debounceMs]);
  const settledPhrase = debounceMs ? debouncedPhrase : phrase;

  const query = useQuery({
    queryKey: savedKeywordResearchQueryKey(siteId, settledPhrase),
    queryFn: ({ signal }) =>
      siteId
        ? getLatestSavedKeywordResearch(siteId, settledPhrase, signal)
        : Promise.resolve(null),
    enabled: Boolean(siteId && settledPhrase.trim()),
  });

  return { ...query, siteId: siteId ?? null, settledPhrase };
}
