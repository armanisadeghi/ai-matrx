import { buildReviewReportHtml } from "./review-report";
import { createBlankReview, TOTAL_RATING_ITEMS } from "./schema";

describe("performance review report", () => {
  it("renders responsibilities and exactly two escaped report pages", () => {
    const review = createBlankReview();
    review.employeeName = "Jordan <Lee>";
    review.reviewPeriod = "2026";
    review.responsibilities = ["Own planning & delivery"];
    review.accomplishments = ["Reduced cycle time"];

    const html = buildReviewReportHtml(review, {
      average: null,
      ratedCount: 0,
      totalCount: TOTAL_RATING_ITEMS,
      categoryAverages: {},
    });

    expect(html.match(/data-review-report-page=/g)).toHaveLength(2);
    expect(html).toContain("Job responsibilities");
    expect(html).toContain("Own planning &amp; delivery");
    expect(html).toContain("Jordan &lt;Lee&gt;");
    expect(html).not.toContain("Jordan <Lee>");
  });
});
