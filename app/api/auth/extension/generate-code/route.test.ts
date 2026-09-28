/**
 * The extension login code is filed in the organization the request NAMES —
 * `extend.extension_auth_codes.organization_id` is NOT NULL and nothing stamps
 * it. No organization named → the canonical `organization_required` refusal,
 * nothing written; a named organization the person does not belong to → 403,
 * nothing written; otherwise the row carries the live table's columns
 * (created_by, organization_id — there is no user_id).
 */
import { NextRequest } from "next/server";
import { POST } from "./route";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";

jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }));
jest.mock("@/utils/supabase/adminClient", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/utils/supabase/resolveUser", () => ({
  getClaimsUser: jest.fn(async () => ({ data: { user: { id: "member-7" } }, error: null })),
}));
jest.mock("@/lib/organizations/ensureOrgId", () => {
  const { OrganizationRequiredServerError: Refusal } = jest.requireActual(
    "@/lib/organizations/organizationRequiredServerError",
  );
  return {
    ensureOrgIdServer: jest.fn(async (_client: unknown, orgId?: string) => {
      if (orgId) return orgId;
      throw new Refusal("This request carried an identity but no organization.", null);
    }),
  };
});

const ORG = "5d0c6a0e-1c1b-4f55-9d7e-2b8f7b1f0a11";

function userClient(membership: unknown) {
  const q: Record<string, jest.Mock> = {};
  for (const name of ["select", "eq"]) q[name] = jest.fn(() => q);
  q.maybeSingle = jest.fn(async () => ({ data: membership, error: null }));
  return { schema: jest.fn(() => ({ from: jest.fn(() => q) })), q };
}

function adminClient() {
  const insert = jest.fn(async () => ({ error: null }));
  const from = jest.fn(() => ({ insert }));
  return { schema: jest.fn(() => ({ from })), from, insert };
}

function request(headers: Record<string, string> = {}, body?: unknown) {
  return new NextRequest("http://localhost/api/auth/extension/generate-code", {
    method: "POST",
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("extension auth-code generation", () => {
  beforeEach(() => jest.clearAllMocks());

  it("refuses with organization_required and writes nothing when no organization is named", async () => {
    const admin = adminClient();
    jest.mocked(createClient).mockResolvedValue(userClient({ organization_id: ORG }) as never);
    jest.mocked(createAdminClient).mockReturnValue(admin as never);

    const response = await POST(request());
    const payload = await response.json();
    expect(response.status).toBe(400);
    expect(payload.code).toBe("organization_required");
    expect(admin.insert).not.toHaveBeenCalled();
  });

  it("refuses a named organization the person does not belong to, writing nothing", async () => {
    const admin = adminClient();
    jest.mocked(createClient).mockResolvedValue(userClient(null) as never);
    jest.mocked(createAdminClient).mockReturnValue(admin as never);

    expect((await POST(request({ "X-Organization-Id": ORG }))).status).toBe(403);
    expect(admin.insert).not.toHaveBeenCalled();
  });

  it("files the code in the named organization, as the person, with the live table's columns", async () => {
    const admin = adminClient();
    const user = userClient({ organization_id: ORG });
    jest.mocked(createClient).mockResolvedValue(user as never);
    jest.mocked(createAdminClient).mockReturnValue(admin as never);

    const response = await POST(request({ "X-Organization-Id": ORG }));
    expect(response.status).toBe(200);
    expect(user.q.eq).toHaveBeenCalledWith("user_id", "member-7");
    expect(admin.schema).toHaveBeenCalledWith("extend");
    expect(admin.from).toHaveBeenCalledWith("extension_auth_codes");
    const row = (admin.insert.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(row).toMatchObject({ created_by: "member-7", organization_id: ORG, used: false });
    expect(row).not.toHaveProperty("user_id");
    expect((await response.json()).code).toMatch(/^[0-9A-F]{32}$/);
  });

  it("refuses a request that names two different organizations", async () => {
    const admin = adminClient();
    jest.mocked(createClient).mockResolvedValue(userClient({ organization_id: ORG }) as never);
    jest.mocked(createAdminClient).mockReturnValue(admin as never);

    const other = "11111111-1111-4111-8111-111111111111";
    expect((await POST(request({ "X-Organization-Id": ORG }, { organization_id: other }))).status).toBe(400);
    expect(admin.insert).not.toHaveBeenCalled();
  });
});

