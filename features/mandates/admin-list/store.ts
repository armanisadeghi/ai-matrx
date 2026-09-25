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
// Two phases: code truth + coverage first; the impact grades (the slowest
// read, which needs every holder agent id from the database) second, bumping
// `version` so the shell re-asks and the Grade/Blocker cells fill in.
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

export interface MandateAdminListState {
  status: "idle" | "loading" | "ready" | "failed";
  reports: MandateAdminReports;
  /** True once the impact read answered or failed (the Grade cells stop saying "loading"). */
  impactSettled: boolean;
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
  impactSettled: false,
  offersByProvision: new Map(),
  failures: {},
  error: null,
  version: 0,
};
let inflight: Promise<MandateAdminReports> | null = null;
let generation = 0;
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

async function loadReports(
  dispatch: AppDispatch,
  myGeneration: number,
): Promise<MandateAdminReports> {
  const failures: Record<string, string> = {};
  const [truth, coverage] = await Promise.allSettled([
    fetchMandateCodeTruthReport(dispatch),
    fetchMandateCoverage(dispatch),
  ]);
  if (truth.status === "rejected") failures.codeTruth = describe(truth.reason);
  if (coverage.status === "rejected") failures.coverage = describe(coverage.reason);
  const reports: MandateAdminReports = {
    codeTruth:
      truth.status === "fulfilled"
        ? Object.fromEntries(
            truth.value.mandates.map((s): [string, MandateCodeTruth] => [s.mandate_key, s]),
          )
        : null,
    coverage: coverage.status === "fulfilled" ? coverage.value : null,
    impact: null,
  };
  if (myGeneration !== generation) return reports;
  publish({ status: "ready", reports, failures, error: null, impactSettled: false });

  // ── Phase two: impact grades, over every holder agent in the corpus. ─────
  try {
    const agentIds = await callMandateAdminList<string[]>({ p_mode: "agents" });
    const impact =
      agentIds.length > 0
        ? await fetchStandingImpact(dispatch, [...agentIds].sort())
        : null;
    if (myGeneration !== generation) return reports;
    const graded = { ...reports, impact };
    publish({ reports: graded, impactSettled: true });
    return graded;
  } catch (error) {
    if (myGeneration !== generation) return reports;
    publish({
      impactSettled: true,
      failures: { ...state.failures, impact: describe(error) },
    });
    return reports;
  }
}

/**
 * The reports, loading them if nobody has yet. Resolves after PHASE ONE — the
 * list renders then; the grades land through `version`.
 */
export function ensureMandateAdminReports(
  dispatch: AppDispatch,
): Promise<MandateAdminReports> {
  if (state.status === "ready") return Promise.resolve(state.reports);
  if (inflight) return inflight;
  const myGeneration = ++generation;
  publish({ status: "loading", error: null });
  inflight = new Promise<MandateAdminReports>((resolve, reject) => {
    let settled = false;
    const unsubscribe = subscribeMandateAdminList(() => {
      if (settled || myGeneration !== generation) return;
      if (state.status === "ready") {
        settled = true;
        unsubscribe();
        resolve(state.reports);
      }
    });
    loadReports(dispatch, myGeneration).catch((error: unknown) => {
      unsubscribe();
      if (myGeneration !== generation) return;
      const failure = error instanceof Error ? error : new Error(describe(error));
      publish({ status: "failed", error: failure });
      if (!settled) {
        settled = true;
        reject(failure);
      }
    });
  }).finally(() => {
    inflight = null;
  });
  return inflight;
}

/**
 * Something changed (a write anywhere, a Remove, an advance): re-ask the list.
 * The database half is always fresh; `reloadReports` also drops the server
 * reports, for writes that change what they classify (a rebind, an advance).
 */
export function invalidateMandateAdminList(reloadReports = false): void {
  if (reloadReports) {
    generation += 1;
    inflight = null;
    publish({ status: "idle", impactSettled: false });
    return;
  }
  publish({});
}
