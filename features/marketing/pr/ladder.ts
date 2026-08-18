/**
 * The evidence ladder — `proof_required` × `missing_evidence` × `evidence_refs`
 * joined by key into rungs that count UP.
 *
 * THE HONEST HEART of the product, and the reason it counts up rather than
 * down: BACKEND FACT 1 means an angle with work to do is the COMMON case, not
 * the exception. The producer only ever emits `pitch_now` for an angle with no
 * missing evidence, no unmet proof requirement, no contradiction and
 * `evidence_quality >= 50`; everything else arrives as `develop_evidence` with
 * `requires_human_review = true`. A surface that painted that as a backlog of
 * errors would paint a healthy account red. So: "3 of 4 in hand", "One thing
 * away from pitchable" — momentum, never failure.
 *
 * Three honesty rules the join enforces:
 *  1. A proof marked satisfied with NO artefact behind it says so instead of
 *     rendering a tick it did not earn.
 *  2. jsonb entries the readers could not parse are COUNTED and surfaced, never
 *     silently dropped.
 *  3. A gap named in `missing_evidence` that was never listed in
 *     `proof_required` is still a gap and still gets a rung.
 */

import {
  readEvidenceRefs,
  readMissingEvidence,
  readProofRequired,
  type EvidenceRef,
  type MissingEvidenceItem,
  type ProofKind,
  type StoryAngle,
} from "@/features/marketing/pr/types";

export interface LadderRung {
  key: string;
  label: string;
  kind: ProofKind;
  note: string | null;
  /** Present when this proof is still outstanding. Carries its own fix. */
  missing: MissingEvidenceItem | null;
  /** Present when an artefact is linked. Absent + not missing = unearned tick. */
  evidence: EvidenceRef | null;
}

export interface LadderRead {
  rungs: LadderRung[];
  /** Rungs with no outstanding gap. */
  held: number;
  total: number;
  /** Rungs held but with no artefact linked — a tick we did not earn. */
  unevidenced: number;
  /** jsonb entries no reader could understand, across all three columns. */
  malformed: number;
  /** Those entries verbatim, so their content is shown rather than dropped. */
  malformedRaw: string[];
}

export function readLadder(angle: StoryAngle): LadderRead {
  const proof = readProofRequired(angle.proof_required);
  const missing = readMissingEvidence(angle.missing_evidence);
  const refs = readEvidenceRefs(angle.evidence_refs);

  const missingByKey = new Map(missing.items.map((item) => [item.key, item]));
  const refsByKey = new Map(refs.items.map((item) => [item.key, item]));

  const rungs: LadderRung[] = proof.items.map((item) => {
    const named = missingByKey.get(item.key) ?? null;
    /**
     * An explicit `satisfied: false` on the requirement is a gap even when
     * `missing_evidence` never named it. Silence is different: silence lets
     * `missing_evidence` decide. A requirement the payload says is NOT met must
     * never render as a green tick.
     */
    const declaredGap =
      named === null && item.satisfied === false
        ? {
            key: item.key,
            label: item.label,
            how_to_get:
              "Recorded as not yet satisfied, with no path attached. Ask whoever owns this requirement what would close it.",
            owner: "you" as const,
            effort: "medium" as const,
          }
        : null;
    return {
      key: item.key,
      label: item.label,
      kind: item.kind,
      note: item.note,
      missing: named ?? declaredGap,
      evidence: refsByKey.get(item.key) ?? null,
    };
  });

  // A gap the analysis named without listing it as a required proof is still a
  // gap. Dropping it would hide the honest part.
  for (const item of missing.items) {
    if (rungs.some((rung) => rung.key === item.key)) continue;
    rungs.push({
      key: item.key,
      label: item.label,
      kind: "document",
      note: null,
      missing: item,
      evidence: null,
    });
  }

  // `evidence_refs` is NOT NULL and non-empty on every real row, and a
  // `pitch_now` angle has an EMPTY `proof_required` (backend fact 1). Without
  // this pass the strongest angles on the page would show an empty ladder.
  for (const item of refs.items) {
    if (rungs.some((rung) => rung.key === item.key)) continue;
    rungs.push({
      key: item.key,
      label: item.label,
      kind: "document",
      note: null,
      missing: null,
      evidence: item,
    });
  }

  const held = rungs.filter((rung) => rung.missing === null).length;
  const unevidenced = rungs.filter(
    (rung) => rung.missing === null && rung.evidence === null,
  ).length;

  return {
    rungs,
    held,
    total: rungs.length,
    unevidenced,
    malformed: proof.malformed + missing.malformed + refs.malformed,
    malformedRaw: [
      ...proof.malformedRaw,
      ...missing.malformedRaw,
      ...refs.malformedRaw,
    ],
  };
}

export type LadderTone = "ready" | "close" | "work" | "none";

/** The one line that decides whether a gap feels like momentum or like failure. */
export function ladderVerdict(read: LadderRead): {
  text: string;
  tone: LadderTone;
} {
  if (read.total === 0) {
    return {
      text: "No proof requirements recorded for this angle yet.",
      tone: "none",
    };
  }
  const gaps = read.total - read.held;
  if (gaps === 0) {
    return {
      text: "Every proof a journalist will ask for is already in hand.",
      tone: "ready",
    };
  }
  if (gaps === 1) return { text: "One thing away from pitchable.", tone: "close" };
  return { text: `${gaps} things away from pitchable.`, tone: "work" };
}

/** 0–100 progress along the ladder. 100 when nothing is outstanding. */
export function ladderPercent(read: LadderRead): number {
  if (read.total === 0) return 100;
  return Math.round((read.held / read.total) * 100);
}
