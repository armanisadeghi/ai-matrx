/** @jest-environment node */

/**
 * The invitation email route's HONESTY contract (DD-091, law 4).
 *
 * The route used to answer `{success:true, emailSent:<whatever>}` and the
 * caller threw the answer away, so a misconfigured provider produced a green
 * "Invitation sent" toast over an email nobody received. These tests drive the
 * REAL exported handler with a real `Request`; only the two external edges —
 * Supabase and the mail provider — are stood in for, and the failing edge is
 * the actual failure shape the provider returns.
 */

const sendEmail = jest.fn();
const getUser = jest.fn();
const rpc = jest.fn();

jest.mock("@/lib/email/client", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
  emailTemplates: {
    organizationInvitation: (
      _org: string,
      _inviter: string,
      url: string,
    ) => ({ subject: "You're invited", html: `<a href="${url}">accept</a>` }),
  },
}));

jest.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: () => getUser() },
    rpc: (...args: unknown[]) => rpc(...args),
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { name: "Acme" }, error: null }),
          }),
        }),
      }),
    }),
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { POST } = require("./route") as typeof import("./route");

const INVITATION_ID = "3f1c2a10-8a7e-4c3e-9b0a-2f5d6e7c8a91";

function inviteRequest() {
  return new Request("https://www.aimatrx.com/api/organizations/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invitationId: INVITATION_ID }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.aimatrx.com";
  getUser.mockResolvedValue({
    data: { user: { id: "u1", email: "manager@acme.test", user_metadata: {} } },
    error: null,
  });
  rpc.mockResolvedValue({
    data: {
      target_type: "organization",
      target_id: "org-1",
      email: "dana@example.com",
      token: "tok-123",
      expires_at: null,
    },
    error: null,
  });
});

test("REFUSAL: a failed send is never reported as a sent invitation — it answers emailSent:false with the reason and the link to hand over", async () => {
  sendEmail.mockResolvedValue({
    success: false,
    error: "Resend: missing API key",
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await POST(inviteRequest() as any);
  const body = await response.json();

  // The invitation ROW is good — the failure is the email, so the request
  // itself succeeds and the row is never rolled back.
  expect(response.status).toBe(200);
  expect(body.success).toBe(true);
  // …but the screen must be able to tell the truth.
  expect(body.emailSent).toBe(false);
  expect(body.emailError).toContain("missing API key");
  expect(body.acceptUrl).toBe(
    "https://www.aimatrx.com/invitations/organization/accept/tok-123?email=dana%40example.com",
  );
});

test("CONTROL: a real send answers emailSent:true and hands back no remedy link", async () => {
  sendEmail.mockResolvedValue({ success: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await POST(inviteRequest() as any);
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body).toEqual({ success: true, emailSent: true });
  expect(sendEmail).toHaveBeenCalledTimes(1);
});

test("the emailed accept link carries the invited address, so a recipient with no account reaches sign-up prefilled", async () => {
  sendEmail.mockResolvedValue({ success: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await POST(inviteRequest() as any);

  const [{ html }] = sendEmail.mock.calls[0] as [{ html: string }];
  expect(html).toContain(
    "/invitations/organization/accept/tok-123?email=dana%40example.com",
  );
});
