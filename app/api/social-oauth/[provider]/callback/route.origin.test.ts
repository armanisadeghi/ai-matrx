/** @jest-environment node */
import { NextRequest } from "next/server";
import { GET } from "./route";
import { sendMatrxRequest } from "@ai-matrx/agents/matrx";

const mockCookieStore = { get: jest.fn(), set: jest.fn() };
jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => mockCookieStore),
}));
jest.mock("@ai-matrx/agents/matrx", () => ({
  ...jest.requireActual("@ai-matrx/agents/matrx"),
  sendMatrxRequest: jest.fn(),
}));
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: "test-token" } } }) },
  })),
}));
jest.mock("@/utils/supabase/resolveUser", () => ({
  getClaimsUser: jest.fn(async () => ({ data: { user: { id: "test-user" } } })),
}));
jest.mock("@/lib/api/organization-context", () => ({
  applyOrganizationContextHeader: (headers: Record<string, string>, organizationId: string) => ({ ...headers, "X-Organization-Id": organizationId }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockCookieStore.get.mockReturnValue(undefined);
});

test("an expired callback returns to the browser host instead of Next's internal localhost", async () => {
  const response = await GET(new NextRequest("http://localhost:3001/api/social-oauth/linkedin/callback", {
    headers: { host: "se09c5d54.localhost:3001", "x-forwarded-proto": "http" },
  }), { params: Promise.resolve({ provider: "linkedin" }) });
  const target = new URL(response.headers.get("location")!);
  expect(target.origin).toBe("http://se09c5d54.localhost:3001");
  expect(target.searchParams.get("social_oauth_status")).toBe("expired");
});

test("an external browser authority cannot receive the callback return", async () => {
  const response = await GET(new NextRequest("http://localhost:3001/api/social-oauth/linkedin/callback", {
    headers: { host: "attacker.invalid", "x-forwarded-proto": "https" },
  }), { params: Promise.resolve({ provider: "linkedin" }) });
  expect(response.status).toBe(400);
  expect(response.headers.get("location")).toBeNull();
});

test("posts completion to the API-prefixed backend URL with the real URL builder", async () => {
  mockCookieStore.get.mockReturnValue({
    value: JSON.stringify({
      state: "bound-state",
      browserProof: "browser-proof",
      organizationId: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
      returnUrl: "/user-settings/integrations",
      backendOrigin: "https://server.app.matrxserver.com",
      createdAt: Date.now(),
    }),
  });
  jest.mocked(sendMatrxRequest).mockResolvedValue(
    new Response(JSON.stringify({ status: "connected" }), { status: 200 }),
  );

  await GET(
    new NextRequest("http://localhost:3001/api/social-oauth/linkedin/callback?state=bound-state&code=code", {
      headers: { host: "se09c5d54.localhost:3001", "x-forwarded-proto": "http" },
    }),
    { params: Promise.resolve({ provider: "linkedin" }) },
  );

  expect(jest.mocked(sendMatrxRequest).mock.calls[0]?.[0]).toBe(
    "https://server.app.matrxserver.com/api/social-oauth/linkedin/complete",
  );
});
