import {
  buildPerformanceReviewQuestionsPayload,
  buildPerformanceReviewValuesPayload,
} from "./copy";
import {
  createBlankReview,
  LIST_SECTIONS,
  RATING_SCHEMA,
  TOTAL_RATING_ITEMS,
} from "./schema";

describe("performance review AI copy", () => {
  it("exports every question with minimal guidance and no current answers", () => {
    const payload = buildPerformanceReviewQuestionsPayload();

    expect(payload).toContain(
      '<performance_review_questionnaire __kind="performance_review_questionnaire">',
    );
    expect(payload.match(/The ideal number is three\./g)).toHaveLength(
      LIST_SECTIONS.length,
    );
    for (const category of RATING_SCHEMA) {
      for (const item of category.items) {
        expect(payload).toContain(item.label);
      }
    }
    expect(payload).not.toContain("Jordan Lee");
    expect(payload).not.toContain("Own quarterly planning");
  });

  it("exports the values currently entered with nested kind markers", () => {
    const review = createBlankReview();
    review.employeeName = "Jordan Lee";
    review.responsibilities = ["Own quarterly planning"];

    const payload = buildPerformanceReviewValuesPayload(
      review,
      {
        average: null,
        ratedCount: 0,
        totalCount: TOTAL_RATING_ITEMS,
        completionPct: 0,
        categoryAverages: {},
      },
      { routeLabel: "Performance Review Demo" },
    );

    expect(JSON.stringify(payload)).toContain("Jordan Lee");
    expect(JSON.stringify(payload)).toContain("Own quarterly planning");
    expect(payload.data).toMatchObject({
      __kind: "performance_review_current_values",
      employee_details: {
        __kind: "performance_review_employee_details",
      },
    });
    expect(payload.attributes).toMatchObject({
      __kind: "performance_review_copy_attributes",
    });
    expect(payload.context).toMatchObject({
      __kind: "performance_review_copy_context",
    });
  });
});
