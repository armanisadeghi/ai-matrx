import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";

import { evidenceLine, type Finding } from "./types";
import { LEVER_LABEL } from "./components/tokens";

const DECIDED_FINDING_STATUSES = new Set([
  "applied",
  "rejected",
  "superseded",
  "approved",
  "reverted",
]);

export function hindsightFindingIsDecided(finding: Finding): boolean {
  return DECIDED_FINDING_STATUSES.has(finding.status);
}

/** The proposal text FindingCard renders, shared with its copy projection. */
export function findingProposalBody(finding: Finding): string {
  const proposal = finding.proposal;
  return (
    proposal?.proposed_system_text ??
    proposal?.section_content ??
    proposal?.content ??
    proposal?.details ??
    ""
  );
}

/**
 * The finding converted to the same vocabulary and values FindingCard renders.
 * Raw wire data remains available through CopyButtons' JSON menu item.
 */
export function hindsightFindingView(finding: Finding) {
  return {
    identity: {
      finding_id: finding.id,
      review_id: finding.review_id,
      enrollment_id: finding.enrollment_id,
    },
    title: finding.title,
    lever: {
      key: finding.lever,
      label: LEVER_LABEL[finding.lever],
    },
    status: finding.status,
    applicability: finding.machine_applicable ? "one-click" : "needs a human",
    confidence_percent:
      finding.confidence == null ? null : Math.round(finding.confidence * 100),
    replay_verdicts: finding.proposal?.replay_verdicts ?? {},
    applied_version_number: finding.applied_version_number ?? null,
    pre_apply_version: finding.pre_apply_version ?? null,
    reasoning: finding.reasoning ?? null,
    evidence: (finding.evidence ?? []).map(evidenceLine),
    proposed_change: findingProposalBody(finding) || null,
    proposal_section: finding.proposal?.section_key ?? null,
  };
}

/** Human-readable copy for one finding, using the same projection as AI copy. */
export function hindsightFindingHuman(finding: Finding): string {
  const view = hindsightFindingView(finding);
  const lines = [
    `Hindsight finding: ${view.title}`,
    `Lever: ${view.lever.label}`,
    `Status: ${view.status}`,
    `Applicability: ${view.applicability}`,
  ];

  if (view.confidence_percent != null) {
    lines.push(`Confidence: ${view.confidence_percent}%`);
  }
  if (view.applied_version_number != null) {
    lines.push(`Applied version: v${view.applied_version_number}`);
  }

  const verdicts = Object.entries(view.replay_verdicts);
  if (verdicts.length > 0) {
    lines.push(
      `Replay verdicts: ${verdicts.map(([verdict, count]) => `${count}× ${verdict}`).join(", ")}`,
    );
  }
  if (view.reasoning) lines.push("", "Reasoning", view.reasoning);
  if (view.evidence.length > 0) {
    lines.push(
      "",
      "Evidence from the real transcripts",
      ...view.evidence.map((item) => `- ${item}`),
    );
  }
  if (view.proposed_change) {
    lines.push(
      "",
      view.proposal_section
        ? `Proposed change — section <${view.proposal_section}>`
        : "Proposed change",
      view.proposed_change,
    );
  }

  return lines.join("\n");
}

/** Model-ready, what-the-card-shows payload for one Hindsight finding. */
export function hindsightFindingAgentPayload(
  finding: Finding,
  cardExpanded: boolean,
): AgentPayloadInput {
  const view = hindsightFindingView(finding);
  return {
    kind: "hindsight-finding",
    location: "AI Matrx — Hindsight",
    description: "One Hindsight improvement finding shown on the current page.",
    data: view,
    summary: hindsightFindingHuman(finding),
    attributes: {
      finding_id: finding.id,
      review_id: finding.review_id,
      enrollment_id: finding.enrollment_id,
      lever: finding.lever,
      status: finding.status,
    },
    context: {
      card_state: cardExpanded ? "expanded" : "collapsed",
      decision_available: !hindsightFindingIsDecided(finding),
    },
  };
}
