// features/masterwork/journey.test.ts
//
// THE MIRROR TEST. Every case here has a twin in aidream
// `services/masterwork_assists/tests/test_journey.py` with the SAME name and
// the SAME expectation. That is the whole point: the page's next-step line and
// the improvement brain's chips are one computation in two languages, and a
// silent drift between them is the page telling the Expert one thing while the
// chip beside it says another.

import {
  computeJourney,
  journeyFactsFromRulebook,
  ruleFacts,
  CHECKUP_STALE_DAYS,
  type JourneyAudition,
  type JourneyFacts,
  type JourneyMasterwork,
} from "./journey";

const NOW = Date.parse("2026-08-19T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

function facts(over: Partial<JourneyFacts> = {}): JourneyFacts {
  return {
    rulebookId: "rb",
    rulebookName: "SEO Keyword Optimization",
    liveRules: 0,
    approvedRules: 0,
    draftRules: 0,
    rejectedRules: 0,
    changeRequests: 0,
    hasInterviewRules: false,
    openTensions: 0,
    settledTensions: 0,
    latestCheckupAt: null,
    completedCheckups: 0,
    checkupSettledAt: null,
    masterworks: [],
    latestAudition: null,
    hasRunFacts: true,
    ...over,
  };
}

const mw = (over: Partial<JourneyMasterwork> = {}): JourneyMasterwork => ({
  id: "m",
  name: "SEO Masterwork",
  understudy: false,
  releasedAt: null,
  ...over,
});

const audition = (over: Partial<JourneyAudition> = {}): JourneyAudition => ({
  id: "a",
  createdAt: daysAgo(1),
  qualityScore: 88,
  lostCount: 0,
  expertVerdict: null,
  ...over,
});

const keys = (j: ReturnType<typeof computeJourney>) => j.moves.map((m) => m.key);

describe("the journey", () => {
  it("says only 'start' for an empty Rulebook", () => {
    const j = computeJourney(facts(), NOW);
    expect(j.stage).toBe("start_distilling");
    expect(keys(j)).toEqual(["start_distilling"]);
  });

  it("puts rules waiting on the Expert above anything the system could make", () => {
    const j = computeJourney(
      facts({ liveRules: 12, approvedRules: 10, draftRules: 2, openTensions: 1 }),
      NOW,
    );
    expect(j.stage).toBe("review_drafts");
    expect(j.headline).toContain("Almost there");
  });

  it("never claims an interviewer that was never used", () => {
    const sourced = computeJourney(
      facts({ liveRules: 5, approvedRules: 4, rejectedRules: 1 }),
      NOW,
    );
    expect(sourced.headline).toContain("next time you talk to the interviewer");
    expect(sourced.headline).not.toContain("are with the interviewer");

    const interviewed = computeJourney(
      facts({
        liveRules: 5,
        approvedRules: 4,
        rejectedRules: 1,
        hasInterviewRules: true,
      }),
      NOW,
    );
    expect(interviewed.headline).toContain("with the interviewer");
  });

  it("reproduces the live SEO Rulebook of 2026-08-19", () => {
    const j = computeJourney(
      facts({
        liveRules: 31,
        approvedRules: 31,
        openTensions: 3,
        latestCheckupAt: daysAgo(1),
        completedCheckups: 1,
        checkupSettledAt: null,
        masterworks: [mw({ id: "m1" }), mw({ id: "m2" }), mw({ id: "m3" })],
      }),
      NOW,
    );
    expect(j.stage).toBe("checkup_findings");
    expect(keys(j)).toEqual(["checkup_findings", "tensions_open", "audition_due"]);
    expect(keys(j)).not.toContain("checkup_due");
  });

  it("stops naming a checkup once its findings were decided on", () => {
    const common = {
      liveRules: 20,
      approvedRules: 20,
      latestCheckupAt: daysAgo(2),
      completedCheckups: 1,
    };
    expect(computeJourney(facts(common), NOW).stage).toBe("checkup_findings");
    const settled = computeJourney(
      facts({ ...common, checkupSettledAt: daysAgo(1) }),
      NOW,
    );
    expect(keys(settled)).not.toContain("checkup_findings");
  });

  it("offers the Conductor only when no REAL Masterwork exists", () => {
    expect(
      computeJourney(facts({ liveRules: 10, approvedRules: 10 }), NOW).stage,
    ).toBe("conductor_ready");

    // An Understudy is a free stand-in, not a Masterwork.
    const withUnderstudy = computeJourney(
      facts({
        liveRules: 10,
        approvedRules: 10,
        masterworks: [mw({ understudy: true, name: "… — Understudy" })],
      }),
      NOW,
    );
    expect(keys(withUnderstudy)).toContain("conductor_ready");

    const built = computeJourney(
      facts({ liveRules: 10, approvedRules: 10, masterworks: [mw()] }),
      NOW,
    );
    expect(keys(built)).not.toContain("conductor_ready");
    expect(built.stage).toBe("audition_due");
    // The paid "run a full Checkup" ask sits BELOW both.
    expect(keys(built).indexOf("checkup_due")).toBeGreaterThan(
      keys(built).indexOf("audition_due"),
    );
  });

  it("waits for a passing Audition before asking for a release", () => {
    const ready = computeJourney(
      facts({
        liveRules: 10,
        approvedRules: 10,
        masterworks: [mw()],
        latestAudition: audition(),
      }),
      NOW,
    );
    expect(ready.stage).toBe("release_ready");

    const losing = computeJourney(
      facts({
        liveRules: 10,
        approvedRules: 10,
        masterworks: [mw()],
        latestAudition: audition({ qualityScore: 25 }),
      }),
      NOW,
    );
    expect(losing.stage).toBe("audition_feedback");
    expect(keys(losing)).not.toContain("release_ready");

    const already = computeJourney(
      facts({
        liveRules: 10,
        approvedRules: 10,
        masterworks: [mw({ releasedAt: daysAgo(3) })],
        latestAudition: audition(),
        latestCheckupAt: daysAgo(2),
        completedCheckups: 1,
        checkupSettledAt: daysAgo(1),
      }),
      NOW,
    );
    expect(already.moves).toEqual([]);
    expect(already.stage).toBe("steady");
    expect(already.headline).toContain("released and running");
  });

  it("never re-raises an Audition the Expert already answered, or a stale one", () => {
    const answered = computeJourney(
      facts({
        liveRules: 10,
        approvedRules: 10,
        masterworks: [mw()],
        latestAudition: audition({ qualityScore: 20, expertVerdict: "agreed" }),
      }),
      NOW,
    );
    expect(keys(answered)).not.toContain("audition_feedback");

    const stale = computeJourney(
      facts({
        liveRules: 10,
        approvedRules: 10,
        masterworks: [mw()],
        latestAudition: audition({ qualityScore: 10, createdAt: daysAgo(200) }),
      }),
      NOW,
    );
    expect(keys(stale)).not.toContain("audition_feedback");
  });

  it("asks for a Final Checkup only with substance and a stale clock", () => {
    expect(
      keys(computeJourney(facts({ liveRules: 5, approvedRules: 5 }), NOW)),
    ).not.toContain("checkup_due");

    const fresh = computeJourney(
      facts({
        liveRules: 20,
        approvedRules: 20,
        latestCheckupAt: daysAgo(2),
        completedCheckups: 1,
        checkupSettledAt: daysAgo(1),
      }),
      NOW,
    );
    expect(keys(fresh)).not.toContain("checkup_due");

    const stale = computeJourney(
      facts({
        liveRules: 20,
        approvedRules: 20,
        latestCheckupAt: daysAgo(CHECKUP_STALE_DAYS + 1),
        completedCheckups: 1,
        checkupSettledAt: daysAgo(CHECKUP_STALE_DAYS),
      }),
      NOW,
    );
    expect(keys(stale)).toContain("checkup_due");
  });

  it("never guesses for a caller that cannot see runs", () => {
    const blind = computeJourney(
      facts({
        liveRules: 10,
        approvedRules: 10,
        masterworks: [mw()],
        hasRunFacts: false,
      }),
      NOW,
    );
    expect(keys(blind)).toEqual([]);
    expect(blind.stage).toBe("steady");
  });
});

describe("the facts a page can build on its own", () => {
  it("counts rules in the page's own ruleState precedence", () => {
    expect(ruleFacts([]).liveRules).toBe(0);
    expect(ruleFacts([{ retired: true } as never]).liveRules).toBe(0);
    const drafts = ruleFacts([{ draft: true } as never]);
    expect(drafts.draftRules).toBe(1);
    expect(drafts.approvedRules).toBe(0);
    const rejected = ruleFacts([{ draft: true, rejected: true } as never]);
    expect(rejected.rejectedRules).toBe(1);
    expect(rejected.draftRules).toBe(0);
    const changed = ruleFacts([{ feedback: "tighten this" } as never]);
    expect(changed.changeRequests).toBe(1);
    expect(changed.approvedRules).toBe(1);
  });

  it("reads interview provenance from either shape", () => {
    expect(
      ruleFacts([{ source_ref: { approach: "interview" } } as never])
        .hasInterviewRules,
    ).toBe(true);
    expect(
      ruleFacts([{ source_ref: { interview: "conv-1" } } as never])
        .hasInterviewRules,
    ).toBe(true);
    expect(
      ruleFacts([{ source_ref: { approach: "source" } } as never])
        .hasInterviewRules,
    ).toBe(false);
  });

  it("declares itself run-blind when built from a Rulebook page's data", () => {
    const built = journeyFactsFromRulebook(
      {
        id: "rb",
        name: "SEO",
        rules: [],
        metadata: {
          coherence: {
            tensions: [
              { state: "open" },
              { state: "answered" },
              { state: "dismissed" },
            ],
          },
          checkup: { last_run_at: daysAgo(2) },
        },
      } as never,
      [],
    );
    expect(built.hasRunFacts).toBe(false);
    expect(built.latestAudition).toBeNull();
    expect(built.latestCheckupAt).toBeNull();
    expect(built.checkupSettledAt).not.toBeNull();
  });
});
