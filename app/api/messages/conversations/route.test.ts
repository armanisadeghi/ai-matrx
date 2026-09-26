import { POST } from "./route";
import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import type { NextRequest } from "next/server";

jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));
jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }));
jest.mock("@/utils/supabase/resolveUser", () => ({ getClaimsUser: jest.fn() }));

const adminId = "d1000000-0000-4000-8000-000000000001";
const recipientId = "d2000000-0000-4000-8000-000000000002";
const firstOrg = "d3000000-0000-4000-8000-000000000003";
const secondOrg = "d4000000-0000-4000-8000-000000000004";
const firstConversation = "d5000000-0000-4000-8000-000000000005";
const secondConversation = "d6000000-0000-4000-8000-000000000006";

function request(organizationId: string): NextRequest {
  return {
    headers: { get: (name: string) => name === "X-Organization-Id" ? organizationId : null },
    json: async () => ({ type: "direct", participant_ids: [recipientId] }),
  } as NextRequest;
}

it("uses only the organization-aware atomic RPC for direct conversations", async () => {
  const rpc = jest.fn().mockImplementation(async (_name, args) => ({
    data: args.p_organization_id === firstOrg ? firstConversation : secondConversation,
    error: null,
  }));
  jest.mocked(createClient).mockResolvedValue({ rpc } as never);
  jest.mocked(getClaimsUser).mockResolvedValue({
    data: { user: { id: adminId } }, error: null,
  } as never);

  const first = await POST(request(firstOrg));
  const second = await POST(request(secondOrg));

  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  expect(await first.json()).toEqual({
    success: true,
    data: { ConversationID: firstConversation },
    msg: "Conversation ready",
  });
  expect(await second.json()).toEqual({
    success: true,
    data: { ConversationID: secondConversation },
    msg: "Conversation ready",
  });
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(rpc).toHaveBeenNthCalledWith(1, "dm_get_or_create_direct_conversation", {
    p_user1_id: adminId,
    p_user2_id: recipientId,
    p_organization_id: firstOrg,
  });
  expect(rpc).toHaveBeenNthCalledWith(2, "dm_get_or_create_direct_conversation", {
    p_user1_id: adminId,
    p_user2_id: recipientId,
    p_organization_id: secondOrg,
  });
});
