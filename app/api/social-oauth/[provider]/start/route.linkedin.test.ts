/** @jest-environment node */
import { NextRequest } from "next/server";
import { GET } from "./route";
import { socialAuthorizeUrl } from "@/features/social-connections/customer-service";
import { sendMatrxRequest } from "@ai-matrx/agents/matrx";
import { cookies } from "next/headers";

jest.mock("next/headers", () => ({ cookies: jest.fn() }));
jest.mock("@ai-matrx/agents/matrx", () => ({
  ...jest.requireActual("@ai-matrx/agents/matrx"),
  sendMatrxRequest: jest.fn(),
}));
jest.mock("@/lib/api/organization-context", () => ({
  requireOrganizationContext: (value: string) => value,
  applyOrganizationContextHeader: (headers: Record<string, string>, organization: string) => ({ ...headers, "x-organization-id": organization }),
}));
jest.mock("@/utils/supabase/server", () => ({ createClient: async () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "test-matrx-session" } } }) } }) }));
jest.mock("@/utils/supabase/resolveUser", () => ({ getClaimsUser: async () => ({ data: { user: { id: "test-customer" } } }) }));
jest.mock("@/utils/supabase/client", () => ({ createClient: jest.fn() }));
jest.mock("@/utils/supabase/claimsUser", () => ({ getClaimsUser: jest.fn() }));
jest.mock("@/lib/api/resolve-service-url", () => ({ resolveServiceBaseUrl: () => "https://server.app.matrxserver.com" }));

const origin = "https://www.aimatrx.com";
const organizationId = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
const connectionId = "00000000-0000-4000-8000-000000000001";
const transport = jest.mocked(sendMatrxRequest);
const setCookie = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin } } });
  jest.mocked(cookies).mockResolvedValue({ set: setCookie } as unknown as Awaited<ReturnType<typeof cookies>>);
  transport.mockResolvedValue(new Response(JSON.stringify({ authorization_url: "https://www.linkedin.com/oauth/v2/authorization?state=bound-state" }), { status: 200 }));
});

test("reconnect carries the selected connection through the UI URL and posted consent request", async () => {
  const url = socialAuthorizeUrl("linkedin", organizationId, undefined, undefined, connectionId);
  expect(new URL(url).searchParams.get("frontend_origin")).toBe(origin);
  const response = await GET(new NextRequest(url), { params: Promise.resolve({ provider: "linkedin" }) });
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toContain("www.linkedin.com/oauth/v2/authorization");
  expect(transport).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls[0][0]).toBe(
    "https://server.app.matrxserver.com/api/social-oauth/linkedin/authorize",
  );
  const request = transport.mock.calls[0][1];
  const body = JSON.parse(String(request?.body));
  expect(body).toMatchObject({ connection_id: connectionId, redirect_uri: origin + "/api/social-oauth/linkedin/callback" });
  expect(body.browser_proof_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(setCookie).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.objectContaining({ httpOnly: true, secure: true }));
});

test("connect another account starts unbound consent", async () => {
  const url = socialAuthorizeUrl("linkedin", organizationId);
  await GET(new NextRequest(url), { params: Promise.resolve({ provider: "linkedin" }) });
  const body = JSON.parse(String(transport.mock.calls[0][1]?.body));
  expect(body).not.toHaveProperty("connection_id");
});

test("a direct consent start registers the browser authority rather than the internal host", async () => {
  const url = new URL(socialAuthorizeUrl("linkedin", organizationId));
  url.searchParams.delete("frontend_origin");
  const request = new NextRequest("http://localhost:3001" + url.pathname + url.search, {
    headers: { host: "se09c5d54.localhost:3001", "x-forwarded-proto": "http" },
  });
  await GET(request, { params: Promise.resolve({ provider: "linkedin" }) });
  const body = JSON.parse(String(transport.mock.calls[0][1]?.body));
  expect(body.redirect_uri).toBe("http://se09c5d54.localhost:3001/api/social-oauth/linkedin/callback");
});
