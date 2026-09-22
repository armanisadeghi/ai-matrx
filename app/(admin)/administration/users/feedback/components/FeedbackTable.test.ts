import type { UserFeedback } from "@/types/feedback.types";

import {
  firstPopulatedFeedbackStage,
  getItemStage,
} from "./FeedbackTable";

const harborDentalFeedback: UserFeedback = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  organization_id: "33333333-3333-4333-8333-333333333333",
  username: "Harbor Dental Operations",
  feedback_type: "bug",
  route: "/data/harbor-dental-patient-intake",
  description: "The appointment reminder rule does not save its weekday selection.",
  status: "new",
  priority: "high",
  admin_notes: null,
  ai_assessment: null,
  autonomy_score: null,
  resolution_notes: null,
  image_file_ids: [],
  image_urls: null,
  created_at: "2026-09-22T08:00:00.000Z",
  updated_at: "2026-09-22T08:00:00.000Z",
  resolved_at: null,
  resolved_by: null,
  user_confirmed_at: null,
  parent_id: null,
  category_id: null,
  assigned_to: null,
  ai_solution_proposal: null,
  ai_suggested_priority: null,
  ai_complexity: null,
  ai_estimated_files: null,
  admin_direction: null,
  admin_decision: "pending",
  work_priority: null,
  testing_instructions: null,
  testing_url: null,
  testing_result: null,
  has_open_issues: false,
  metadata: {},
};

function feedbackAt(
  status: UserFeedback["status"],
  adminDecision: UserFeedback["admin_decision"] = "pending",
): UserFeedback {
  return {
    ...harborDentalFeedback,
    id: `${status}-${adminDecision}`,
    status,
    admin_decision: adminDecision,
  };
}

describe("feedback pipeline stage ownership", () => {
  it.each([
    [feedbackAt("new"), "untriaged"],
    [feedbackAt("triaged"), "decision"],
    [feedbackAt("in_progress", "approved"), "working"],
    [feedbackAt("awaiting_review", "approved"), "testing"],
    [feedbackAt("user_review", "approved"), "review"],
    [feedbackAt("resolved", "approved"), "done"],
    [feedbackAt("split", "split"), "done"],
    [feedbackAt("in_review", "rejected"), "done"],
  ] as const)("places %s in %s", (row, expected) => {
    expect(getItemStage(row)).toBe(expected);
  });

  it.each([
    [[feedbackAt("awaiting_review", "approved")], "testing"],
    [
      [
        feedbackAt("in_progress", "approved"),
        feedbackAt("triaged", "pending"),
      ],
      "decision",
    ],
    [[feedbackAt("split", "split")], "done"],
  ] as const)(
    "opens the first populated pipeline stage instead of an empty New stage",
    (rows, expected) => {
      expect(firstPopulatedFeedbackStage([...rows])).toBe(expected);
    },
  );
});
