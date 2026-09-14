/**
 * features/marketing/competitors/landscapeBrief.ts
 *
 * The client half of THE STAGED-CONFIDENCE PATTERN (FEATURE.md §8d).
 *
 * Reading AND ruling go direct to Supabase — both are pure UI↔DB work, and this
 * repo's data-flow law says those never take a hop through Python. Only the two
 * calls that genuinely need the server go there: generating the brief runs an
 * agent, and discovery spends money at a provider.
 */

import { callApi } from "@/lib/api/call-api";
import { adoptForeignStream } from "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream";
import {
  describeBackendFailure,
  parseCallApiError,
  parseStreamError,
} from "@/lib/api/errors";
import { isErrorEvent, type TypedStreamEvent } from "@/lib/api/types";
import { isJsonObject } from "@/types/json";
import type { AppDispatch } from "@/lib/redux/store";

export interface LocalBusinessResult {
  position: number | null;
  name: string;
  domain: string | null;
  website: string | null;
  address: string | null;
  phone: string | null;
  category: string | null;
  rating: number | null;
  reviews: number | null;
  is_own: boolean;
  competitor_id: string | null;
}

export interface LocalCompetitorSearchResult {
  keyword: string;
  canonical_location: string;
  businesses: LocalBusinessResult[];
  competitor_ids: string[];
  count: number;
}

/**
 * The ONE way this surface runs a durable SEO discovery command.
 *
 * Both discovery paths are slow by nature — a provider call plus a
 * classification pass per result — and both outlived `callApi`'s request
 * budget while the server completed fine (27s measured; every classic
 * discovery run ever recorded was left abandoned). So both stream: the client
 * adopts the run's stream, reports each stage, and reads the result document
 * off the run's final event.
 */
async function runSeoDiscoveryStream<T>({
  siteId,
  dispatch,
  path,
  body,
  finalKind,
  stages,
  onStage,
  fallbackError,
}: {
  siteId: string;
  dispatch: AppDispatch;
  path: "/seo/sites/{site_id}/competitors/discover" | "/seo/sites/{site_id}/competitors/discover-local";
  body: Record<string, unknown>;
  finalKind: string;
  stages: Record<string, string>;
  onStage?: (stage: string) => void;
  fallbackError: string;
}): Promise<T> {
  let finalResult: T | null = null;
  let streamError: string | null = null;
  const abortController = new AbortController();
  const consumeStream = dispatch(
    adoptForeignStream({
      abortController,
      onEvent: (event: TypedStreamEvent) => {
        if (isErrorEvent(event)) {
          streamError = describeBackendFailure(parseStreamError(event.data)).headline;
          return;
        }
        if (event.event !== "data") return;
        const data: unknown = event.data;
        if (!isJsonObject(data)) return;
        const kind = typeof data.kind === "string" ? data.kind : "";
        const stage = stages[kind];
        if (stage) onStage?.(stage);
        // The two terminal kinds that carry no result. Without these the run
        // ends with no final event and the caller reports the useless "returned
        // no result" instead of what actually happened.
        if (kind === "seo.command_failed") {
          const error = isJsonObject(data.error) ? data.error : null;
          streamError =
            (typeof error?.message === "string" && error.message) || fallbackError;
          return;
        }
        if (kind === "seo.run_in_progress") {
          streamError =
            "This search is already running — give it a moment, then refresh to see the results.";
          return;
        }
        if (kind === finalKind) {
          // run_streamed_command emits the persisted result document; a replayed
          // (already-completed) run carries the same shape.
          const payload = isJsonObject(data.result) ? data.result : data;
          finalResult = payload as unknown as T;
        }
      },
    }),
  );
  const result = await dispatch(
    callApi({
      path,
      method: "POST",
      pathParams: { site_id: siteId },
      body,
      stream: true,
      consumeStream,
      signal: abortController.signal,
    }),
  );
  if (streamError) throw new Error(streamError);
  if (result.error) {
    throw new Error(
      describeBackendFailure(parseCallApiError(result.error)).headline ?? fallbackError,
    );
  }
  // No final event and no error event: the run either never reported back or
  // the response was not the stream this client expects. Say something the
  // person reading it can act on — never the developer sentence.
  if (!finalResult)
    throw new Error(
      "The search ran but its results never came back. Nothing was charged twice — try it again in a moment.",
    );
  return finalResult;
}

/** Search Google's local pack for a keyword in a geographic area and propose
 *  every business with a website as a competitor. The primary discovery path
 *  for local businesses — the literal map-pack rivals, not keyword overlap. */
export async function discoverLocalCompetitors(
  siteId: string,
  keyword: string,
  location: string,
  dispatch: AppDispatch,
  onStage?: (stage: string) => void,
): Promise<LocalCompetitorSearchResult> {
  return runSeoDiscoveryStream<LocalCompetitorSearchResult>({
    siteId,
    dispatch,
    path: "/seo/sites/{site_id}/competitors/discover-local",
    body: { keyword, location },
    finalKind: "seo.local_competitors_completed",
    stages: {
      "seo.local_search_started": "Running the local search",
      "seo.local_search_completed": "Reading who Google shows",
      "seo.local_competitors_persisted": "Proposing each business",
    },
    onStage,
    fallbackError: "Local competitor search failed",
  });
}

/** Find the rivals and classify them — without buying a full page-crawl autopsy. */
export async function discoverCompetitors(
  siteId: string,
  dispatch: AppDispatch,
  onStage?: (stage: string) => void,
): Promise<number> {
  return runSeoDiscoveryStream<{ count?: number }>({
    siteId,
    dispatch,
    path: "/seo/sites/{site_id}/competitors/discover",
    body: {},
    finalKind: "seo.competitors_discovered",
    stages: {
      "seo.competitor_discovery_started": "Reading your own search results",
      "seo.competitor_discovery_completed": "Weighing the overlap",
      "seo.competitors_persisted": "Proposing each rival",
    },
    onStage,
    fallbackError: "Competitor discovery failed",
  }).then((payload) => payload.count ?? 0);
}

/**
 * SerpAPI's canonical place names are comma-joined with NO spaces
 * (`Irvine,California,United States`) — a provider wire format, not English.
 * Never render the raw value to a person (mirrors aidream's
 * `competitor_autopsy.humanize_location`).
 */
export function humanizeLocation(canonical: string | null | undefined): string {
  if (!canonical) return "the requested area";
  return canonical
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}
