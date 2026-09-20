/** @jest-environment node */
import { withClaims as mockWithClaims } from "@/test-utils/supabase-auth";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { createClient } from "@/utils/supabase/server";
import { GITHUB_OAUTH_COOKIE } from "../session";

jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }));
jest.mock("@/lib/api/endpoints", () => ({ AIDREAM_PRODUCTION_URL: "https://server.example.test" }));

const cookie = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
};
jest.mock("next/headers", () => ({ cookies: async () => cookie }));

const createClientMock = jest.mocked(createClient);
const session = {
  state: "state",
  returnUrl: "/code",
  browserProof: "p".repeat(43),
  flow: "authorize",
  organizationId: "7dc930e9-bd65-44a1-8369-af773f6e1a5b",
};

function request(query: Record<string, string> = {}) {
  const url = new URL("https://www.aimatrx.com/api/github/oauth/callback");
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return new NextRequest(url);
}

describe("GitHub OAuth callback lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cookie.get.mockReturnValue({ value: JSON.stringify(session) });
    createClientMock.mockResolvedValue({
      auth: mockWithClaims({
        getUser: async () => ({ data: { user: { id: "user" } } }),
        getSession: async () => ({ data: { session: { access_token: "token" } } }),
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    jest.spyOn(global, "fetch");
  });

  afterEach(() => jest.restoreAllMocks());

  it("continues initial zero-install authorization with the backend-issued install state", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({
      status: "needs_installation", next_authorization_url: "https://github.com/apps/ai-matrx-admin/installations/new?state=install", next_state: "install", next_flow: "install",
    })));
    const response = await GET(request({ state: "state", code: "code" }));
    expect(response.headers.get("location")).toBe("https://github.com/apps/ai-matrx-admin/installations/new?state=install");
    expect(cookie.set).toHaveBeenCalledWith(GITHUB_OAUTH_COOKIE, expect.stringContaining('"state":"install"'), expect.any(Object));
  });

  it("continues an install return with explicit post-install PKCE authorization", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({
      status: "installation_complete", next_authorization_url: "https://github.com/login/oauth/authorize?state=authorize", next_state: "authorize", next_flow: "authorize",
    })));
    const response = await GET(request({ state: "state", code: "ignored-install-code" }));
    expect(response.headers.get("location")).toBe("https://github.com/login/oauth/authorize?state=authorize");
  });

  it("shows post-install needs-attention instead of announcing a connection", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: "needs_attention" })));
    const response = await GET(request({ state: "state", code: "code" }));
    expect(response.headers.get("location")).toContain("github_error=");
    expect(response.headers.get("location")).not.toContain("github=connected");
  });

  it("deletes and refuses a missing or mismatched state without calling the backend", async () => {
    const response = await GET(request({ state: "wrong", code: "code" }));
    expect(cookie.delete).toHaveBeenCalledWith(GITHUB_OAUTH_COOKIE);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("github_error=");
  });

  it("preserves a pending OAuth cookie and emits no success for a no-state return", async () => {
    const response = await GET(request());
    expect(cookie.get).not.toHaveBeenCalled();
    expect(cookie.delete).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("github_notice=refresh");
    expect(response.headers.get("location")).not.toContain("github=connected");
  });
});
