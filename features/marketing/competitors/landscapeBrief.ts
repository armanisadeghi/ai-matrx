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

import type { Database } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";
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
import { guardedUpdate, type GuardedUpdateResult } from "@/utils/supabase/guardedUpdate";

export type LandscapeBriefRow =
  Database["seo"]["Tables"]["landscape_brief"]["Row"];

/** One service with its OWN footprint — the reason a footprint is not a
 *  property of a company (FEATURE.md §8a). */
export interface ServiceLine {
  name: string;
  customer_segment?: string;
  footprint?: string;
  footprint_detail?: string;
  why?: string;
}

export function serviceLinesOf(row: LandscapeBriefRow | null): ServiceLine[] {
  if (!row || !Array.isArray(row.service_lines)) return [];
  return (row.service_lines as unknown[]).filter(
    (item): item is ServiceLine =>
      typeof item === "object" && item !== null && "name" in item,
  );
}

export function openQuestionsOf(row: LandscapeBriefRow | null): string[] {
  const facts = row?.facts as { open_questions?: unknown } | null;
  return Array.isArray(facts?.open_questions)
    ? facts.open_questions.filter((q): q is string => typeof q === "string")
    : [];
}

/**
 * What the review deadline means right now, in the words the UI shows.
 *
 * The deadline is not a threat and not a countdown to losing the work — it is
 * the promise that the pipeline will not stall on an unread approval. Say that
 * plainly: after it lapses the assumptions simply stand, and a later correction
 * still overrides them.
 */
export function reviewDeadlineNote(
  row: LandscapeBriefRow | null,
  now: number = Date.now(),
): string | null {
  if (!row) return null;
  if (row.status === "confirmed") return null;
  if (row.status === "auto_accepted")
    return "Nobody reviewed this in time, so the system carried on using these assumptions. Correcting it now still overrides them everywhere.";
  if (!row.auto_accept_at) return null;
  const remainingMs = new Date(row.auto_accept_at).getTime() - now;
  if (remainingMs <= 0)
    return "The review window has lapsed — the system is now working from these assumptions. Correcting them still overrides everything downstream.";
  const hours = Math.floor(remainingMs / 3_600_000);
  const minutes = Math.max(1, Math.round((remainingMs % 3_600_000) / 60_000));
  const left = hours >= 1 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return `You have ${left} to correct this. Nothing waits on you — after that the system just gets on with these assumptions, and you can still change them later.`;
}

export async function loadLandscapeBrief(
  siteId: string,
): Promise<LandscapeBriefRow | null> {
  const { data, error } = await supabase
    .schema("seo")
    .from("landscape_brief")
    .select("*")
    .eq("site_id", siteId)
    .neq("status", "superseded")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function generateLandscapeBrief(
  siteId: string,
  dispatch: AppDispatch,
): Promise<void> {
  const result = await dispatch(callApi({
    path: "/seo/sites/{site_id}/landscape-brief/generate",
    method: "POST",
    pathParams: { site_id: siteId },
    body: {},
  }));
  if (result.error)
    throw new Error(result.error.message ?? "Could not build the brief");
}

/**
 * Save the owner's correction. **Direct to Supabase, deliberately.**
 *
 * This is a pure UI↔DB write — no AI, no secrets, no provider spend — and this
 * repo's data-flow law is explicit that those go straight to Postgres under RLS
 * rather than through the Python server. It also means the single most important
 * interaction in the ground-truth session (his words becoming guidance) does not
 * depend on a backend deploy.
 *
 * `human_corrections` is an append, so the write is a compare-and-swap on the
 * canonical `version` column: two people correcting the same brief must not
 * silently drop one of the two corrections.
 */
export async function ruleOnLandscapeBrief(
  brief: LandscapeBriefRow,
  guidance: string,
  serviceLines?: ServiceLine[],
): Promise<GuardedUpdateResult<LandscapeBriefRow>> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sign in to correct this brief.");
  const now = new Date().toISOString();
  const corrections = Array.isArray(brief.human_corrections)
    ? [...(brief.human_corrections as unknown[])]
    : [];
  corrections.push({
    at: now,
    by: auth.user.id,
    guidance,
    prior_status: brief.status,
    prior_confidence: brief.agent_confidence,
  });
  const db = supabase.schema("seo");
  return guardedUpdate<LandscapeBriefRow>({
    expectedVersion: brief.version,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      db
        .from("landscape_brief")
        .update({
          guidance,
          human_corrections: corrections,
          status: "confirmed",
          reviewed_at: now,
          reviewed_by: auth.user.id,
          updated_at: now,
          version: nextVersion,
          ...(serviceLines ? { service_lines: serviceLines } : {}),
        })
        .eq("id", brief.id)
        .eq("version", expectedVersion)
        .select("*")
        .maybeSingle(),
    fetchCurrent: () =>
      db.from("landscape_brief").select("*").eq("id", brief.id).maybeSingle(),
  });
}

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
