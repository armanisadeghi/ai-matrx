const createClient = jest.fn();
const createAdminClient = jest.fn(() => {
  throw new Error("user feedback must not bypass RLS with a service-role client");
});
const getClaimsUser = jest.fn();
const checkIsUserAdmin = jest.fn();
const mapUserFeedbackRow = jest.fn();

jest.mock("@/utils/supabase/server", () => ({ createClient }));
jest.mock("@/utils/supabase/adminClient", () => ({ createAdminClient }));
jest.mock("@/utils/supabase/resolveUser", () => ({ getClaimsUser }));
jest.mock("@/utils/supabase/userSessionData", () => ({ checkIsUserAdmin }));
jest.mock("@/types/feedback-row-mapper", () => ({
  mapUserFeedbackRow,
  mapUserFeedbackRows: jest.fn(),
  mapFeedbackCommentRow: jest.fn(),
  mapFeedbackCommentRows: jest.fn(),
  mapFeedbackUserMessageRows: jest.fn(),
  mapSystemAnnouncementRow: jest.fn(),
  mapSystemAnnouncementRows: jest.fn(),
  parseFeedbackSummaryPayload: jest.fn(),
  parseFeedbackUserMessageJson: jest.fn(),
  parseGetTriageBatchResult: jest.fn(),
}));
jest.mock("@/lib/services/feedback-assignment-notifier", () => ({
  notifyFeedbackAssigned: jest.fn(),
}));

import { submitFeedback } from "./feedback.actions";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";

describe("submitFeedback authorization boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getClaimsUser.mockResolvedValue({
      data: {
        user: {
          id: USER_ID,
          email: "admin@admin.com",
          user_metadata: { username: "Harbor Dental Operations" },
        },
      },
    });
    checkIsUserAdmin.mockResolvedValue(false);
  });

  it("uses the caller-bound client so RLS receives the selected organization", async () => {
    const single = jest.fn().mockResolvedValue({ data: { id: "feedback-1" }, error: null });
    const select = jest.fn(() => ({ single }));
    const insert = jest.fn(() => ({ select }));
    const from = jest.fn(() => ({ insert }));
    const schema = jest.fn(() => ({ from }));
    createClient.mockResolvedValue({ schema });
    mapUserFeedbackRow.mockReturnValue({ id: "feedback-1" });

    await expect(
      submitFeedback({
        feedback_type: "bug",
        route: "/data/harbor-dental-patient-intake",
        organization_id: ORG_ID,
        description: "The appointment reminder rule does not save its weekday selection.",
      }),
    ).resolves.toEqual({ success: true, data: { id: "feedback-1" } });

    expect(createAdminClient).not.toHaveBeenCalled();
    expect(schema).toHaveBeenCalledWith("users");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      organization_id: ORG_ID,
      user_id: USER_ID,
      created_by: USER_ID,
      category_id: null,
      assigned_to: null,
    }));
  });

  it("turns the canonical RLS membership refusal into an actionable response", async () => {
    const single = jest.fn().mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "new row violates row-level security policy for table user_feedback",
      },
    });
    createClient.mockResolvedValue({
      schema: jest.fn(() => ({
        from: jest.fn(() => ({
          insert: jest.fn(() => ({ select: jest.fn(() => ({ single })) })),
        })),
      })),
    });

    await expect(
      submitFeedback({
        feedback_type: "bug",
        route: "/data/harbor-dental-patient-intake",
        organization_id: ORG_ID,
        description: "The appointment reminder rule does not save its weekday selection.",
      }),
    ).resolves.toEqual({
      success: false,
      error:
        "You are not a member of the organization this feedback names — pick one of yours from the avatar menu and send it again.",
    });
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
