/** @jest-environment node */
import { withClaims as mockWithClaims } from "@/test-utils/supabase-auth";

/**
 * Resending a ORGANIZATION invitation through the notification spine
 * (`invitation.organization_reminder`), with the honesty contract kept (DD-091, law 4).
 *
 * `inv_resend` has already minted a fresh token when this route runs, so the
 * recipient's earlier link is dead. The notice must carry the NEW token, and a
 * notice whose email is not on its way must hand back the NEW link — never a
 * flat 500 that makes it look as if nothing had happened.
 */

const getUser = jest.fn();
const rpc = jest.fn();
const notifyFromSql = jest.fn();
const userIdForEmail = jest.fn();

jest.mock("server-only", () => ({}));
jest.mock("@/utils/supabase/adminClient", () => ({ createAdminClient: () => ({}) }));
jest.mock("@/lib/notifications/notifyFromSql", () => ({
  ...jest.requireActual("@/lib/notifications/notifyFromSql"),
  notifyFromSql: (...args: unknown[]) => notifyFromSql(...args),
  userIdForEmail: (...args: unknown[]) => userIdForEmail(...args),
}));


jest.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: mockWithClaims({ getUser: () => getUser() }),
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
  const request = new Request("https://www.aimatrx.com/api/organizations/invitations/resend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invitationId: INVITATION_ID }),
  });
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
      id: INVITATION_ID,
      organization_id: "org-1",
      target_type: "organization",
      target_id: "target-1",
      email: "dana@example.com",
      invited_user_id: null,
      token: "fresh-tok-999",
      expires_at: null,
    },
    error: null,
  });
  userIdForEmail.mockResolvedValue(null);
});

test("CONTROL: a resend queues the FRESH token's link, token only", async () => {
  notifyFromSql.mockResolvedValue({ queued: ["email"], skipped: [], say: "An email is on its way to them." });

  const { response, body } = await resendAndReadOverTheWire();

  expect(response.status).toBe(200);
  expect(body.success).toBe(true);
  expect(body.emailSent).toBe(true);
  const [, args] = notifyFromSql.mock.calls[0];
  expect(args.eventKey).toBe("invitation.organization_reminder");
  expect(args.toAddress).toBe("dana@example.com");
  // No account behind the address: email only, no DM to a stranger.
  expect(args.recipientUserId).toBeNull();
  expect(args.deepLink).toBe("/invitations/organization/accept/fresh-tok-999");
  expect(args.deepLink).not.toContain("dana@example.com");
  // Each real resend is its own notice: the fresh token is in the key.
  expect(args.dedupeKey).toContain("fresh-tok-999");
});

test("REFUSAL: an email that is not on its way is reported, not 500'd away, with the NEW link", async () => {
  notifyFromSql.mockResolvedValue({
    queued: [],
    skipped: [{ channel: "email", why: "suppressed" }],
    say: "Nothing could be sent to them.",
  });

  const { response, body } = await resendAndReadOverTheWire();

  expect(response.status).toBe(200);
  expect(body.success).toBe(true);
  expect(body.emailSent).toBe(false);
  expect(body.emailError).toBe("Nothing could be sent to them.");
  expect(body.acceptUrl).toBe(
    "https://www.aimatrx.com/invitations/organization/accept/fresh-tok-999",
  );
});

// This file is a module (its own scope) — several route tests declare the
// same mock names.
export {};
