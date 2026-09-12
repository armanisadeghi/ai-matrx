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
    archivedMasterworks: 0,
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

  // THE ARCHIVED-ITEMS LAW half. Twins: test_journey.py's
  // `test_a_live_masterwork_beside_an_archived_one_is_the_only_one_named` and
  // `test_an_archived_release_never_counts_as_released`. The all-archived
  // headline cases live in `archivedItemsLaw.test.ts` beside the surfaces.
  it("names only the LIVE Masterwork when an archived one sits beside it", () => {
    const j = computeJourney(
      facts({
        liveRules: 10,
        approvedRules: 10,
        masterworks: [mw({ id: "live", name: "The live one" })],
        archivedMasterworks: 1,
      }),
      NOW,
    );
    expect(keys(j)).not.toContain("conductor_ready");
    expect(j.stage).toBe("audition_due");
    expect(j.headline).toContain("The live one");
  });

  it("never counts an ARCHIVED release as a release", () => {
    // An archived Masterwork is off Encore (`releasedBase()` excludes it), so
    // its release may not suppress the ask for a live draft. The archive split
    // keeps it out of `masterworks` entirely — this asserts the consequence.
    const j = computeJourney(
      facts({
        liveRules: 10,
        approvedRules: 10,
        masterworks: [mw({ id: "live", name: "Still a draft" })],
        archivedMasterworks: 1,
        latestAudition: audition(),
      }),
      NOW,
    );
    expect(keys(j)).toContain("release_ready");
    expect(
      j.moves.find((m) => m.key === "release_ready")?.headline,
    ).toContain("Still a draft");
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
  // 🚨 THE LIVE DEFECT (2026-09-12, Rulebook "Montessori Parenting Adviser").
  // Twin: `test_the_open_question_count_is_the_coherence_partners_own_predicate`
  // in aidream `services/masterwork_assists/tests/test_journey.py`.
  it("counts the open questions the panel can actually show, never the raw state", () => {
    const tension = (id: string, ruleIds: string[], state = "open") => ({
      id,
      kind: "overlap",
      rule_ids: ruleIds,
      question: "Which one wins?",
      confidence: 0.6,
      state,
    });
    const built = journeyFactsFromRulebook(
      {
        id: "rb",
        name: "Montessori Parenting Adviser",
        rules: [
          { id: "children-do-everything", name: "n", statement: "s" },
          { id: "retired-one", name: "n", statement: "s", retired: true },
        ],
        metadata: {
          coherence: {
            tensions: [
              // The four that shipped the lie: every one names a rule the
              // de-duplication repair removed an hour earlier.
              tension("t_c819e8e4587cdd9e", ["children-do-everything-2"]),
              tension("t_15a49f2cb78d99e6", ["do-not-help-the-child-dress"]),
              tension("t_a20fbd24966a747f", ["reality-instead-of-toys"]),
              tension("t_c0f6aea90da680bc", [
                "children-do-everything",
                "teacher-guides-hand-for-first-touch",
              ]),
              tension("t_retired", ["retired-one"]),
              tension("t_real", ["children-do-everything"]),
              tension("t_done", ["children-do-everything"], "answered"),
              tension("t_moot", ["children-do-everything"], "moot"),
            ],
          },
        },
      } as never,
      [],
    );
    // What the panel lists, and so what the headline may say.
    expect(built.openTensions).toBe(1);
    // A machine's bookkeeping is never reported to her as something she settled.
    expect(built.settledTensions).toBe(1);
    const journey = computeJourney(built, NOW);
    expect(journey.moves.map((m) => m.key)).toContain("tensions_open");
    expect(
      journey.moves.find((m) => m.key === "tensions_open")?.headline,
    ).toBe("1 question only you can settle is still open.");
  });
});
