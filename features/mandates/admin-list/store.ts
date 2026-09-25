// features/mandates/admin-list/store.ts
//
// The aidream-server REPORTS behind the admin mandate list — never the corpus.
//
// Paging, sorting, filtering, search, tab counts and facets all run in the
// database (`public.mnd_admin_list`, ./service.ts). What the database cannot
// know is what the aidream server classifies across the whole platform: the
// live code declarations (`GET /mandates/code-truth`), coverage
// (`GET /mandates/coverage`) and the impact grades (graded per holder agent).
// Those are read ONCE per page visit into this module store; the service packs
// what a query needs into `p_facts` (./facts.ts), and each page's rows are
// built from them.
//
// 🚨 THE LIST NEVER WAITS FOR A REPORT. The database page paints first; the
// three reports load IN PARALLEL behind it, and each one that lands bumps
// `version` so the shell re-asks and that report's cells fill in. Until a
// report settles its cells say they are still being read (`settled[source]`
// false) — never blank, never a guessed verdict. (Measured 2026-09-25: the old
// order held the first row behind code truth + coverage.)
//
// A failed source is recorded in `failures` and its cells read as unknown —
// never as "none".

import type { AppDispatch } from "@/lib/redux/store";
import {
  fetchMandateCodeTruthReport,
  type MandateCodeTruth,
} from "@/features/mandates/admin/service";
import { fetchStandingImpact } from "@/features/mandates/admin/impact";
import { fetchMandateCoverage } from "@/features/mandates/coverage";
import type { MandateAdminReports } from "./facts";
import { callMandateAdminList } from "./rpc";

export type MandateAdminReportName = "codeTruth" | "coverage" | "impact";

const NOTHING_SETTLED: Record<MandateAdminReportName, boolean> = {
  codeTruth: false,
  coverage: false,
  impact: false,
};

export interface MandateAdminListState {
  status: "idle" | "loading" | "ready" | "failed";
  reports: MandateAdminReports;
  /**
   * Per report: true once it answered or failed. False = its cells still say
   * "checking" (the Grade cells, Coverage, Health's code verdict).
   */
  settled: Record<MandateAdminReportName, boolean>;
  /** Provision key → offered value names, for the Inputs cell (filled per page). */
  offersByProvision: Map<string, string[]>;
  /** Source name → its own error sentence. */
  failures: Record<string, string>;
  error: Error | null;
  /** Bumps on every change the list must re-ask for. */
  version: number;
}

const EMPTY_REPORTS: MandateAdminReports = {
  codeTruth: null,
  coverage: null,
  impact: null,
};

let state: MandateAdminListState = {
  status: "idle",
  reports: EMPTY_REPORTS,
  settled: NOTHING_SETTLED,
  offersByProvision: new Map(),
  failures: {},
  error: null,
  version: 0,
};
let generation = 0;
/**
 * Bumps on every invalidation (a write, a Remove, an advance). A report
 * landing does NOT bump it: the database half of the list did not change, so
 * the service may reuse the database answer it already holds (./service.ts).
 */
let dbEpoch = 0;

export function getMandateAdminDbEpoch(): number {
  return dbEpoch;
}
const listeners = new Set<() => void>();

function publish(next: Partial<MandateAdminListState>, bump = true) {
  state = { ...state, ...next, version: bump ? state.version + 1 : state.version };
  for (const listener of listeners) listener();
}

export function subscribeMandateAdminList(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getMandateAdminListState(): MandateAdminListState {
  return state;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Merge offers read for one page — never a re-ask (no version bump). */
export function mergeProvisionOffers(offers: Map<string, string[]>): void {
  if (offers.size === 0) return;
  const next = new Map(state.offersByProvision);
  for (const [key, values] of offers) next.set(key, values);
  publish({ offersByProvision: next }, false);
}

export function recordMandateAdminFailure(source: string, message: string): void {
  if (state.failures[source] === message) return;
  publish({ failures: { ...state.failures, [source]: message } }, false);
}

/** One report landed (or failed): publish it alone, so its cells fill now. */
function settle(
  myGeneration: number,
  source: MandateAdminReportName,
  outcome: { value: unknown } | { error: unknown },
): void {
  if (myGeneration !== generation) return;
  const settled = { ...state.settled, [source]: true };
  const allIn = settled.codeTruth && settled.coverage && settled.impact;
  if ("error" in outcome) {
    publish({
      settled,
      status: allIn ? "ready" : state.status,
      failures: { ...state.failures, [source]: describe(outcome.error) },
    });
    return;
  }
  publish({
    settled,
    status: allIn ? "ready" : state.status,
    reports: { ...state.reports, [source]: outcome.value },
  });
}

function track<T>(
  myGeneration: number,
  source: MandateAdminReportName,
  read: Promise<T>,
  shape: (value: T) => unknown,
): void {
  read.then(
    (value) => settle(myGeneration, source, { value: shape(value) }),
    (error: unknown) => settle(myGeneration, source, { error }),
  );
}

/** Start all three reports at once. Nothing awaits them. */
function startReports(dispatch: AppDispatch, myGeneration: number): void {
  track(myGeneration, "codeTruth", fetchMandateCodeTruthReport(dispatch), (report) =>
    Object.fromEntries(
      report.mandates.map((s): [string, MandateCodeTruth] => [s.mandate_key, s]),
    ),
  );
  track(myGeneration, "coverage", fetchMandateCoverage(dispatch), (report) => report);
  // The grades need every holder agent id from the database first — one
  // indexed read — then grade in bounded pages (features/mandates/admin/impact.ts).
  track(
    myGeneration,
    "impact",
    callMandateAdminList<string[]>({ p_mode: "agents" }).then((agentIds) =>
      agentIds.length > 0 ? fetchStandingImpact(dispatch, [...agentIds].sort()) : null,
    ),
    (impact) => impact,
  );
}

/**
 * The reports AS THEY STAND — starting the reads if nobody has yet. Never
 * waits: a page asked before a report lands is built without it and says so
 * per cell; the report's arrival bumps `version` and the page is asked again.
 */
export function ensureMandateAdminReports(
  dispatch: AppDispatch,
): Promise<MandateAdminReports> {
  if (state.status === "idle") {
    const myGeneration = ++generation;
    publish(
      { status: "loading", error: null, failures: {}, reports: EMPTY_REPORTS, settled: NOTHING_SETTLED },
      false,
    );
    startReports(dispatch, myGeneration);
  }
  return Promise.resolve(state.reports);
}

/**
 * Something changed (a write anywhere, a Remove, an advance): re-ask the list.
 * The database half is always fresh; `reloadReports` also drops the server
 * reports, for writes that change what they classify (a rebind, an advance).
 */
export function invalidateMandateAdminList(reloadReports = false): void {
  dbEpoch += 1;
  if (reloadReports) {
    generation += 1;
    // A write that changes what the reports classify makes the old ones wrong,
    // so their cells go back to "checking" rather than keep showing a verdict
    // the write just invalidated.
    publish({ status: "idle", settled: NOTHING_SETTLED, reports: EMPTY_REPORTS });
    return;
  }
  publish({});
}
