/** @jest-environment node */
/**
 * POST /api/person/timezone — the two things that make this route safe.
 *
 * 1. AN UNAUTHENTICATED CALLER NEVER REACHES THE DATABASE.
 *    `communication.record_person_timezone` is SECURITY DEFINER and is called
 *    here with the service-role admin client, which bypasses RLS entirely. The
 *    session check is therefore the ONLY thing standing between an anonymous
 *    POST and a privileged write. "401" is not enough on its own — the RPC must
 *    not have been called at all, which is what this asserts.
 *
 * 2. THE USER ID COMES FROM THE SESSION, NEVER FROM THE BODY.
 *    An admin-client RPC that took `p_user_id` from request JSON would let any
 *    signed-in person record a timezone against anyone else's account. The
 *    control case sends a DIFFERENT `user_id` in the body and proves the
 *    session's id is what reaches the database.
 *
 * Both fail against the pre-change tree for the plainest reason: the route did
 * not exist.
 */

import { NextRequest } from "next/server";
import { withClaims } from "@/test-utils/supabase-auth";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { ensureOrgIdServer } from "@/lib/organizations/personalOrg";
import { POST } from "./route";

jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }));
jest.mock("@/utils/supabase/adminClient", () => ({
  createAdminClient: jest.fn(),
}));
jest.mock("@/lib/organizations/personalOrg", () => ({
  ensureOrgIdServer: jest.fn(),
}));

const createClientMock = jest.mocked(createClient);
const createAdminClientMock = jest.mocked(createAdminClient);
const ensureOrgIdServerMock = jest.mocked(ensureOrgIdServer);

const SESSION_USER_ID = "11111111-1111-4111-8111-111111111111";
const SOMEONE_ELSE_ID = "22222222-2222-4222-8222-222222222222";
const ORGANIZATION_ID = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";

const rpc = jest.fn();

function signedIn(userId: string | null) {
  createClientMock.mockResolvedValue({
    auth: withClaims({
      getUser: async () => ({ data: { user: userId ? { id: userId } : null } }),
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

function request(body: Record<string, unknown>): NextRequest {
  return new NextRequest("https://app.example.test/api/person/timezone", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Organization-Id": ORGANIZATION_ID,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/person/timezone", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rpc.mockResolvedValue({
      data: [
        {
          outcome: "stored",
          timezone: "America/Los_Angeles",
          timezone_source: "browser",
        },
      ],
      error: null,
    });
    createAdminClientMock.mockReturnValue({
      schema: () => ({ rpc }),
    } as unknown as ReturnType<typeof createAdminClient>);
    ensureOrgIdServerMock.mockResolvedValue(ORGANIZATION_ID);
  });

  it("REFUSAL: an unauthenticated caller gets 401 and the RPC is never called", async () => {
    signedIn(null);

    const response = await POST(request({ timezone: "America/Los_Angeles" }));

    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    // The admin client bypasses RLS — it must not even be constructed.
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("IDENTITY: a user_id in the body is ignored; the session's id is what is recorded", async () => {
    signedIn(SESSION_USER_ID);

    const response = await POST(
      request({
        timezone: "America/Los_Angeles",
        source: "sign_in",
        // A caller trying to write a timezone onto somebody else's person.
        user_id: SOMEONE_ELSE_ID,
        p_user_id: SOMEONE_ELSE_ID,
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe("record_person_timezone");
    expect(args.p_user_id).toBe(SESSION_USER_ID);
    expect(JSON.stringify(args)).not.toContain(SOMEONE_ELSE_ID);
    expect(args.p_organization_id).toBe(ORGANIZATION_ID);
    expect(args.p_timezone).toBe("America/Los_Angeles");
    expect(args.p_source).toBe("sign_in");

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      outcome: "stored",
      timezone_source: "browser",
    });
  });

  it("NOTHING FAILS SILENTLY: an RPC error is a 500 carrying the message", async () => {
    signedIn(SESSION_USER_ID);
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    const response = await POST(request({ timezone: "America/Los_Angeles" }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "boom",
    });
  });

  it("the verdict is reported verbatim — 'already_known' is a success, not a failure", async () => {
    signedIn(SESSION_USER_ID);
    rpc.mockResolvedValue({
      data: [
        {
          outcome: "already_known",
          timezone: "America/New_York",
          timezone_source: "user_declared",
        },
      ],
      error: null,
    });

    const response = await POST(request({ timezone: "America/Los_Angeles" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      outcome: "already_known",
      timezone_source: "user_declared",
    });
  });
});
