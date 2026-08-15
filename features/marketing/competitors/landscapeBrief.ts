/**
 * features/marketing/competitors/landscapeBrief.ts
 *
 * The client half of THE STAGED-CONFIDENCE PATTERN (FEATURE.md §8d).
 *
 * Reading is a direct Supabase read — it is a plain row and the browser has
 * RLS. Generating and ruling go to the Python server because one runs an agent
 * and the other must append to an audit trail the client cannot be trusted to
 * assemble.
 */

import type { Database } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";
import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";

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

export async function ruleOnLandscapeBrief(
  siteId: string,
  guidance: string,
  dispatch: AppDispatch,
  serviceLines?: ServiceLine[],
): Promise<void> {
  const result = await dispatch(callApi({
    path: "/seo/sites/{site_id}/landscape-brief/ruling",
    method: "POST",
    pathParams: { site_id: siteId },
    body: serviceLines
      ? { guidance, service_lines: serviceLines }
      : { guidance },
  }));
  if (result.error)
    throw new Error(result.error.message ?? "Could not save your corrections");
}

/** Find the rivals and classify them — without buying a full page-crawl autopsy. */
export async function discoverCompetitors(
  siteId: string,
  dispatch: AppDispatch,
): Promise<number> {
  const result = await dispatch(callApi({
    path: "/seo/sites/{site_id}/competitors/discover",
    method: "POST",
    pathParams: { site_id: siteId },
    body: {},
  }));
  if (result.error)
    throw new Error(result.error.message ?? "Competitor discovery failed");
  const payload = result.data as { count?: number } | null;
  return payload?.count ?? 0;
}
