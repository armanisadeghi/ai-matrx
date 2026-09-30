"use client";

/**
 * THE two openers for Mandate Candidates records — F4 (list, tab, impact rows)
 * and the notification links all land on the same Detail records.
 *
 * Both go through the Detail primitive's ONE opener (`useOpenDetail`), so the
 * record opens the way the person opens records (window by default, docked or
 * page by their setting) and never moves the page they are on unless they chose
 * the page presentation.
 *
 * Call shape: `useOpenCandidateRun(runId?)` returns `(id?, seed?) => void`.
 * Bind the id at the hook (`useOpenCandidateRun(run.id)()`) or at the call
 * (`useOpenCandidateRun()(run.id)`) — a call with neither is a no-op that warns.
 */

import { useOpenDetail } from "@ai-matrx/detail/react";

export const CANDIDATE_RUN_DETAIL_TYPE = "mandate_candidate_run" as const;
export const CANDIDATE_DETAIL_TYPE = "mandate_candidate" as const;

export interface CandidateOpenSeed {
  name?: string | null;
  about?: string | null;
  /** The ordered ids of the list this was opened from, so `[` / `]` step through it. */
  siblings?: readonly string[];
}

function useOpenRecord(type: string, boundId: string | null | undefined) {
  const openDetail = useOpenDetail(type);
  return (id?: string | null, seed?: CandidateOpenSeed): void => {
    const target = id ?? boundId;
    if (!target) {
      console.warn(`[mandate candidates] open ${type} called without an id`);
      return;
    }
    const index = seed?.siblings ? seed.siblings.indexOf(target) : -1;
    void openDetail({
      type,
      id: target,
      seed: { name: seed?.name ?? null, about: seed?.about ?? null },
      list:
        seed?.siblings && index >= 0
          ? { items: seed.siblings.map((sid) => ({ type, id: sid })), index }
          : null,
    });
  };
}

/** Open one pair (`mandate_candidate_run`) as a Detail record. */
export function useOpenCandidateRun(runId?: string | null) {
  return useOpenRecord(CANDIDATE_RUN_DETAIL_TYPE, runId);
}

/** Open a candidate's N-pair summary (`mandate_candidate`) as a Detail record. */
export function useOpenCandidateSummary(candidateId?: string | null) {
  return useOpenRecord(CANDIDATE_DETAIL_TYPE, candidateId);
}
