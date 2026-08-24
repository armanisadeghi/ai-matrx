/**
 * THE BLIND CHECK — pure logic for KI-032, the human-vs-AI verification loop.
 *
 * Arman's design (VISION.md, 2026-08-07): periodically an AI classifies
 * keywords BLIND — never shown the human's answer — and disagreements queue
 * for review: "did we need to learn something from you, or did you screw up?"
 *
 * The insight that keeps this small: a verification is a TRIAL argued in
 * reverse. The trial asks the system to imitate the expert on unruled
 * keywords and the human grades it; the blind check asks the system to answer
 * ALREADY-ruled keywords cold and the existing ruling does the grading. The
 * moment a checker answer disagrees, the human decides — "mine stands" turns
 * their reasoning into a proposed RULE through the same rule-writer +
 * approval spine the trial uses; "the checker is right" restamps through the
 * ONE human write path. No new agents, no new write paths, no fork.
 *
 * Blindness is structural: the proposer is given ZERO human examples for the
 * checked batch — a cold read — so agreement means the keyword's own words
 * carry the ruling, and disagreement is a real conversation, not an echo.
 */

import type { FacetDimension } from "@/features/marketing/seo/value-system/dimensions/data";
import type { HumanRulingRow, MatcherProbeHit } from "./data";
import type { AgentStampProposal, TrialProposal, TrialVerdict } from "./trial";
import { matcherKindWords } from "./trial";

/** One checked ruling: what you said, what the blind checker said. */
export interface BlindCheckRow {
  ruling: HumanRulingRow;
  /** The checker's answer — `rule` when this site's own matcher spoke. */
  checker: TrialProposal | null;
  agrees: boolean;
  /** The human's decision on a disagreement. */
  decision: "undecided" | "mine_stands" | "checker_right";
}

/** Build the checker's answer set: matchers first, the cold AI for the rest. */
export function checkerAnswers(
  rulings: HumanRulingRow[],
  probe: Map<string, MatcherProbeHit[]>,
  aiProposals: AgentStampProposal[],
  dimension: FacetDimension,
): Map<string, TrialProposal> {
  const values = new Map(dimension.values.map((value) => [value.key, value]));
  const out = new Map<string, TrialProposal>();
  for (const ruling of rulings) {
    const hit = probe
      .get(ruling.keywordId)
      ?.find((candidate) => candidate.dimensionSlug === dimension.slug);
    if (hit) {
      out.set(ruling.keywordId, {
        keywordId: ruling.keywordId,
        keyword: ruling.keyword,
        clicks: ruling.clicks,
        impressions: ruling.impressions,
        source: "rule",
        valueId: hit.valueId,
        valueSlug: hit.valueSlug,
        valueLabel: hit.valueLabel,
        reason: hit.matcherPattern
          ? `Your own rule: the search ${matcherKindWords(hit.matcherKind)} “${hit.matcherPattern}”.`
          : "Your own rule matched this search.",
        matcherKind: hit.matcherKind,
        matcherPattern: hit.matcherPattern,
      });
    }
  }
  for (const proposal of aiProposals) {
    if (out.has(proposal.keywordId)) continue;
    const ruling = rulings.find((row) => row.keywordId === proposal.keywordId);
    const value = values.get(proposal.valueSlug);
    if (!ruling || !value) continue;
    out.set(proposal.keywordId, {
      keywordId: ruling.keywordId,
      keyword: ruling.keyword,
      clicks: ruling.clicks,
      impressions: ruling.impressions,
      source: "ai",
      valueId: value.value_id,
      valueSlug: value.key,
      valueLabel: value.label,
      reason: proposal.reason,
    });
  }
  return out;
}

/** Diff every ruling against the checker. A checker with no answer is honest silence. */
export function buildBlindCheck(
  rulings: HumanRulingRow[],
  answers: Map<string, TrialProposal>,
): BlindCheckRow[] {
  return rulings.map((ruling) => {
    const checker = answers.get(ruling.keywordId) ?? null;
    const agrees = checker != null && checker.valueSlug === ruling.valueSlug;
    return { ruling, checker, agrees, decision: agrees ? "undecided" : "undecided" };
  });
}

/**
 * "Mine stands" disagreements as trial verdicts, so the EXISTING rule-writer
 * payload builders work untouched: the checker's answer plays the "wrong
 * proposal" and the human's standing ruling is the correction — with the
 * reason they originally typed as the training sentence (P24).
 */
export function mineStandsAsVerdicts(rows: BlindCheckRow[]): TrialVerdict[] {
  return rows.flatMap((row) => {
    if (row.decision !== "mine_stands" || !row.checker) return [];
    return [
      {
        proposal: row.checker,
        status: "wrong" as const,
        correctedValueId: row.ruling.valueId,
        correctedValueSlug: row.ruling.valueSlug,
        correctedValueLabel: row.ruling.valueLabel,
        correctionReason:
          row.ruling.reason ??
          `The expert ruled this "${row.ruling.valueLabel}" and re-affirmed it against the blind check.`,
      },
    ];
  });
}

/** Agreements as confirmations, so the rule writer never breaks what works. */
export function agreementsAsVerdicts(rows: BlindCheckRow[]): TrialVerdict[] {
  return rows.flatMap((row) =>
    row.agrees && row.checker
      ? [{ proposal: row.checker, status: "right" as const }]
      : [],
  );
}

export interface BlindCheckScore {
  checked: number;
  agreed: number;
  disagreed: number;
  silent: number;
}

export function scoreBlindCheck(rows: BlindCheckRow[]): BlindCheckScore {
  const agreed = rows.filter((row) => row.agrees).length;
  const silent = rows.filter((row) => row.checker == null).length;
  return {
    checked: rows.length,
    agreed,
    silent,
    disagreed: rows.length - agreed - silent,
  };
}
