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
import { formatFileSize, formatUsd } from "@ai-matrx/kit/format";

export type MandateReferenceRow =
  components["schemas"]["MandateReferenceRow"];
export type MandateReferenceReport =
  components["schemas"]["MandateReferenceReport"];
export type MandateReferenceBoard =
  components["schemas"]["MandateReferenceBoard"] & {
    /**
     * The scheduled patrol section. Declared here rather than read from
     * `components["schemas"]` for the reason spelled out at
     * `MandatePatrolSection` below — the generated file predates it.
     */
    patrol?: MandatePatrolSection | null;
  };
export type MandateReferenceBoardRepo = components["schemas"]["BoardRepo"];
export type MandateReferenceFinding = components["schemas"]["BoardFinding"];
export type MandateReferenceConversionRow =
  components["schemas"]["BoardConversionRow"];
/**
 * THE PATROL SECTION — the scheduled task's state and what each run cost.
 *
 * 🚨 HAND-DECLARED, AND SAYING SO. Every other type in this file is read from
 * `components["schemas"]`, which is the law here. These two cannot be: the
 * server already serves `patrol` on `GET /mandates/references/board`
 * (`aidream/services/mandates/references.py`, models `MandatePatrolSection` and
 * `PatrolRunRow`), but the checked-in `types/python-generated/api-types.ts`
 * predates it and regenerating that file is a separate, whole-repo change.
 * So this is a NAMED, temporary mirror of the server models, not a second
 * contract: the moment a regeneration lands, delete both declarations and go
 * back to `components["schemas"]["MandatePatrolSection"]` /
 * `["PatrolRunRow"]`. A field added on the server and not here shows up as a
 * missing column, never as a wrong number — nothing below computes anything.
 */
export type MandatePatrolRun = {
  run_id: string;
  status: string;
  due_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  wall_seconds: number | null;
  seconds_source: "recorded" | "derived_from_timestamps" | "unknown";
  cpu_seconds: number | null;
  vcpu_seconds: number | null;
  cpu_count_source: string | null;
  /** `null` means NO RATE IS CONFIGURED — never "free". See `NO_COST_CELL`. */
  compute_cost_usd: number | null;
  compute_cost_note: string | null;
  model_spend_usd: number | null;
  model_spend_evidence: string | null;
  revision: string | null;
  rows_submitted: number | null;
  findings: number | null;
  error_rows_filed: number | null;
  error_rows_resolved: number | null;
  error_rows_request_id: string | null;
  git_clone_bytes: number | null;
  spend_row: string | null;
  failed_legs: string[];
  summary: string | null;
  error_message: string | null;
  cost_recorded: boolean;
};

export type MandatePatrolSection = {
  tool_name: string;
  task_id: string;
  enabled: boolean;
  schedule: string | null;
  trigger_enabled: boolean;
  next_due_at: string | null;
  last_run_at: string | null;
  enabled_at: string | null;
  runs: MandatePatrolRun[];
  runs_counted: number;
  runs_failed: number;
  cumulative_wall_seconds: number;
  cumulative_vcpu_seconds: number;
  cumulative_compute_cost_usd: number | null;
  cumulative_model_spend_usd: number;
  cost_note: string;
  /** Present only when the scheduler ledger could not be read. */
  read_error?: string | null;
};
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

/**
 * THE COST CELL. `null` means NO RATE IS CONFIGURED — it does NOT mean free, and
 * this is the one place that decides how that reads on screen. Arman, 2026-09-17,
 * on turning the 4-hourly patrol on: *"if there is a cost, make sure it's tracked
 * and easy for me to see"* — a "$0.00" in this column would be the lie that makes
 * the whole table worthless.
 */
export const NO_COST_CELL = "no rate set";

/**
 * AN OPTION-BINDING WRAPPER over `@ai-matrx/kit/format`. What it binds is the
 * sentence above: an unrated row says "no rate set", never "$0.00".
 * `digits: "adaptive"` is the package's version of the sub-cent branch this
 * body carried by hand.
 */
/**
 * AN OPTION-BINDING WRAPPER over `@ai-matrx/kit/format`'s formatUsd, and named
 * for the CELL rather than the capability on purpose: a local `formatUsd` is a
 * twin of the package export under its own spelling, and importing the package
 * one under a second name takes every call site outside the guards that judge
 * it. What this binds is the sentence above — an unrated row says "no rate
 * set", never "$0.00" — plus the sub-cent precision the old body branched for
 * by hand.
 */
export function costCell(usd: number | null | undefined): string {
  return formatUsd(usd, { digits: "adaptive", unknown: NO_COST_CELL });
}

export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds - minutes * 60)}s`;
}

/**
 * Where a run's filed defects live. The System Errors page deep-links by
 * `request_id`, and the patrol records the EXACT id the scanner filed its rows
 * under — so this link lands on that run's own rows, never an unfiltered list
 * that merely looks like evidence.
 */
export function errorRowsHref(run: MandatePatrolRun): string | null {
  if (!run.error_rows_request_id) return null;
  const params = new URLSearchParams({
    kind: "mandate_reference_defect",
    request_id: run.error_rows_request_id,
    hours: "720",
  });
  return `/administration/utilities/system-errors?${params.toString()}`;
}
