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

const createClientMock = jest.mocked(createClient);

function requestWithParams(params: Record<string, string>): NextRequest {
  const url = new URL("https://app.example.test/api/github/oauth/start");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

describe("GitHub OAuth start — organization admission (sender-side, fail-closed)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GITHUB_CLIENT_ID = "test-client-id";
    createClientMock.mockResolvedValue({
      auth: {
        getUser: async () => ({ data: { user: { id: "user-1" } } }),
      },
    } as unknown as Awaited<ReturnType<typeof createClient>>);
  });

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
});
