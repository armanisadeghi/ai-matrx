import { FEEDBACK_TYPES } from "@/types/feedback.types";
import { mapUserFeedbackRow } from "@/types/feedback-row-mapper";

type Row = Parameters<typeof mapUserFeedbackRow>[0];

/** A stored access request (RequestAccess → the platform team's queue). */
function row(feedback_type: string): Row {
  const base = {
    id: "f-1",
    user_id: "u-1",
    feedback_type,
    status: "new",
    priority: "medium",
    admin_decision: "pending",
    testing_result: null,
    ai_complexity: null,
  };
  return base as unknown as Row;
}

describe("feedback type vocabulary", () => {
  it("matches users.user_feedback_feedback_type_check exactly", () => {
    expect([...FEEDBACK_TYPES]).toEqual(["bug", "feature", "suggestion", "other", "request"]);
  });

  it("reads a stored access request instead of throwing on it", () => {
    expect(mapUserFeedbackRow(row("request")).feedback_type).toBe("request");
    expect(() => mapUserFeedbackRow(row("nonsense"))).toThrow(/Invalid feedback_type/);
  });
});
