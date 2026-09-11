/** @jest-environment node */

/**
 * Resending a PROJECT invitation — the same honesty contract as the
 * organization twin (DD-091, law 4), kept under its own test because the two
 * routes are separate files that have already drifted from each other once.
 *
 * `inv_resend` has already minted a fresh token when this route runs, so the
 * recipient's earlier link is dead. A failed send must therefore report the
 * refreshed invitation and hand back the NEW link — never the flat 500 that
 * used to make it look as if nothing had happened.
 */

const sendEmail = jest.fn();
const getUser = jest.fn();
const rpc = jest.fn();

jest.mock("@/lib/email/client", () => ({
  ...jest.requireActual("@/lib/email/error-message"),
  sendEmail: (...args: unknown[]) => sendEmail(...args),
  emailTemplates: {
    projectInvitationReminder: (
      _project: string,
      _org: string,
      _inviter: string,
      url: string,
    ) => ({ subject: "Reminder", html: `<a href="${url}">accept</a>` }),
  },
}));

jest.mock("@/utils/supabase/workspaceDb", () => ({
  workspaceDb: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { name: "Apollo", organization_id: "org-1" },
            error: null,
          }),
        }),
      }),
    }),
  }),
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
    "https://www.aimatrx.com/api/projects/invitations/resend",
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
  rpc.mockResolvedValue({
    data: {
      target_type: "project",
      target_id: "proj-1",
      email: "dana@example.com",
      token: "fresh-tok-999",
      expires_at: null,
    },
    error: null,
  });
});

test("CONTROL: a successful resend mails the FRESH token's link, token only", async () => {
  sendEmail.mockResolvedValue({ success: true });

  const { response, body } = await resendAndReadOverTheWire();

  expect(response.status).toBe(200);
  expect(body.success).toBe(true);
  expect(body.emailSent).toBe(true);

  const [{ html }] = sendEmail.mock.calls[0] as [{ html: string }];
  expect(html).toContain("/invitations/project/accept/fresh-tok-999");
  expect(html).not.toContain("email=");
  expect(html).not.toContain("dana@example.com");
});

test("REFUSAL: a real provider failure is reported, not 500'd away, with the new link and a readable reason", async () => {
  sendEmail.mockResolvedValue({
    success: false,
    error: { name: "validation_error", message: "API key is invalid" },
  });

  const { response, body } = await resendAndReadOverTheWire();

  expect(response.status).toBe(200);
  expect(body.success).toBe(true);
  expect(body.emailSent).toBe(false);
  expect(typeof body.emailError).toBe("string");
  expect(body.emailError).toBe("API key is invalid");
  expect(body.acceptUrl).toBe(
    "https://www.aimatrx.com/invitations/project/accept/fresh-tok-999",
  );
});

test("REFUSAL: an Error instance (EMAIL_FROM / RESEND_API_KEY missing) also arrives as a sentence", async () => {
  sendEmail.mockResolvedValue({
    success: false,
    error: new Error("RESEND_API_KEY environment variable is not set"),
  });

  const { body } = await resendAndReadOverTheWire();

  expect(body.emailSent).toBe(false);
  expect(body.emailError).toBe(
    "RESEND_API_KEY environment variable is not set",
  );
});

// This file is a module (its own scope) — several route tests declare the
// same mock names.
export {};
