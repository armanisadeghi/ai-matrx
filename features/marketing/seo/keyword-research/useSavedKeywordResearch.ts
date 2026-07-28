"use client";

/**
 * useSavedKeywordResearch — THE one query for "the latest durable research
 * artifact for this keyword". Backs every surface that must remember a
 * completed run after remount (launcher, window, Keyword Intelligence tab):
 * the live stream is ephemeral, but the pipeline persisted the artifact to
 * `content_ir.kind_instance` — this hook reads it back.
 *
 * Org resolution mirrors callApi exactly (explicit override wins, else the
 * effective organization from appContext) so the org we READ saved research
 * from is always the org a run would WRITE to.
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { normalizeKeywordPhrase } from "@/features/marketing/seo/keyword/data";

import { getLatestSavedKeywordResearch } from "./data/queries";

/** Query key shared with every consumer — invalidate THIS after a run lands. */
export function savedKeywordResearchQueryKey(
  organizationId: string | null | undefined,
  phrase: string,
) {
  return [
    "seo",
    "keyword-research",
    "saved",
    organizationId ?? null,
    normalizeKeywordPhrase(phrase),
  ] as const;
}

export function useSavedKeywordResearch(
  phrase: string,
  explicitOrganizationId?: string | null,
  options?: { debounceMs?: number },
) {
  const effectiveOrgId = useAppSelector(selectEffectiveOrganizationId);
  const organizationId = explicitOrganizationId ?? effectiveOrgId ?? null;

  // Launcher hosts feed a live input — debounce so we don't query per keystroke.
  const debounceMs = options?.debounceMs ?? 0;
  const [debouncedPhrase, setDebouncedPhrase] = useState(phrase);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedPhrase(phrase), debounceMs);
    return () => clearTimeout(timer);
  }, [phrase, debounceMs]);
  const settledPhrase = debounceMs ? debouncedPhrase : phrase;

  const query = useQuery({
    queryKey: savedKeywordResearchQueryKey(organizationId, settledPhrase),
    queryFn: ({ signal }) =>
      organizationId
        ? getLatestSavedKeywordResearch(organizationId, settledPhrase, signal)
        : Promise.resolve(null),
    enabled: Boolean(organizationId && settledPhrase.trim()),
  });

  return { ...query, organizationId, settledPhrase };
}
