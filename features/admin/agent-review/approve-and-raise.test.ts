/**
 * Guard for "Approve and raise" (features/admin/agent-review/approve-and-raise.ts).
 *
 * THE BREAKS THIS CATCHES — each one is a production change that makes a case
 * below go red:
 *  1. Reporting success when the feedback filing failed (the silent
 *     half-success: the row is approved and the note vanished).
 *  2. Filing the item without `metadata.raised_from_review_row`, which is the
 *     only thing tying the raised note back to the row that exposed it.
 *  3. Filing an orphan feedback item for a review whose approval failed.
 *  4. Re-approving (and re-posting the note to the conversation) on the retry
 *     that follows `approved_not_raised`.
 *  5. Approving through anything other than the queue's existing Approve path
 *     — the note must reach the row's conversation as the `approved` event.
 *
 * `recordHumanReviewAction` (Supabase writes) and `submitFeedback` (a server
 * action) are the SUT's external dependencies and are the only doubles. The
 * ordering, the payload, the outcome classification and the retry rule are
 * owned by the SUT and never stubbed. Two cases expect DIFFERENT feedback ids
 * and DIFFERENT hrefs, so a constant return cannot satisfy the suite.
 */

import { submitFeedback } from "@/actions/feedback.actions";
import { recordHumanReviewAction } from "@/features/admin/agent-review/service";
import { approveAndRaise } from "@/features/admin/agent-review/approve-and-raise";
import type { ReviewQueueRow } from "@/features/admin/agent-review/types";
import type { UserFeedback } from "@/types/feedback.types";

jest.mock("@/actions/feedback.actions", () => ({
  submitFeedback: jest.fn(),
}));
jest.mock("@/features/admin/agent-review/service", () => ({
  recordHumanReviewAction: jest.fn(),
}));

const mockSubmitFeedback = jest.mocked(submitFeedback);
const mockRecordHumanReviewAction = jest.mocked(recordHumanReviewAction);

/** A complete row, shaped exactly like the generated table type. */
const ROW: ReviewQueueRow = {
  id: "11111111-2222-4333-8444-555555555555",
  created_at: "2026-09-16T10:00:00.000Z",
  updated_at: "2026-09-16T11:00:00.000Z",
  title: "Approve and raise",
  url: "https://manage.aimatrx.com/administration/users/agent-review",
  instructions: "Open the row and use the new action.",
  source: "agent",
  status: "ready_for_human",
  feedback: null,
  feedback_at: null,
  metadata: { origin: { agent_label: "review-system" } },
  domain_id: "99999999-8888-4777-8666-555555555555",
  feature_id: null,
  repo_slug: "ai-matrx",
  conversation_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
};

/** A complete `UserFeedback`, as the server action returns one. */
function feedbackItem(id: string): UserFeedback {
  return {
    id,
    user_id: "77777777-6666-4555-8444-333333333333",
    organization_id: ORG,
    username: "admin@admin.com",
    feedback_type: "bug",
    route: "/administration/users/agent-review/11111111-2222-4333-8444-555555555555",
    description: "The queue had no way to approve and still start a thread.",
    status: "new",
    priority: "medium",
    admin_notes: null,
    ai_assessment: null,
    autonomy_score: null,
    resolution_notes: null,
    image_file_ids: [],
    image_urls: null,
    created_at: "2026-09-16T12:00:00.000Z",
    updated_at: "2026-09-16T12:00:00.000Z",
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
    metadata: { raised_from_review_row: ROW.id },
  } satisfies UserFeedback;
}

const NOTE = "  Approving this, but the queue itself needs a way to do both.  ";
const ORG = "0d3f1a2b-4c5d-4e6f-8a7b-9c0d1e2f3a4b";
const TRIMMED = "Approving this, but the queue itself needs a way to do both.";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("approveAndRaise", () => {
  it("approves through the queue's Approve path and files the note stamped with the row", async () => {
    mockRecordHumanReviewAction.mockResolvedValue(undefined);
    mockSubmitFeedback.mockResolvedValue({
      success: true,
      data: feedbackItem("fb-1111"),
    });

    await expect(
      approveAndRaise({ row: ROW, userId: "user-1", note: NOTE, organizationId: ORG }),
    ).resolves.toEqual({
      status: "approved_and_raised",
      feedbackId: "fb-1111",
      feedbackHref: "/administration/users/feedback?feedback=fb-1111",
    });

    expect(mockRecordHumanReviewAction).toHaveBeenCalledTimes(1);
    expect(mockRecordHumanReviewAction).toHaveBeenCalledWith({
      row: ROW,
      userId: "user-1",
      content: TRIMMED,
      status: "approved",
    });
    expect(mockSubmitFeedback).toHaveBeenCalledTimes(1);
    expect(mockSubmitFeedback).toHaveBeenCalledWith({
      feedback_type: "bug",
      route:
        "/administration/users/agent-review/11111111-2222-4333-8444-555555555555",
      description: TRIMMED,
      organization_id: ORG,
      metadata: {
        raised_from_review_row: "11111111-2222-4333-8444-555555555555",
      },
    });
  });

  it("refuses without an organization BEFORE approving — never an approved row whose note can never file", async () => {
    await expect(
      approveAndRaise({ row: ROW, userId: "user-1", note: NOTE, organizationId: null }),
    ).resolves.toEqual({
      status: "not_approved",
      reason:
        "Select an organization before raising a note \u2014 the feedback item is filed under one organization. Pick yours from the avatar menu.",
    });
    expect(mockRecordHumanReviewAction).not.toHaveBeenCalled();
    expect(mockSubmitFeedback).not.toHaveBeenCalled();
  });

  it("on the retry lane, a missing organization is reported as approved_not_raised", async () => {
    await expect(
      approveAndRaise({
        row: ROW,
        userId: "user-1",
        note: NOTE,
        organizationId: "  ",
        alreadyApproved: true,
      }),
    ).resolves.toMatchObject({ status: "approved_not_raised" });
    expect(mockRecordHumanReviewAction).not.toHaveBeenCalled();
    expect(mockSubmitFeedback).not.toHaveBeenCalled();
  });

  it("says the row is approved and the note was NOT raised when filing fails", async () => {
    mockRecordHumanReviewAction.mockResolvedValue(undefined);
    mockSubmitFeedback.mockResolvedValue({
      success: false,
      error: "new row violates row-level security policy",
    });

    await expect(
      approveAndRaise({ row: ROW, userId: "user-1", note: NOTE, organizationId: ORG }),
    ).resolves.toEqual({
      status: "approved_not_raised",
      reason: "new row violates row-level security policy",
    });
  });

  it("says the same when the filing call itself throws", async () => {
    mockRecordHumanReviewAction.mockResolvedValue(undefined);
    mockSubmitFeedback.mockRejectedValue(new Error("Failed to fetch"));

    await expect(
      approveAndRaise({ row: ROW, userId: "user-1", note: NOTE, organizationId: ORG }),
    ).resolves.toEqual({
      status: "approved_not_raised",
      reason: "Failed to fetch",
    });
  });

  it("never files an orphan item when the approval fails", async () => {
    mockRecordHumanReviewAction.mockRejectedValue(
      new Error("This review item has no conversation thread."),
    );

    await expect(
      approveAndRaise({ row: ROW, userId: "user-1", note: NOTE, organizationId: ORG }),
    ).resolves.toEqual({
      status: "not_approved",
      reason: "This review item has no conversation thread.",
    });
    expect(mockSubmitFeedback).not.toHaveBeenCalled();
  });

  it("retries the filing ONLY — a retry never approves or re-posts the note", async () => {
    mockSubmitFeedback.mockResolvedValue({
      success: true,
      data: feedbackItem("fb-2222"),
    });

    await expect(
      approveAndRaise({
        row: ROW,
        userId: "user-1",
        note: NOTE,
        organizationId: ORG,
        alreadyApproved: true,
      }),
    ).resolves.toEqual({
      status: "approved_and_raised",
      feedbackId: "fb-2222",
      feedbackHref: "/administration/users/feedback?feedback=fb-2222",
    });

    expect(mockRecordHumanReviewAction).not.toHaveBeenCalled();
    expect(mockSubmitFeedback).toHaveBeenCalledTimes(1);
  });

  it("refuses an empty note without approving or filing anything", async () => {
    await expect(
      approveAndRaise({
        row: ROW,
        userId: "user-1",
        note: "   ",
        organizationId: ORG,
      }),
    ).resolves.toEqual({
      status: "not_approved",
      reason:
        "Write the note you want to raise. Approve on its own is the button for a review with nothing to raise.",
    });
    expect(mockRecordHumanReviewAction).not.toHaveBeenCalled();
    expect(mockSubmitFeedback).not.toHaveBeenCalled();
  });
});
