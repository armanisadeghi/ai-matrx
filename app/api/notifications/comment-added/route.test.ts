import { POST } from "./route";
import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import { sendCommentNotificationEmail } from "@/lib/email/notificationService";

jest.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({
    status: init?.status ?? 200, json: async () => body,
  }) },
}));
jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }));
jest.mock("@/utils/supabase/resolveUser", () => ({ getClaimsUser: jest.fn() }));
jest.mock("@/lib/email/notificationService", () => ({ sendCommentNotificationEmail: jest.fn() }));

const actor = "a0111111-1111-4111-8111-111111111111";
const owner = "b0222222-2222-4222-8222-222222222222";
const org = "e0555555-5555-4555-8555-555555555555";
const commentId = "c0333333-3333-4333-8333-333333333333";
const taskId = "d0444444-4444-4444-8444-444444444444";

function request(body: object): Request {
  return { json: async () => body } as Request;
}

function query(data: unknown) {
  return {
    select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(), maybeSingle: jest.fn().mockResolvedValue({ data, error: null }),
  };
}

describe("saved comment email admission", () => {
  let commentQuery: ReturnType<typeof query>;
  let taskQuery: ReturnType<typeof query>;
  const profileQuery = query({ display_name: "Alex" });

  beforeEach(() => {
    jest.clearAllMocks();
    commentQuery = query({ id: commentId, organization_id: org, entity_type: "task",
      entity_id: taskId, body: "The figures need one more pass.", created_by: actor });
    taskQuery = query({ id: taskId, organization_id: org, created_by: owner,
      title: "Review the monthly report" });
    jest.mocked(createClient).mockResolvedValue({
      schema: jest.fn((schema: string) => ({ from: jest.fn(() =>
        schema === "platform" ? commentQuery : schema === "workspace" ? taskQuery : profileQuery),
      })),
    } as never);
    jest.mocked(getClaimsUser).mockResolvedValue({ data: { user: { id: actor } }, error: null } as never);
    jest.mocked(sendCommentNotificationEmail).mockResolvedValue({ success: true, message: "Sent" });
  });

  it("uses persisted comment and resource, never browser-supplied recipient or text", async () => {
    const response = await POST(request({ commentId, resourceOwnerId: actor,
      commentText: "Forged text", resourceTitle: "Forged title" }));

    expect(response.status).toBe(200);
    expect(sendCommentNotificationEmail).toHaveBeenCalledWith({
      resourceOwnerId: owner, organizationId: org, commenterName: "Alex",
      commentText: "The figures need one more pass.", resourceTitle: "Review the monthly report",
      resourceType: "task", resourceId: taskId,
    });
  });

  it("refuses a comment created by another account", async () => {
    commentQuery.maybeSingle.mockResolvedValue({ data: { id: commentId, organization_id: org,
      entity_type: "task", entity_id: taskId, body: "Private", created_by: owner }, error: null });

    const response = await POST(request({ commentId }));

    expect(response.status).toBe(404);
    expect(sendCommentNotificationEmail).not.toHaveBeenCalled();
  });

  it("refuses a resource in another organization", async () => {
    taskQuery.maybeSingle.mockResolvedValue({ data: { id: taskId, organization_id: owner,
      created_by: owner, title: "Wrong tenant" }, error: null });

    const response = await POST(request({ commentId }));

    expect(response.status).toBe(404);
    expect(sendCommentNotificationEmail).not.toHaveBeenCalled();
  });

  it("skips the owner's own comment", async () => {
    taskQuery.maybeSingle.mockResolvedValue({ data: { id: taskId, organization_id: org,
      created_by: actor, title: "Own task" }, error: null });

    const response = await POST(request({ commentId }));

    expect(response.status).toBe(200);
    expect(sendCommentNotificationEmail).not.toHaveBeenCalled();
  });
});
