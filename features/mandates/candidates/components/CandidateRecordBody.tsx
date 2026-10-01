"use client";

/**
 * The ONE lazy edge for both candidate record bodies. The type map
 * (`item-presentation/registry.tsx`) is imported by every item card in the
 * app, so the bodies — and the markdown pipeline they render answers through —
 * load only when a candidate record actually opens (code-splitting rule 3:
 * one edge per surface, static inside it).
 *
 * THE HEARTBEAT (V1 D3): an open pair or summary window re-reads its record
 * while work is in progress — a pair still queued or running, a candidate
 * still collecting — and stops once the candidate is terminal-for-now (ready,
 * promoted, discarded, cancelled; ../live.ts `candidateStillMoving`).
 */

import { useCallback, useState } from "react";
import { fetchCandidate, fetchCandidateRun } from "../api";
import { candidateStillMoving, pairStillMoving, useCandidatePollMs, useHeartbeat } from "../live";
import { CandidateRunBody, type CandidateRunRow } from "./CandidateRunBody";
import { CandidateSummaryBody, type CandidateSummaryRow } from "./CandidateSummaryBody";

export type CandidateRecordBodyProps =
  | { kind: "run"; row: CandidateRunRow }
  | { kind: "summary"; row: CandidateSummaryRow };

export default function CandidateRecordBody(props: CandidateRecordBodyProps) {
  return props.kind === "run" ? <LiveRunBody row={props.row} /> : <LiveSummaryBody row={props.row} />;
}

function LiveRunBody({ row: loaded }: { row: CandidateRunRow }) {
  const [row, setRow] = useState(loaded);
  // V2 N1: the pair keeps re-reading until its CANDIDATE is terminal-for-now,
  // not merely until this pair finished — its verdict, and the candidate's
  // status and recommendation shown beside it, land after the pair completes.
  const working = pairStillMoving(row.run.status) || candidateStillMoving(row.candidate?.status);
  const pollMs = useCandidatePollMs(working);
  const beat = useCallback(async () => {
    const run = await fetchCandidateRun(row.run.id);
    const candidate = await fetchCandidate(run.candidate_id).then(
      (detail) => detail.candidate,
      () => row.candidate,
    );
    setRow({ run, candidate });
  }, [row.run.id, row.candidate]);
  useHeartbeat(working, pollMs, beat);
  return <CandidateRunBody row={row} />;
}

function LiveSummaryBody({ row: loaded }: { row: CandidateSummaryRow }) {
  const [row, setRow] = useState(loaded);
  const working =
    candidateStillMoving(row.candidate.status) || row.runs.some((run) => pairStillMoving(run.status));
  const pollMs = useCandidatePollMs(working);
  const beat = useCallback(async () => {
    const detail = await fetchCandidate(row.candidate.id);
    setRow({ candidate: detail.candidate, runs: detail.runs ?? [] });
  }, [row.candidate.id]);
  useHeartbeat(working, pollMs, beat);
  return <CandidateSummaryBody row={row} />;
}
