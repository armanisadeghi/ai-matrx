/**
 * THE BLANK-SLATE GUARD — the interviewer's mode is a promise to the Expert,
 * and this file is what stops us breaking it silently.
 *
 * Arman, 2026-09-15: "AI models get fixated on the information you put in front
 * of them; once fixated, the interview becomes fixing the documentation instead
 * of capturing reality. So there are two ways of doing an interview: the agent
 * has all the context, or the agent has no context to begin with."
 *
 * The start screen tells the Expert, in plain words, that the blank-slate
 * interviewer "is given only your name and what you are building". The ONLY
 * thing that makes that sentence true is the launch payload, and a payload is
 * exactly the kind of thing a later change adds one convenient field to. So:
 *
 *   1. A blank-slate launch carries NO source text, in ANY field — not an empty
 *      `rulebook_document`, no `rulebook_document` key at all, and no rule,
 *      intake answer or description smuggled into `expert_goal`.
 *   2. A primed launch DOES carry the whole document — disease D4's cure is not
 *      allowed to rot while we are adding a second mode beside it.
 *   3. Every probe style the Expert picks changes what the interviewer is told.
 *
 * WHY THESE TESTS ARE NOT SELF-CONGRATULATION: each one is written against the
 * payload's OBSERVABLE content, using a document whose text is a distinctive
 * sentinel, and the blank-slate test scans EVERY value of the payload rather
 * than asserting on the one key we happen to remember. Adding a new field that
 * leaks the Rulebook fails test 1 without anyone having to remember this file.
 * The sibling live guard that proves the interviewer's own instructions carry
 * the mode is aidream `scripts/check_interview_mode_carriers.py`.
 */

import {
  blankSlateScopeOverride,
  INTERVIEW_CONTEXT_MODES,
  INTERVIEW_PROBES,
  buildInterviewLaunchVariables,
  resolveContextMode,
  type InterviewProbe,
} from "../interviewModes";

/**
 * A stand-in for the rendered Rulebook, written so every distinctive phrase in
 * it would be obvious if it appeared anywhere it should not.
 */
const RULEBOOK_DOCUMENT = [
  "# RULEBOOK: Electronics recycling intake",
  "",
  "## Intake answers",
  "What are you building: a desk that classifies incoming e-waste.",
  "",
  "## Rules",
  "- ZORBLAXIAN-SENTINEL-RULE: never accept a pallet without a chain-of-custody form.",
  "- Severity: critical. Detection: the form is missing from the manifest.",
  "",
  "## Open review feedback",
  "QUUXTRON-SENTINEL-FEEDBACK: the second rule is wrong, rewrite it.",
].join("\n");

/** Every phrase that exists ONLY inside the document above. */
const SENTINELS = [
  "ZORBLAXIAN-SENTINEL-RULE",
  "QUUXTRON-SENTINEL-FEEDBACK",
  "chain-of-custody",
  "Intake answers",
  "Open review feedback",
];

const BASE = {
  rulebookId: "11111111-2222-3333-4444-555555555555",
  expertName: "Dana Reyes",
  rulebookName: "Electronics recycling intake",
  closingSurprises: true,
  rulebookDocument: RULEBOOK_DOCUMENT,
};

function allValues(payload: Record<string, unknown>): string {
  return Object.values(payload)
    .map((value) => (typeof value === "string" ? value : JSON.stringify(value)))
    .join("\n");
}

describe("blank slate carries no source text", () => {
  const payload = buildInterviewLaunchVariables({
    ...BASE,
    mode: "blank_slate",
    probes: ["adaptive"],
  });

  it("omits the rulebook document entirely — absent, not empty", () => {
    expect("rulebook_document" in payload).toBe(false);
  });

  it.each(SENTINELS)("leaks %s nowhere in the payload", (sentinel) => {
    expect(allValues(payload)).not.toContain(sentinel);
  });

  it("gives the interviewer the Expert's name and goal, and nothing else", () => {
    expect(payload.expert_goal).toContain("Dana Reyes");
    expect(payload.expert_goal).toContain("Electronics recycling intake");
    // The goal line is one sentence. A paragraph here means someone started
    // packing context into it.
    expect(payload.expert_goal.length).toBeLessThan(200);
  });

  it("still names the Rulebook it writes into — an id is not source text", () => {
    expect(payload.rulebook_id).toBe(BASE.rulebookId);
  });

  it("still tells the interviewer which mode it is in", () => {
    expect(payload.interview_context_mode).toBe("blank_slate");
  });
});

describe("primed carries the whole document (disease D4 stays cured)", () => {
  const payload = buildInterviewLaunchVariables({
    ...BASE,
    mode: "primed",
    probes: ["adaptive"],
  });

  it("binds the rendered Rulebook before turn 1", () => {
    expect(payload.rulebook_document).toBe(RULEBOOK_DOCUMENT);
  });

  it.each(SENTINELS)("carries %s to the interviewer", (sentinel) => {
    expect(payload.rulebook_document ?? "").toContain(sentinel);
  });

  it("refuses to build a primed launch with no document, rather than sending an empty one", () => {
    expect(() =>
      buildInterviewLaunchVariables({
        ...BASE,
        mode: "primed",
        probes: ["adaptive"],
        rulebookDocument: null,
      }),
    ).toThrow(/D4|rendered Rulebook/i);
  });
});

describe("every probe style reaches the interviewer", () => {
  const rendered = (probes: InterviewProbe[]) =>
    buildInterviewLaunchVariables({ ...BASE, mode: "primed", probes })
      .interview_probes;

  it.each(INTERVIEW_PROBES.map((probe) => probe.id))(
    "%s names itself in what the interviewer is told",
    (probe) => {
      expect(rendered([probe])).toContain(probe);
    },
  );

  it("gives a different instruction for every distinct choice", () => {
    const all = INTERVIEW_PROBES.map((probe) => rendered([probe.id]));
    expect(new Set(all).size).toBe(INTERVIEW_PROBES.length);
  });

  it("carries a multi-select as every style the Expert picked", () => {
    const value = rendered(["contrast", "withheld_replay"]);
    expect(value).toContain("contrast");
    expect(value).toContain("withheld_replay");
    expect(value).not.toContain("boundary_hunting");
  });

  it("never sends an empty instruction when the list is somehow empty", () => {
    expect(rendered([])).toBe("adaptive");
  });
});

describe("the closing summary is carried as a switch, not as prose", () => {
  it("says on when the Expert left it on", () => {
    expect(
      buildInterviewLaunchVariables({ ...BASE, mode: "primed", probes: ["adaptive"] })
        .interview_closing_surprises,
    ).toBe("on");
  });

  it("says off when they turned it off", () => {
    expect(
      buildInterviewLaunchVariables({
        ...BASE,
        mode: "primed",
        probes: ["adaptive"],
        closingSurprises: false,
      }).interview_closing_surprises,
    ).toBe("off");
  });
});

describe("auto is Arman's rule and nothing else", () => {
  it("gives the blank slate when nothing is written down", () => {
    expect(resolveContextMode("auto", false)).toBe("blank_slate");
  });

  it("gives the primed interviewer when there are sources to read", () => {
    expect(resolveContextMode("auto", true)).toBe("primed");
  });

  it("never second-guesses an explicit choice", () => {
    expect(resolveContextMode("primed", false)).toBe("primed");
    expect(resolveContextMode("blank_slate", true)).toBe("blank_slate");
  });
});

describe("the screen's own copy", () => {
  it("offers both modes, with one plain sentence each", () => {
    expect(INTERVIEW_CONTEXT_MODES).toHaveLength(2);
    for (const option of INTERVIEW_CONTEXT_MODES) {
      expect(option.sentence.length).toBeGreaterThan(40);
      // One sentence. Two or more means the screen started explaining itself.
      expect(option.sentence.split(". ").length).toBeLessThanOrEqual(2);
    }
  });

  it("offers the five acquisition probes plus adaptive, each with a sentence", () => {
    expect(INTERVIEW_PROBES).toHaveLength(6);
    for (const option of INTERVIEW_PROBES) {
      expect(option.sentence.trim().length).toBeGreaterThan(30);
      expect(option.title.trim().length).toBeGreaterThan(0);
    }
  });
});

/**
 * THE SECOND DOOR. The payload tests above were all green on 2026-09-15 while a
 * live blank-slate interview opened by reciting the Rulebook's description —
 * because the launch ALSO adopts the mounted surface provider, which publishes
 * the Rulebook's name, description and full rule set. A guard that only watches
 * the variables watches one of the two ways in.
 */
describe("blank slate closes the surface-context door too", () => {
  it("passes an explicit empty scope, so nothing is auto-adopted", () => {
    expect(blankSlateScopeOverride("blank_slate")).toEqual({
      applicationScope: {},
    });
  });

  it("leaves a primed launch to adopt the live surface, as it should", () => {
    expect(blankSlateScopeOverride("primed")).toEqual({});
    expect("applicationScope" in blankSlateScopeOverride("primed")).toBe(false);
  });

  it("is actually spread into the launch runtime by the interview panel", () => {
    // A source check, because the defect was a MISSING line at the call site:
    // the helper can be perfect and unused, which is exactly what shipped.
    const panel = require("node:fs").readFileSync(
      require("node:path").join(
        __dirname,
        "../../components/detail/ScoutInterviewPanel.tsx",
      ),
      "utf8",
    );
    expect(panel).toContain("...blankSlateScopeOverride(choice.mode)");
  });
});

/**
 * THE THIRD DOOR, and the one that actually shipped the lie. The two guards
 * above were green while a live blank-slate interview recited the Rulebook's
 * own description back to the Expert — because a mounted
 * `<SurfaceRuntimeProvider>` republishes its scope on EVERY turn, so the empty
 * launch scope bought exactly one turn of silence and the whole rendered
 * Rulebook came back as `content` on turn two.
 */
describe("blank slate withholds the surface's content, every turn", () => {
  const RULEBOOK = {
    id: "rb-1",
    name: "Electronics recycling intake",
    description: "ZORBLAXIAN-DESCRIPTION: how we sort incoming pallets",
    status: "draft",
    version: 3,
    visibility: "private",
    organization_id: "org-1",
    source: { title: "QUUXTRON-SOURCE" },
    sections: [{ key: "a", title: "Intake" }],
    rules: [
      {
        id: "r-1",
        name: "ZORBLAXIAN-RULE",
        statement: "Never accept a pallet without a chain-of-custody form.",
      },
    ],
    metadata: {},
  } as never;

  const build = (withholdContent: boolean) =>
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("../../agent-context/rulebookSurfaceScope").buildRulebookSurfaceScope({
      rulebook: RULEBOOK,
      canEdit: true,
      lane: "interview",
      withholdContent,
    });

  const LEAKS = [
    "ZORBLAXIAN-DESCRIPTION",
    "ZORBLAXIAN-RULE",
    "QUUXTRON-SOURCE",
    "chain-of-custody",
  ];

  it.each(LEAKS)("withholds %s from every field of the scope", (leak) => {
    expect(JSON.stringify(build(true))).not.toContain(leak);
  });

  it.each(LEAKS)("still publishes %s when NOT withholding", (leak) => {
    expect(JSON.stringify(build(false))).toContain(leak);
  });

  it("keeps identity, permission and lane so tools and write targets work", () => {
    const scope = build(true);
    expect(scope.rulebook_id).toBe("rb-1");
    expect(scope.can_edit).toBe(true);
    expect(scope.context.lane).toBe("interview");
    expect(scope.rulebook_version).toBe(3);
  });

  it("is actually consulted by the lane route that owns the provider", () => {
    const route = require("node:fs").readFileSync(
      require("node:path").join(
        __dirname,
        "../../components/RulebookLaneRoute.tsx",
      ),
      "utf8",
    );
    expect(route).toContain("withholdContent: isBlankSlateInterview(rulebookId)");
  });

  it("is actually declared by the interview panel that knows the mode", () => {
    const panel = require("node:fs").readFileSync(
      require("node:path").join(
        __dirname,
        "../../components/detail/ScoutInterviewPanel.tsx",
      ),
      "utf8",
    );
    expect(panel).toContain("declareBlankSlateInterview(rulebookId)");
  });
});
