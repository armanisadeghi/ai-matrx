/** @jest-environment node */
/**
 * Locks in the fix for app/api/github/oauth/start/route.ts's organization
 * threading — census hard case ("OAuth proxy route handlers"). The GitHub
 * connect flow is organization-scoped
 * (users.integration_connections.organization_id), but the ONLY channel
 * that survives the redirect to GitHub and back is a signed cookie — this
 * route now requires ?organization_id= up front and refuses (never
 * redirecting to GitHub, and never minting the OAuth cookie) when it is
 * missing or malformed.
 */

import { NextRequest } from "next/server";
import { withClaims } from "@/test-utils/supabase-auth";
import { createClient } from "@/utils/supabase/server";
import { GET } from "./route";

jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }));
jest.mock("next/headers", () => ({
  cookies: async () => ({
    set: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
  }),
}));
jest.mock("@/lib/api/endpoints", () => ({
  AIDREAM_PRODUCTION_URL: "https://server.example.test",
}));

const createClientMock = jest.mocked(createClient);

function requestWithParams(params: Record<string, string>): NextRequest {
  const url = new URL("https://app.example.test/api/github/oauth/start");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

describe("GitHub OAuth start — organization admission (sender-side, fail-closed)", () => {
  let consoleError: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    process.env.GITHUB_CLIENT_ID = "test-client-id";
    createClientMock.mockResolvedValue({
      auth: withClaims({
        getUser: async () => ({ data: { user: { id: "user-1" } } }),
        getSession: async () => ({ data: { session: { access_token: "test-token" } } }),
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          authorization_url: "https://github.com/login/oauth/authorize?state=opaque",
          state: "opaque",
        }),
        { status: 200 },
      ),
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it("REFUSAL: never redirects to GitHub when no organization_id is supplied", async () => {
    const response = await GET(requestWithParams({ return_url: "/code" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/organization/i);
  });

  it("CONTROL: redirects to GitHub when a valid organization_id is supplied", async () => {
    const response = await GET(
      requestWithParams({
        return_url: "/code",
        organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
      }),
    );
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("github.com/login/oauth/authorize");
  });

  it("REGRESSION: backend refusal completes the popup with a safe error instead of raw JSON", async () => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: "vault audit missing organization_id; token=never-expose" }),
        { status: 422 },
      ),
    );

    const response = await GET(
      requestWithParams({
        return_url: "/settings/integrations",
        organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
      }),
    );

    expect(response.status).toBe(307);
    const redirect = new URL(response.headers.get("location") ?? "");
    expect(redirect.pathname).toBe("/api/github/oauth/complete");
    expect(redirect.searchParams.get("return_url")).toBe("/settings/integrations");
    expect(redirect.searchParams.get("github_error")).toBe(
      "We couldn't start your GitHub connection.",
    );
    expect(redirect.href).not.toContain("vault");
    expect(redirect.href).not.toContain("token");
    expect(consoleError).toHaveBeenCalledWith(
      "[github-oauth:start]",
      expect.objectContaining({ stage: "authorize_response", status: 422 }),
    );
  });

  it("REGRESSION: transport failure completes the popup through the same safe channel", async () => {
    jest.spyOn(global, "fetch").mockRejectedValueOnce(new Error("connection reset"));

    const response = await GET(
      requestWithParams({
        return_url: "//attacker.invalid",
        organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
      }),
    );

    expect(response.status).toBe(307);
    const redirect = new URL(response.headers.get("location") ?? "");
    expect(redirect.pathname).toBe("/api/github/oauth/complete");
    expect(redirect.searchParams.get("return_url")).toBe("/code");
    expect(redirect.searchParams.get("github_error")).toBe(
      "We couldn't start your GitHub connection.",
    );
    expect(consoleError).toHaveBeenCalledWith(
      "[github-oauth:start]",
      expect.objectContaining({ stage: "authorize_request", status: 503 }),
    );
  });
});
