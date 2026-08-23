/**
 * THE ONE review reader — the `batch_review` kind the rebuilt
 * `flashcards.review_batch` agent emits (fixture = the kind's canonical
 * sample, `__kind` ignored). It serves the LIVE lane return AND the persisted
 * `study_session.session_review` row, so all six keys must survive.
 */

import {
  isAwaitingCoachReview,
  parseSessionReview,
  parsedSessionReviewFromSummary,
} from "../utils/parseSessionReview";

const LIVE_REVIEW = {
  __kind: "batch_review",
  summary:
    "Strong on the overall equation; the consistent weak spot is WHERE each stage happens.",
  strengths: [
    "Recalls the overall photosynthesis equation reliably",
    "Distinguishes the light-dependent reactions from the Calvin cycle",
  ],
  weaknesses: [
    "Swaps thylakoid and stroma when asked about location",
    "Drops NADPH when listing the energy carriers",
  ],
  revisit_card_ids: ["c_0142", "c_0147", "c_0151"],
  secondary_score: 68,
  reorder: ["c_0147", "c_0142", "c_0151", "c_0139"],
};

describe("parseSessionReview (batch_review)", () => {
  it("reads all six keys of the live kind payload", () => {
    const review = parseSessionReview(LIVE_REVIEW);
    expect(review).toEqual({
      summary: LIVE_REVIEW.summary,
      strengths: LIVE_REVIEW.strengths,
      weaknesses: LIVE_REVIEW.weaknesses,
      revisitCardIds: ["c_0142", "c_0147", "c_0151"],
      secondaryScore: 68,
      reorder: ["c_0147", "c_0142", "c_0151", "c_0139"],
      speakText: expect.stringContaining("Strengths: Recalls the overall"),
    });
  });

  it("reads the same payload back off the persisted row (object, JSON string, plain string)", () => {
    expect(parseSessionReview(JSON.stringify(LIVE_REVIEW))?.reorder).toHaveLength(4);
    expect(parseSessionReview({ review: LIVE_REVIEW })?.revisitCardIds).toEqual([
      "c_0142",
      "c_0147",
      "c_0151",
    ]);
    expect(parseSessionReview("Nice session.")).toEqual({
      summary: "Nice session.",
      strengths: [],
      weaknesses: [],
      revisitCardIds: [],
      secondaryScore: null,
      reorder: [],
      speakText: "Nice session.",
    });
  });

  it("null when nothing usable; never throws", () => {
    expect(parseSessionReview(null)).toBeNull();
    expect(parseSessionReview("   ")).toBeNull();
    expect(parseSessionReview({ __kind: "batch_review" })).toBeNull();
    expect(parseSessionReview([1, 2])).toBeNull();
    expect(parseSessionReview({ summary: "", strengths: ["x"] })?.summary).toBe(
      "See strengths and areas to improve below.",
    );
  });

  it("the FastFire summary-only shim and the awaiting predicate agree with the reader", () => {
    expect(parsedSessionReviewFromSummary("Good.")?.reorder).toEqual([]);
    expect(isAwaitingCoachReview("fast_fire", "completed", null)).toBe(true);
    expect(isAwaitingCoachReview("fast_fire", "completed", LIVE_REVIEW)).toBe(false);
  });
});
