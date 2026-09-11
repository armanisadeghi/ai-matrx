/** @jest-environment node */

/**
 * The invitation email route's HONESTY contract (DD-091, law 4).
 *
 * The route used to answer `{success:true, emailSent:<whatever>}` and the
 * caller threw the answer away, so a misconfigured provider produced a green
 * "Invitation sent" toast over an email nobody received.
 *
 * 🚨 THE FAILURES HERE ARE THE REAL ONES. `sendEmail` never returns a string
 * error — its three failure returns are `new Error(...)` (EMAIL_FROM missing),
 * Resend's `{name, message}`, and whatever the `catch` caught (where a missing
 * RESEND_API_KEY lands). The first version of this test fed it a *string*, a
 * shape the real code cannot produce, and so stayed green while the honest
 * banner threw `Objects are not valid as a React child` in production
 * (verification finding I1, 2026-09-11). Every case below drives the REAL
 * exported handler with a real `Request` and one of those REAL shapes, and
 * asserts the answer survives `JSON.stringify` as a readable sentence.
 */

const sendEmail = jest.fn();
const getUser = jest.fn();
const rpc = jest.fn();

jest.mock("@/lib/email/client", () => ({
  ...jest.requireActual("@/lib/email/error-message"),
  sendEmail: (...args: unknown[]) => sendEmail(...args),
  emailTemplates: {
    organizationInvitation: (_org: string, _inviter: string, url: string) => ({
      subject: "You're invited",
      html: `<a href="${url}">accept</a>`,
    }),
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

/** What the client actually receives: the body after a JSON round trip. */
async function postAndReadOverTheWire() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await POST(inviteRequest() as any);
  const body = JSON.parse(JSON.stringify(await response.json()));
  return { response, body };
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

describe.each([
  [
    "EMAIL_FROM missing (an Error instance)",
    new Error("EMAIL_FROM is not configured"),
    "EMAIL_FROM is not configured",
  ],
  [
    "Resend rejected it (a {name,message} object)",
    { name: "validation_error", message: "API key is invalid" },
    "API key is invalid",
  ],
  [
    "RESEND_API_KEY missing (the catch path, an Error instance)",
    new Error("RESEND_API_KEY environment variable is not set"),
    "RESEND_API_KEY environment variable is not set",
  ],
])("REFUSAL: %s", (_label, providerError, expectedSentence) => {
  test("is reported as emailSent:false with a READABLE sentence and the link to hand over", async () => {
    sendEmail.mockResolvedValue({ success: false, error: providerError });

    const { response, body } = await postAndReadOverTheWire();

    // The invitation ROW is good — the failure is the email, so the request
    // succeeds and the row is never rolled back.
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.emailSent).toBe(false);
    // The screen renders this. It MUST be a string after the wire, or React
    // throws while drawing the honest banner.
    expect(typeof body.emailError).toBe("string");
    expect(body.emailError).toBe(expectedSentence);
    expect(body.acceptUrl).toBe(
      "https://www.aimatrx.com/invitations/organization/accept/tok-123",
    );
  });
});

test("CONTROL: a real send answers emailSent:true and hands back no remedy link", async () => {
  sendEmail.mockResolvedValue({ success: true });

  const { response, body } = await postAndReadOverTheWire();

  expect(response.status).toBe(200);
  expect(body).toEqual({ success: true, emailSent: true });
  expect(sendEmail).toHaveBeenCalledTimes(1);
});

test("REFUSAL: the emailed accept link carries the token and NOTHING else — no address in a URL", async () => {
  sendEmail.mockResolvedValue({ success: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await POST(inviteRequest() as any);

  const [{ html }] = sendEmail.mock.calls[0] as [{ html: string }];
  expect(html).toContain("/invitations/organization/accept/tok-123");
  expect(html).not.toContain("email=");
  expect(html).not.toContain("dana@example.com");
});
