/** @jest-environment node */

/**
 * Resending an organization invitation — the honesty contract (DD-091, law 4).
 *
 * A resend carries a property a first invite does not: `inv_resend` has ALREADY
 * minted a fresh token by the time this route runs, so the recipient's earlier
 * link is dead whatever happens next. The route used to answer a flat
 * `500 {success:false,"Failed to send email"}` when the send failed, which told
 * the manager nothing happened while the person they were chasing was quietly
 * left holding a link that no longer works. It must instead say: the invitation
 * is refreshed, the email did not go out, here is the new link.
 *
 * The failure shapes below are the REAL ones `sendEmail` returns (an `Error`
 * instance and Resend's `{name,message}`), read back through `JSON.stringify`
 * exactly as the browser receives them — a string reason is what the banner
 * renders, and an object there throws in React.
 */

const sendEmail = jest.fn();
const getUser = jest.fn();
const rpc = jest.fn();

jest.mock("@/lib/email/client", () => ({
  ...jest.requireActual("@/lib/email/error-message"),
  sendEmail: (...args: unknown[]) => sendEmail(...args),
  emailTemplates: {
    organizationInvitationReminder: (
      _org: string,
      _inviter: string,
      url: string,
    ) => ({ subject: "Reminder", html: `<a href="${url}">accept</a>` }),
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
            maybeSingle: async () => ({ data: { name: "Acme" }, error: null }),
          }),
        }),
      }),
    }),
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { POST } = require("./route") as typeof import("./route");

const INVITATION_ID = "3f1c2a10-8a7e-4c3e-9b0a-2f5d6e7c8a91";

async function resendAndReadOverTheWire() {
  const request = new Request(
    "https://www.aimatrx.com/api/organizations/invitations/resend",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitationId: INVITATION_ID }),
    },
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await POST(request as any);
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
  // The FRESH token `inv_resend` just minted.
  rpc.mockResolvedValue({
    data: {
      target_type: "organization",
      target_id: "org-1",
      email: "dana@example.com",
      token: "fresh-tok-999",
      expires_at: null,
    },
    error: null,
  });
});

test("CONTROL: a successful resend mails the FRESH token's link and says so", async () => {
  sendEmail.mockResolvedValue({ success: true });

  const { response, body } = await resendAndReadOverTheWire();

  expect(response.status).toBe(200);
  expect(body.success).toBe(true);
  expect(body.emailSent).toBe(true);

  const [{ html, to }] = sendEmail.mock.calls[0] as [
    { html: string; to: string },
  ];
  expect(to).toBe("dana@example.com");
  expect(html).toContain("/invitations/organization/accept/fresh-tok-999");
  // The token and nothing else — no address in a URL.
  expect(html).not.toContain("email=");
  expect(html).not.toContain("dana@example.com");
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
])("REFUSAL: %s", (_label, providerError, expectedSentence) => {
  test("never 500s away a refreshed invitation — it reports emailSent:false with the NEW link", async () => {
    sendEmail.mockResolvedValue({ success: false, error: providerError });

    const { response, body } = await resendAndReadOverTheWire();

    // NOT a 500: the invitation is real and refreshed; only the email failed.
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.emailSent).toBe(false);
    expect(typeof body.emailError).toBe("string");
    expect(body.emailError).toBe(expectedSentence);
    // The remedy is the link the fresh token produced — handing back the old
    // one would send the manager to chase a link that is already dead.
    expect(body.acceptUrl).toBe(
      "https://www.aimatrx.com/invitations/organization/accept/fresh-tok-999",
    );
  });
});

// This file is a module (its own scope) — several route tests declare the
// same mock names.
export {};
