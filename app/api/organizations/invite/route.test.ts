/** @jest-environment node */
import { withClaims as mockWithClaims } from "@/test-utils/supabase-auth";

/**
 * The organization invitation route's contract, now that the notice rides the
 * notification spine (`invitation.organization`).
 *
 * - The FACTS go to `communication.notify_from_sql`: the address, the account
 *   behind it (so the paired DM fires), the token-only accept path, the inviter.
 * - The answer stays honest (DD-091, law 4): when the email leg is not on its
 *   way the route says so in a readable sentence and hands back the accept link,
 *   and the invitation row is never rolled back over it.
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
      id: INVITATION_ID,
      organization_id: "org-1",
      target_type: "organization",
      target_id: "org-1",
      email: "dana@example.com",
      invited_user_id: null,
      token: "tok-123",
      expires_at: null,
    },
    error: null,
  });
  userIdForEmail.mockResolvedValue("dana-user");
});

test("the notice carries the account behind the address, so the DM fires beside the email", async () => {
  notifyFromSql.mockResolvedValue({
    queued: ["dm", "email", "in_app"],
    skipped: [],
    say: "An email is on its way to them.",
  });

  const { response, body } = await postAndReadOverTheWire();

  expect(response.status).toBe(200);
  expect(body).toMatchObject({ success: true, emailSent: true, queued: ["dm", "email", "in_app"] });
  expect(body.acceptUrl).toBeUndefined();
  const [, args] = notifyFromSql.mock.calls[0];
  expect(args).toMatchObject({
    organizationId: "org-1",
    eventKey: "invitation.organization",
    recipientUserId: "dana-user",
    toAddress: "dana@example.com",
    deepLink: "/invitations/organization/accept/tok-123",
    dm: { sender_user_id: "u1" },
  });
  expect(args.payload.invite).toMatchObject({ organization: "Acme", token: "tok-123" });
});

test("REFUSAL: an email that is not on its way is reported with a readable sentence and the link", async () => {
  notifyFromSql.mockResolvedValue({
    queued: [],
    skipped: [{ channel: "all", why: "event_not_declared" }],
    say: "This server does not know the invitation.organization notice yet, so nothing was sent.",
  });

  const { response, body } = await postAndReadOverTheWire();

  expect(response.status).toBe(200);
  expect(body.success).toBe(true);
  expect(body.emailSent).toBe(false);
  expect(typeof body.emailError).toBe("string");
  expect(body.emailError).toContain("nothing was sent");
  expect(body.acceptUrl).toBe(
    "https://www.aimatrx.com/invitations/organization/accept/tok-123",
  );
});

test("REFUSAL: the accept link carries the token and NOTHING else — no address in a URL", async () => {
  notifyFromSql.mockResolvedValue({ queued: ["email"], skipped: [], say: "ok" });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await POST(inviteRequest() as any);

  const [, args] = notifyFromSql.mock.calls[0];
  expect(args.deepLink).toBe("/invitations/organization/accept/tok-123");
  expect(args.deepLink).not.toContain("email=");
  expect(args.deepLink).not.toContain("dana@example.com");
});

// This file is a module (its own scope) — several route tests declare the
// same mock names.
export {};
