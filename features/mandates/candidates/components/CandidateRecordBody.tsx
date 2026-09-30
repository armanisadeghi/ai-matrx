"use client";

/**
 * The ONE lazy edge for both candidate record bodies. The type map
 * (`item-presentation/registry.tsx`) is imported by every item card in the
 * app, so the bodies — and the markdown pipeline they render answers through —
 * load only when a candidate record actually opens (code-splitting rule 3:
 * one edge per surface, static inside it).
 */

import { CandidateRunBody, type CandidateRunRow } from "./CandidateRunBody";
import { CandidateSummaryBody, type CandidateSummaryRow } from "./CandidateSummaryBody";

export type CandidateRecordBodyProps =
  | { kind: "run"; row: CandidateRunRow }
  | { kind: "summary"; row: CandidateSummaryRow };

export default function CandidateRecordBody(props: CandidateRecordBodyProps) {
  return props.kind === "run" ? (
    <CandidateRunBody row={props.row} />
  ) : (
    <CandidateSummaryBody row={props.row} />
  );
}
