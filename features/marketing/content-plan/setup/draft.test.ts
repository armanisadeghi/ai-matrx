/**
 * The staged-AI-run half of the Setup draft.
 *
 * Three whole-plan agent runs (review / keyword strategy / entity attach) are
 * expensive enough that losing one to a refresh means billing the user twice.
 * They stage in the draft like every other Setup choice, so what matters is
 * that the write → read round trip is LOSSLESS, and that a corrupted section
 * degrades to "re-run this one" instead of destroying the whole draft.
 */
import {
  draftToStorage,
  emptySetupDraft,
  readSetupDraft,
  SETUP_DRAFT_KEY,
  type SetupDraft,
} from "./draft";
import { SITE_SETTINGS_KEY } from "./archetypes";

/** Wrap a stored draft block the way `web.site.settings` actually holds it. */
function asSettings(stored: Record<string, unknown>): unknown {
  return { [SITE_SETTINGS_KEY]: { [SETUP_DRAFT_KEY]: stored } };
}

function draftWithRuns(): SetupDraft {
  return {
    ...emptySetupDraft(),
    archetypeKey: "local-services",
    review: {
      summary: "The plan covers services but never names the city it serves.",
      findings: [
        {
          severity: "gap",
          title: "No location page",
          detail: "The research report names three service areas.",
          suggestedRoute: "/locations/phoenix",
          suggestedLabel: "Phoenix",
        },
        {
          severity: "mismatch",
          title: "Blog hub promises reviews",
          detail: "Nothing in the plan reviews anything.",
          suggestedRoute: null,
          suggestedLabel: null,
        },
      ],
    },
    reviewAddedRoutes: ["/locations/phoenix"],
    keywordStrategy: {
      strategySummary: "Two money pages, four supporting guides feeding them.",
      warnings: ["/services and /services/shredding compete for one term."],
      assignments: [
        {
          route: "/services/shredding",
          pageRole: "money",
          primaryKeyword: "hard drive shredding",
          primaryIsNew: true,
          secondaryKeywords: ["ssd destruction"],
          supportsRoutes: [],
          internalLinks: [],
          reason: "The commercial page for the core service.",
        },
        {
          route: "/guides/data-destruction",
          pageRole: "supporting",
          primaryKeyword: "how to destroy a hard drive",
          primaryIsNew: false,
          secondaryKeywords: [],
          supportsRoutes: ["/services/shredding"],
          internalLinks: [
            { toRoute: "/services/shredding", anchorText: "hard drive shredding" },
          ],
          reason: "Easier term that passes authority to the money page.",
        },
      ],
    },
    keywordsAppliedAt: "2026-08-11T10:00:00.000Z",
    entityPlan: {
      attachments: [
        {
          route: "/services/shredding",
          entityLabel: "NAID AAA Certification",
          role: "cites",
          reason: "Certification is the credibility claim on this page.",
        },
      ],
      missingEntities: [
        {
          suggestedLabel: "Dr. Jane Doe",
          entityType: "person",
          whyNeeded: "No reviewer exists for the compliance pages.",
        },
      ],
      notes: "Roster is thin on named humans.",
    },
    entitiesAppliedAt: "2026-08-11T11:00:00.000Z",
  };
}

describe("setup draft — staged AI runs", () => {
  it("round-trips all three runs without losing a field", () => {
    const draft = draftWithRuns();
    const restored = readSetupDraft(asSettings(draftToStorage(draft)));

    expect(restored).not.toBeNull();
    expect(restored?.review).toEqual(draft.review);
    expect(restored?.reviewAddedRoutes).toEqual(draft.reviewAddedRoutes);
    expect(restored?.keywordStrategy).toEqual(draft.keywordStrategy);
    expect(restored?.keywordsAppliedAt).toBe(draft.keywordsAppliedAt);
    expect(restored?.entityPlan).toEqual(draft.entityPlan);
    expect(restored?.entitiesAppliedAt).toBe(draft.entitiesAppliedAt);
  });

  it("keeps the previously-dropped fields — summary, warnings, gaps, notes", () => {
    const draft = draftWithRuns();
    const restored = readSetupDraft(asSettings(draftToStorage(draft)));

    // The exact four things that used to die on a refresh.
    expect(restored?.review?.summary).toContain("never names the city");
    expect(restored?.keywordStrategy?.strategySummary).toContain("Two money pages");
    expect(restored?.keywordStrategy?.warnings).toHaveLength(1);
    expect(restored?.entityPlan?.missingEntities[0]?.suggestedLabel).toBe(
      "Dr. Jane Doe",
    );
    expect(restored?.entityPlan?.notes).toBe("Roster is thin on named humans.");
    // Non-gap findings survive too — only `gap` findings were ever persisted
    // before, and only the ones the user clicked Add on.
    expect(restored?.review?.findings.map((f) => f.severity)).toEqual([
      "gap",
      "mismatch",
    ]);
  });

  it("a run stages even when nothing else in the draft is set", () => {
    const draft: SetupDraft = { ...emptySetupDraft(), review: draftWithRuns().review };
    const stored = draftToStorage(draft);
    expect(stored.plan_review).toBeDefined();
    expect(readSetupDraft(asSettings(stored))?.review).toEqual(draft.review);
  });

  it("drops only the corrupted run, keeping the rest of the draft", () => {
    const stored = draftToStorage(draftWithRuns());
    // A severity the contract does not know — `coercePlanReview` throws.
    stored.plan_review = { summary: "x", findings: [{ severity: "nope", title: "t" }] };

    const restored = readSetupDraft(asSettings(stored));
    expect(restored?.review).toBeNull();
    expect(restored?.archetypeKey).toBe("local-services");
    expect(restored?.keywordStrategy?.assignments).toHaveLength(2);
    expect(restored?.entityPlan?.attachments).toHaveLength(1);
  });

  it("never reports an applied time for a run that is not there", () => {
    const stored = draftToStorage(draftWithRuns());
    delete stored.keyword_strategy;

    const restored = readSetupDraft(asSettings(stored));
    expect(restored?.keywordStrategy).toBeNull();
    expect(restored?.keywordsAppliedAt).toBeNull();
  });
});
