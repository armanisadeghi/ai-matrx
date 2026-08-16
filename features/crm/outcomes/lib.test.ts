// The evidence-drawer narrowers: the low bar is only defensible if the UI
// faithfully shows every signal (fired AND not) and never renders raw jsonb.

import {
  confidenceLabel,
  outcomeDomain,
  outcomeVerdict,
  parseOutcomeDetail,
  signalLabel,
  type OutcomeEventRow,
} from "./lib";

const baseRow = (overrides: Partial<OutcomeEventRow> = {}): OutcomeEventRow =>
  ({
    id: "o-1",
    campaign_id: "list-1",
    confidence: 80,
    created_at: "2026-08-16T00:00:00Z",
    created_by: "u-1",
    decided_at: null,
    decided_by: null,
    dedupe_key: "link_appeared:i-1:example.com",
    disposition: "auto_with_audit",
    evidence_id: "e-1",
    evidence_type: "seo_backlink_change_event",
    evidence_url: "https://www.example.com/story",
    intent_id: "i-1",
    intent_type: "crm_interaction",
    match_detail: {
      signals: [
        { name: "domain_window", fired: true, detail: "inside the window" },
        { name: "author_match", fired: false, detail: "byline unknown" },
      ],
      competing_interaction_ids: [],
      days_after_pitch: 12,
      additional_appearances: 3,
      auto_confirmed: true,
      explanation: "example.com linked to you 12 days after you pitched them.",
    },
    match_method: "domain_window",
    matched_at: "2026-08-16T00:00:00Z",
    metadata: {},
    occurred_at: "2026-08-10T00:00:00Z",
    organization_id: "org-1",
    outcome_kind: "link_appeared",
    party_id: null,
    status: "confirmed",
    subject_id: "b-1",
    subject_type: "seo_backlink",
    updated_at: "2026-08-16T00:00:00Z",
    updated_by: null,
    version: 1,
    visibility: "internal",
    ...overrides,
  }) as OutcomeEventRow;

describe("parseOutcomeDetail", () => {
  it("keeps non-fired signals — they are the defence, not noise", () => {
    const parsed = parseOutcomeDetail(baseRow().match_detail);
    expect(parsed.signals).toHaveLength(2);
    expect(parsed.signals.find((s) => s.name === "author_match")?.fired).toBe(false);
    expect(parsed.additionalAppearances).toBe(3);
    expect(parsed.daysAfterPitch).toBe(12);
    expect(parsed.autoConfirmed).toBe(true);
  });

  it("survives garbage jsonb without throwing", () => {
    for (const junk of [null, [], "x", 42, { signals: "nope" }]) {
      const parsed = parseOutcomeDetail(junk);
      expect(parsed.signals).toEqual([]);
      expect(parsed.daysAfterPitch).toBeNull();
    }
  });
});

describe("outcomeVerdict", () => {
  it("auto-confirmed win says it was automatic and reversible", () => {
    const verdict = outcomeVerdict(baseRow());
    expect(verdict.tone).toBe("win");
    expect(verdict.detail).toContain("Credited automatically");
  });

  it("human-confirmed win says a human confirmed", () => {
    const verdict = outcomeVerdict(baseRow({ decided_by: "u-2" }));
    expect(verdict.detail).toContain("Confirmed by a human");
  });

  it("proposed asks the question instead of asserting the win", () => {
    const verdict = outcomeVerdict(baseRow({ status: "proposed" }));
    expect(verdict.tone).toBe("pending");
    expect(verdict.headline).toContain("?");
  });

  it("rejected states the ruling", () => {
    expect(outcomeVerdict(baseRow({ status: "rejected" })).tone).toBe("rejected");
  });
});

describe("outcomeDomain", () => {
  it("prefers the evidence URL host, stripped of www", () => {
    expect(outcomeDomain(baseRow())).toBe("example.com");
  });

  it("falls back to the dedupe key when the URL is junk", () => {
    expect(
      outcomeDomain(baseRow({ evidence_url: "not a url" })),
    ).toBe("example.com");
  });
});

describe("labels", () => {
  it("confidence bands are plain language", () => {
    expect(confidenceLabel(80)).toBe("Very likely");
    expect(confidenceLabel(35)).toBe("Uncertain");
  });
  it("unknown signals still get a readable label", () => {
    expect(signalLabel("some_new_signal")).toBe("some new signal");
  });
});
