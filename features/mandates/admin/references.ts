"use client";

/**
 * MANDATE REFERENCES — the client half of Declaration & Usage Reporting.
 *
 * Cross-repo system-of-record:
 * /Users/armanisadeghi/code/common-docs/projects/mandate-declaration-reporting/DESIGN.md §4.6
 * Ruling D21 (/Users/armanisadeghi/code/common-docs/systems/mandates/DECISIONS.md):
 * unreachable or broken is tracked exactly like real, plus a red flag —
 * nothing here filters a row out for being orphaned, unresolved, or broken.
 *
 * Two reads of ONE server report (aidream `services/mandates/references.py`,
 * fed by `mandate.reference` / `mandate.scan`):
 *
 *  * `fetchMandateReferences(dispatch, key)` — the Source & Usage tab's
 *    **Defined in** / **Used by** rows.
 *  * `fetchMandateReferenceBoard(dispatch)` — the admin fleet board at
 *    `/administration/mandates/references`.
 *
 * Nothing in this module re-derives a verdict. The flag, its sentence and its
 * remedy are the SERVER's words; a screen that invented its own would be a
 * second classification, and the two would drift.
 */

import { createClient } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import type { components } from "@/types/python-generated/api-types";

export type MandateReferenceRow =
  components["schemas"]["MandateReferenceRow"];
export type MandateReferenceReport =
  components["schemas"]["MandateReferenceReport"];
export type MandateReferenceBoard =
  components["schemas"]["MandateReferenceBoard"];
export type MandateReferenceBoardRepo = components["schemas"]["BoardRepo"];
export type MandateReferenceFinding = components["schemas"]["BoardFinding"];
export type MandateReferenceConversionRow =
  components["schemas"]["BoardConversionRow"];
export type RepoScanCompleteness =
  components["schemas"]["RepoScanCompleteness"];

/** A scan of a large repository is slow work; the tab must not give up early. */
const REFERENCES_CONNECT_TIMEOUT_MS = 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The report is narrowed at ingress, never trusted. A payload that is not the
 * report throws instead of rendering an empty, honest-LOOKING list — an empty
 * "Used by" caused by a bad response would read as "nothing uses this job",
 * which is exactly the lie D21 exists to prevent.
 */
export function isMandateReferenceReport(
  value: unknown,
): value is MandateReferenceReport {
  if (!isRecord(value)) return false;
  return (
    typeof value.mandate_key === "string" &&
    Array.isArray(value.defined_in) &&
    Array.isArray(value.used_by) &&
    Array.isArray(value.flags) &&
    isRecord(value.scan_completeness) &&
    Array.isArray(value.unscanned_repos) &&
    value.source === "mandate.reference"
  );
}

export function isMandateReferenceBoard(
  value: unknown,
): value is MandateReferenceBoard {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.repos) &&
    Array.isArray(value.conversion_list) &&
    typeof value.conversion_count === "number" &&
    Array.isArray(value.unverified_repos) &&
    value.source === "mandate.reference"
  );
}

export async function fetchMandateReferences(
  dispatch: AppDispatch,
  mandateKey: string,
): Promise<MandateReferenceReport> {
  // `callApi` obtains its bearer token independently. Establish the browser
  // session first so a transient guest state never reaches aidream as a 401.
  await requireAuthenticatedSupabaseSession(createClient());
  const response = await dispatch(
    callApi({
      // `pathParams` is the typed door — the templated path is a key of the
      // generated `paths` interface, so a route rename breaks the build here
      // rather than at runtime.
      path: "/mandates/{mandate_key}/references",
      method: "GET",
      pathParams: { mandate_key: mandateKey },
      connectTimeoutMs: REFERENCES_CONNECT_TIMEOUT_MS,
    }),
  );
  if (response.error) throw new Error(response.error.message);
  if (!isMandateReferenceReport(response.data)) {
    throw new Error("The mandate reference report came back in an unknown shape.");
  }
  return response.data;
}

export async function fetchMandateReferenceBoard(
  dispatch: AppDispatch,
): Promise<MandateReferenceBoard> {
  await requireAuthenticatedSupabaseSession(createClient());
  const response = await dispatch(
    callApi({
      path: "/mandates/references/board",
      method: "GET",
      connectTimeoutMs: REFERENCES_CONNECT_TIMEOUT_MS,
    }),
  );
  if (response.error) throw new Error(response.error.message);
  if (!isMandateReferenceBoard(response.data)) {
    throw new Error("The mandate reference board came back in an unknown shape.");
  }
  return response.data;
}

/**
 * The honest empty-state sentence. NEVER the word "unused": until every active
 * repository has a COMPLETE scan, silence means nobody looked, not that nobody
 * calls this job.
 */
export function unreportedSentence(report: MandateReferenceReport): string {
  const unscanned = report.unscanned_repos ?? [];
  if (unscanned.length === 0) {
    return "No references reported yet, though every repository has a complete scan.";
  }
  return `No references reported yet for ${formatRepoList(unscanned)}.`;
}

export function formatRepoList(repos: readonly string[]): string {
  const names = [...repos];
  if (names.length === 0) return "no repositories";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * `app.*` and `shortcut.*` keys genuinely have ONE consumption site. The tab
 * says so rather than letting a single row read as something missing.
 */
export const SINGLE_SITE_SENTENCE = "one consumption site by design";
