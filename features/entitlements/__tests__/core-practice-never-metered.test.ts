// features/entitlements/__tests__/core-practice-never-metered.test.ts
//
// 🚨 PROGRAM LAW D-5 — CORE PRACTICE IS NEVER METERED. (Arman.)
//
//   Unlimited studying, review and all study modes stay free forever. Gating
//   applies to DEPTH and CONVENIENCE only.
//
// Until this file existed the law held only because nobody had yet added a
// capability that broke it: there was no invariant, no test, and no line in
// `features/entitlements/FEATURE.md`. Nothing stopped a future agent registering
// `education.study_session` and metering the act of studying.
//
// The forbidden vocabulary is DERIVED from the study spine (see
// `./studySpineVocabulary.ts`) rather than hand-typed, so a study mode that
// ships tomorrow is covered without anyone remembering to update a list.
//
// If this test fails, the fix is NOT to loosen it. It is to stop metering
// practice: meter the AI GENERATION that produces the material instead
// (`education.quiz_generate` is legal; `education.quiz_attempt` is not).

import {
  ALL_CAPABILITIES,
  CAPABILITY_REGISTRY,
  type Capability,
} from "../registry";
import {
  deriveCorePracticeTokens,
  deriveStudyModeVocabulary,
  metersCorePractice,
} from "./studySpineVocabulary";

describe("D-5 — core practice is never metered", () => {
  const coreTokens = deriveCorePracticeTokens();

  it("derives a non-trivial vocabulary from the study spine", () => {
    // A guard whose vocabulary silently emptied would pass forever. The
    // deriver throws on a broken scan; this asserts the shape of what it found.
    const modes = deriveStudyModeVocabulary();
    expect(modes.size).toBeGreaterThanOrEqual(10);
    expect(coreTokens.size).toBeGreaterThanOrEqual(25);
    expect(coreTokens.has("study")).toBe(true);
    expect(coreTokens.has("review")).toBe(true);
    expect(coreTokens.has("attempt")).toBe(true);
    expect(coreTokens.has("deck")).toBe(true);
    // AI cost words are NOT practice words — this is what keeps generation
    // capabilities legal.
    expect(coreTokens.has("generate")).toBe(false);
    expect(coreTokens.has("tutor")).toBe(false);
  });

  it("detects a capability that would meter the act of practicing", () => {
    // Positive controls. Every one of these is a capability someone could
    // plausibly register; every one of them violates D-5.
    const forbidden = [
      "education.study_session", // running a study session, any mode
      "education.study", // studying
      "education.review", // reviewing
      "education.due_review", // the due-review run
      "education.record_attempt", // recording an attempt
      "education.study_attempt",
      "education.open_deck", // opening a deck
      "education.deck_open",
      "education.flip_card",
      "education.classic_review", // a named mode…
      "education.fast_fire",
      "education.weak_area_drill",
      "education.match", // …including the ones with one-word names
      "education.quiz_attempt", // TAKING a quiz (generating one is legal)
      "education.take_practice_test",
      "education.start_session",
    ];
    for (const key of forbidden) {
      expect([key, metersCorePractice(key, coreTokens)]).toEqual([key, true]);
    }
  });

  it("leaves AI-cost capabilities alone (gating depth is allowed)", () => {
    // Negative controls: these meter GENERATION or a convenience gate, which
    // D-5 permits. A guard that flagged them would be pressure to weaken it.
    const allowed = [
      "education.generate_cards",
      "education.quiz_generate",
      "education.practice_test_generate",
      "education.card_enrichment",
      "education.card_image_generate",
      "education.tutor_message",
      "education.live_grade",
      "education.image_grade",
      "education.spoken_practice",
      "education.ingest_document",
      "education.game_room_size",
      "platform.points",
      "outreach.send",
    ];
    for (const key of allowed) {
      expect([key, metersCorePractice(key, coreTokens)]).toEqual([key, false]);
    }
  });

  it("no REGISTERED capability meters core practice", () => {
    const violations = ALL_CAPABILITIES.filter((c) =>
      metersCorePractice(c, coreTokens),
    );
    expect(violations).toEqual([]);
  });

  it("no ENFORCED capability meters core practice", () => {
    const violations = ALL_CAPABILITIES.filter(
      (c) => CAPABILITY_REGISTRY[c].enforced && metersCorePractice(c, coreTokens),
    );
    expect(violations).toEqual([]);
  });

  it("no capability GATES core practice behind a tier either", () => {
    // D-5 says free FOREVER — a `minTier` above free would lock practice just
    // as effectively as a meter, with no usage count to notice it by.
    const gated = ALL_CAPABILITIES.filter(
      (c: Capability) =>
        CAPABILITY_REGISTRY[c].minTier !== "free" &&
        metersCorePractice(c, coreTokens),
    );
    expect(gated).toEqual([]);
  });
});
