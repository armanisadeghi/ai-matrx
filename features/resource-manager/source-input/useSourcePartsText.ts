"use client";

/**
 * useSourcePartsSearch — which of one Source's parts hold every word a person
 * typed, answered by the server.
 *
 * The manifest never carries bodies (only each part's opening words, A5), so a
 * word that sits deep inside a part is found by `POST /sources/parts/search`:
 * the server walks the manifest's own parts (same ids, same access check) and
 * returns only the ids that match. Nothing but ids crosses the wire, and
 * nothing is cached beyond this hook's state.
 *
 * Asked only when the query is words (never a page or a range), after the
 * person pauses typing.
 */

import { useEffect, useState } from "react";
import { createSourceRef, type SourceRef } from "@ai-matrx/agents/sources";
import { searchSourceParts } from "./sourceSetApi";
import { isWordQuery, type PartMatchIds } from "./partsSearch";

/** How long typing must pause before the server is asked. */
const SEARCH_DEBOUNCE_MS = 250;

const COULD_NOT_SEARCH =
  "Only part titles and opening words are searched — the full text could not be searched just now.";

export interface SourcePartsSearchState {
  /** Ids of the parts whose text holds every word (undefined until answered). */
  matches: PartMatchIds | undefined;
  /** The server is being asked about the current words ("Searching inside the text…"). */
  reading: boolean;
  /** Said under the search when the text could not be searched (titles and previews still match). */
  error: string | null;
  /** More parts matched than the server returns; the list shown is the first of them. */
  truncated: boolean;
}

export function useSourcePartsSearch(ref: SourceRef | null, query: string): SourcePartsSearchState {
  const [state, setState] = useState<{
    key: string;
    matches?: PartMatchIds;
    truncated?: boolean;
    error?: string;
  } | null>(null);
  const resourceType = ref?.resource_type ?? "";
  const resourceId = ref?.resource_id ?? "";
  const representation = ref?.representation ?? undefined;
  const words = isWordQuery(query) ? query.trim().toLowerCase().split(/\s+/).join(" ") : "";
  const key =
    resourceId && words ? `${resourceType}:${resourceId}:${representation ?? ""}:${words}` : null;

  useEffect(() => {
    if (!key) return undefined;
    // The whole Source in the chosen form: the person's picked parts never narrow a search.
    const whole = createSourceRef(resourceType, resourceId, { representation });
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchSourceParts(whole, words, { signal: controller.signal })
        .then((found) => {
          if (controller.signal.aborted) return;
          if (found.unavailable) {
            setState({
              key,
              error: `Only part titles and opening words are searched — ${
                found.detail ?? "the full text could not be searched."
              }`,
            });
            return;
          }
          setState({ key, matches: new Set(found.segment_ids ?? []), truncated: !!found.truncated });
        })
        .catch(() => {
          if (!controller.signal.aborted) setState({ key, error: COULD_NOT_SEARCH });
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, resourceType, resourceId, representation, words]);

  const mine = key && state && state.key === key ? state : null;
  return {
    matches: mine?.matches,
    reading: !!key && !mine,
    error: mine?.error ?? null,
    truncated: mine?.truncated ?? false,
  };
}
