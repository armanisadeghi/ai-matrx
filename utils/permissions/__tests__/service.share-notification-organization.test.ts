/**
 * @jest-environment node
 */
/**
 * utils/permissions/service.ts — WHERE THE SHARE'S IN-APP NOTIFICATION IS FILED (lane
 * ACCESS-FIX-18, VERIFIER-18 H4).
 *
 * On production, pressing Share on a table and sharing with a colleague raised "Which workspace
 * is this for?" over 44 organizations, and the pick closed the Share dialog: the grant had
 * landed, but the notification DM went through `sendDirectActionMessage` with no organization,
 * which fell back to the active organization and — with none picked — to the organization gate.
 * The table page had already named the table's organization.
 *
 * The SUT is the real `shareWithUser`; the boundaries beneath it are replaced: the grant RPC
 * (answers the store's success shape), the signed-in user, the email fetch, and the messaging
 * door, whose ARGUMENTS are the forcing output. Nothing in this fixture but the service can put
 * an organization on that call.
 */

const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));
jest.mock("@/utils/supabase/claimsUser", () => ({
  getClaimsUser: jest.fn(async () => ({
    data: {
      user: { id: "c1f0a8de-5b7e-4d2a-9a51-3e0f6c2b7d11", email: "front-desk@cedarridgevet.test", user_metadata: { full_name: "Dana Whitfield" } },
    },
  })),
}));
let activeOrganizationId: string | null = null;
jest.mock("@/lib/organizations/activeOrg", () => ({
  getActiveOrgId: () => activeOrganizationId,
}));
const sendDirectActionMessage = jest.fn(async (..._args: unknown[]) => ({ conversationId: "c", messageId: "m" }));
jest.mock("@/features/messaging/service/sendDirectActionMessage", () => ({
  sendDirectActionMessage: (...args: unknown[]) => sendDirectActionMessage(...args),
}));

import { shareWithUser } from "../service";

const CEDAR_RIDGE = "7d2c4e91-0b3a-4f6e-8c15-a9e2d3b4f507";
const WORKING_IN = "3a9b1c7e-2f4d-4e8a-b6c0-5d1e9f2a8c34";
const APPOINTMENTS_TABLE = "b8e5f1a2-6c3d-4a7b-9e0f-1d2c3b4a5e6f";
const RECEPTIONIST = "e4d3c2b1-a0f9-4e8d-8c7b-6a5f4e3d2c1b";

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("shareWithUser files its notification in the shared object's organization", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: { success: true, message: "Shared" }, error: null });
    sendDirectActionMessage.mockClear();
    activeOrganizationId = null;
    global.fetch = jest.fn(async () => new Response("{}")) as unknown as typeof fetch;
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("names the TABLE's organization, although another organization is the one picked", async () => {
    activeOrganizationId = WORKING_IN;
    const result = await shareWithUser({
      resourceType: "record",
      resourceId: APPOINTMENTS_TABLE,
      userId: RECEPTIONIST,
      permissionLevel: "viewer",
      resourceName: "Appointments",
      organizationId: CEDAR_RIDGE,
    });
    await settle();

    expect(result.success).toBe(true);
    expect(sendDirectActionMessage).toHaveBeenCalledTimes(1);
    expect(sendDirectActionMessage).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: RECEPTIONIST, organizationId: CEDAR_RIDGE }),
    );
  });

  it("with no object organization and none picked, never asks: the DM is skipped and said", async () => {
    const result = await shareWithUser({
      resourceType: "record",
      resourceId: APPOINTMENTS_TABLE,
      userId: RECEPTIONIST,
      permissionLevel: "viewer",
      resourceName: "Appointments",
    });
    await settle();

    expect(result.success).toBe(true);
    // The unnamed call is the door that raised "Which workspace is this for?".
    expect(sendDirectActionMessage).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/not sent[\s\S]*Remedy/));
  });
});
