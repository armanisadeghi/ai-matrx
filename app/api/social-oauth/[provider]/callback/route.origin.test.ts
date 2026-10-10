/** @jest-environment node */
import { NextRequest } from "next/server";
import { GET } from "./route";

jest.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: jest.fn() }),
}));
jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }));

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
