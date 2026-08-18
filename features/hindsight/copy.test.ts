import {
  hindsightFindingAgentPayload,
  hindsightFindingHuman,
  hindsightFindingIsDecided,
  hindsightFindingView,
} from "./copy";
import type { Finding } from "./types";

const finding = {
  id: "finding-1",
  review_id: "review-1",
  enrollment_id: "enrollment-1",
  lever: "instructions",
  title: "Clarify the stopping rule",
  reasoning: "The agent continued after the requested result was complete.",
  evidence: [
    "Conversation 11111111-1111-1111-1111-111111111111 continued for two turns.",
    {
      hop: 0,
      unit_kind: "agent",
      unit_id: "agent-1",
      answer: "input_fine",
      note: "The request was already complete.",
    },
  ],
  proposal: {
    proposed_system_text: "Stop when the requested deliverable is complete.",
    section_key: "stopping_rule",
    replay_verdicts: { better: 2, same: 1 },
  },
  machine_applicable: true,
  confidence: 0.87,
  status: "pending",
  applied_version_number: null,
  pre_apply_version: 4,
} satisfies Finding;

describe("Hindsight finding copy projection", () => {
  it("mirrors the values and labels rendered by FindingCard", () => {
    expect(hindsightFindingView(finding)).toMatchObject({
      title: "Clarify the stopping rule",
      lever: { key: "instructions", label: "Instructions" },
      applicability: "one-click",
      confidence_percent: 87,
      replay_verdicts: { better: 2, same: 1 },
      proposal_section: "stopping_rule",
      proposed_change: "Stop when the requested deliverable is complete.",
    });

    expect(hindsightFindingHuman(finding)).toContain(
      "Replay verdicts: 2× better, 1× same",
    );
    expect(hindsightFindingHuman(finding)).toContain(
      "Step 1: agent agent-1 — its inputs were fine — The request was already complete.",
    );
  });

  it("carries live card and decision state in the AI envelope", () => {
    const payload = hindsightFindingAgentPayload(finding, false);

    expect(payload.kind).toBe("hindsight-finding");
    expect(payload.context).toEqual({
      card_state: "collapsed",
      decision_available: true,
    });
    expect(hindsightFindingIsDecided(finding)).toBe(false);
    expect(hindsightFindingIsDecided({ ...finding, status: "reverted" })).toBe(
      true,
    );
  });
});
