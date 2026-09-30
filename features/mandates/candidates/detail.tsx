"use client";

/**
 * Mandate Candidates — the two Detail record registrations (PLAN §2.6, A3).
 *
 *   mandate_candidate_run  one pair: live vs candidate on one real run
 *   mandate_candidate      the N-pair summary with Promote / Put back / Discard
 *
 * Registered through `features/item-presentation/registry.tsx`'s `refineDetail`
 * seam (THE one type map), so each shows as window, docked panel and page
 * (`/detail/<type>/<id>`, `?panels=detail:<type>.<id>:as-window`) from ONE
 * registration. The rows come from the aidream doors, never from the tables:
 * the payload half (A2) is only readable through the server under the viewer's
 * own identity.
 *
 * `entityToken` is null on purpose: these are not association targets and the
 * row-version history of a queue row is not something a person reads.
 */

import { lazy, Suspense } from "react";
import type { DetailField, DetailLoadResult, DetailRecordType } from "@ai-matrx/detail";
import { formatWhen } from "@ai-matrx/detail";

import { BackendApiError } from "@/lib/api/errors";
import { mandateDisplayName } from "@/features/mandates/mandate-words";
import { storedMandateKey } from "@/features/mandates/mandate-key";

import { fetchCandidate, fetchCandidateRun } from "./api";
import type { CandidateRunRow } from "./components/CandidateRunBody";
import type { CandidateSummaryRow } from "./components/CandidateSummaryBody";
import { CANDIDATE_STATUS_WORD, doorWord, runOutcomeWord } from "./words";

const CandidateRecordBody = lazy(() => import("./components/CandidateRecordBody"));

function BodyFallback() {
  return <div className="h-40 animate-pulse rounded-lg bg-muted/50" aria-busy="true" />;
}

function isNotFound(error: unknown): boolean {
  return error instanceof BackendApiError && error.status === 404;
}

/** A load that fails says the server's own sentence, never a generic one. */
function loadError(error: unknown): Error {
  if (error instanceof BackendApiError) return new Error(error.userMessage);
  return error instanceof Error ? error : new Error(String(error));
}

async function loadRun(id: string): Promise<DetailLoadResult<CandidateRunRow>> {
  try {
    const run = await fetchCandidateRun(id);
    let candidate: CandidateRunRow["candidate"] = null;
    try {
      candidate = (await fetchCandidate(run.candidate_id)).candidate;
    } catch (error) {
      // The pair still reads without its candidate's names; the gap is loud.
      console.error("[mandate candidates] candidate read failed for pair", id, error);
    }
    return { row: { run, candidate } };
  } catch (error) {
    if (isNotFound(error)) return { notFound: true };
    throw loadError(error);
  }
}

async function loadSummary(id: string): Promise<DetailLoadResult<CandidateSummaryRow>> {
  try {
    const detail = await fetchCandidate(id);
    return { row: { candidate: detail.candidate, runs: detail.runs ?? [] } };
  } catch (error) {
    if (isNotFound(error)) return { notFound: true };
    throw loadError(error);
  }
}

function asRunRow(row: unknown): CandidateRunRow | null {
  const r = row as Partial<CandidateRunRow> | null;
  return r && r.run ? (r as CandidateRunRow) : null;
}

function asSummaryRow(row: unknown): CandidateSummaryRow | null {
  const r = row as Partial<CandidateSummaryRow> | null;
  return r && r.candidate ? (r as CandidateSummaryRow) : null;
}

function mandateName(key: string): string {
  return mandateDisplayName(storedMandateKey(key));
}

function runFields(row: CandidateRunRow): DetailField[] {
  const { run, candidate } = row;
  const fields: DetailField[] = [];
  if (candidate) fields.push({ key: "mandate", label: "Mandate", text: mandateName(candidate.mandate_key) });
  fields.push({ key: "outcome", label: "Outcome", text: runOutcomeWord(run) });
  fields.push({ key: "door", label: "Started from", text: doorWord(run.door) });
  fields.push({ key: "when", label: "Ran", text: formatWhen(run.created_at) });
  return fields;
}

function summaryFields(row: CandidateSummaryRow): DetailField[] {
  const { candidate } = row;
  return [
    { key: "mandate", label: "Mandate", text: mandateName(candidate.mandate_key) },
    { key: "status", label: "Status", text: CANDIDATE_STATUS_WORD[candidate.status] },
    { key: "set", label: "Set", text: formatWhen(candidate.created_at) },
  ];
}

export function refineCandidateRunDetail(base: DetailRecordType): DetailRecordType {
  return {
    ...base,
    entityToken: null,
    associationTokens: null,
    history: false,
    health: null,
    load: (id) => loadRun(id),
    title: (row, seed) => {
      const r = asRunRow(row);
      if (r?.candidate) return `${mandateName(r.candidate.mandate_key)} — run ${r.run.number}`;
      if (r) return `Candidate run ${r.run.number}`;
      return seed?.name?.trim() || "Candidate run";
    },
    fields: (row) => {
      const r = asRunRow(row);
      return r ? runFields(r) : [];
    },
    extraSections: (row) => {
      const r = asRunRow(row);
      if (!r) return [];
      return [
        {
          id: "mandate-candidate-run",
          label: "Comparison",
          content: (
            <Suspense fallback={<BodyFallback />}>
              <CandidateRecordBody key={r.run.id} kind="run" row={r} />
            </Suspense>
          ),
        },
      ];
    },
  };
}

export function refineCandidateDetail(base: DetailRecordType): DetailRecordType {
  return {
    ...base,
    entityToken: null,
    associationTokens: null,
    history: false,
    health: null,
    load: (id) => loadSummary(id),
    title: (row, seed) => {
      const r = asSummaryRow(row);
      if (r) return `${mandateName(r.candidate.mandate_key)} — candidate`;
      return seed?.name?.trim() || "Mandate candidate";
    },
    fields: (row) => {
      const r = asSummaryRow(row);
      return r ? summaryFields(r) : [];
    },
    extraSections: (row) => {
      const r = asSummaryRow(row);
      if (!r) return [];
      return [
        {
          id: "mandate-candidate",
          label: "Candidate",
          content: (
            <Suspense fallback={<BodyFallback />}>
              <CandidateRecordBody key={r.candidate.id} kind="summary" row={r} />
            </Suspense>
          ),
        },
      ];
    },
  };
}
