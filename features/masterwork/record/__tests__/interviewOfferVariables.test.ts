/**
 * masterwork.scout_interview offered values ride BESIDE the by-name launch
 * variables — never instead of them — and a blank-slate interview still gets
 * none of the Rulebook's own facts.
 */
import { buildInterviewLaunchVariables } from "../interviewModes";
import type { RulebookOfferFacts } from "../../agent-context/rulebookDocument";

const FACTS: RulebookOfferFacts = {
  rulebook_name: "Electronics recycling intake",
  rulebook_status: "active",
  rulebook_version: 7,
  rule_count: 12,
  open_review_count: 2,
  open_feedback: "- **Weigh first** [r1] (rejected): too strict",
};

const BASE = {
  rulebookId: "11111111-2222-3333-4444-555555555555",
  expertName: "Dana Reyes",
  rulebookName: "Electronics recycling intake",
  closingSurprises: true,
  rulebookDocument: "# Electronics recycling intake\n…",
  probes: ["adaptive", "contrast"] as const,
};

const OFFER = {
  expertName: "Dana Reyes",
  rulebookFacts: FACTS,
  voiceOn: false,
  seedText: "Ask me about pallets",
  priorInterviewCount: 3,
};

const BY_NAME_KEYS = [
  "rulebook_id",
  "interview_context_mode",
  "interview_probes",
  "interview_closing_surprises",
  "expert_goal",
];

describe("scout interview offered values", () => {
  it("primed: every by-name value unchanged, offered facts added", () => {
    const before = buildInterviewLaunchVariables({ ...BASE, probes: [...BASE.probes], mode: "primed" });
    const after = buildInterviewLaunchVariables({
      ...BASE,
      probes: [...BASE.probes],
      mode: "primed",
      offer: OFFER,
    });
    for (const k of [...BY_NAME_KEYS, "rulebook_document"]) {
      expect((after as Record<string, unknown>)[k]).toEqual((before as Record<string, unknown>)[k]);
    }
    expect(after).toMatchObject({
      expert_name: "Dana Reyes",
      rulebook_name: "Electronics recycling intake",
      rulebook_status: "active",
      rulebook_version: 7,
      rule_count: 12,
      open_review_count: 2,
      interview_probe_list: ["adaptive", "contrast"],
      closing_surprises_on: true,
      voice_on: false,
      seed_text: "Ask me about pallets",
      prior_interview_count: 3,
    });
  });

  it("blank slate: none of the Rulebook's own facts ride along", () => {
    const v = buildInterviewLaunchVariables({
      ...BASE,
      probes: [...BASE.probes],
      mode: "blank_slate",
      offer: OFFER,
    }) as Record<string, unknown>;
    for (const k of ["rulebook_document", "rulebook_status", "rulebook_version", "rule_count", "open_review_count", "open_feedback"]) {
      expect(k in v).toBe(false);
    }
    expect(JSON.stringify(v)).not.toContain("too strict");
  });

  it("omits absent facts instead of sending empty values", () => {
    const v = buildInterviewLaunchVariables({
      ...BASE,
      probes: [...BASE.probes],
      mode: "primed",
      offer: { expertName: null, seedText: "" },
    }) as Record<string, unknown>;
    for (const k of ["expert_name", "seed_text", "voice_on", "prior_interview_count", "rule_count"]) {
      expect(k in v).toBe(false);
    }
  });
});
