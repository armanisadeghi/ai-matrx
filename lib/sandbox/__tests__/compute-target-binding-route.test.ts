/** @jest-environment node */
import { POST } from "@/app/api/compute-targets/resolve/route";

let mockRow: Record<string, unknown>;
const mockQuery = {
  select: jest.fn().mockReturnThis(),
  is: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn(async () => ({ data: mockRow, error: null })),
};
jest.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "owner" } }, error: null }),
      getSession: async () => ({ data: { session: { access_token: "user-jwt" } } }),
    },
    from: () => mockQuery,
  }),
}));
jest.mock("@/lib/sandbox/orchestrator-routing", () => ({
  resolveOrchestratorByTier: () => ({ url: "https://orchestrator.example.test", apiKey: "test-only" }),
}));

afterEach(() => jest.restoreAllMocks());

test("local binding declares its machine namespace and reported Windows home", async () => {
  mockRow = { id: "device", instance_id: "desktop-device", tunnel_active: true,
    tunnel_url: "https://device.example.test", last_seen: new Date().toISOString(),
    is_active: true, home_dir: "C:\\Users\\Owner" };
  const response = await POST(new Request("https://app.example.test/api/compute-targets/resolve", {
    method: "POST", body: JSON.stringify({ kind: "local-pc", id: "device" }),
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ target_kind: "local_machine", root_path: "C:\\Users\\Owner" });
});

test("local binding refuses an unreported home instead of inventing a root", async () => {
  mockRow = { id: "device", instance_id: "desktop-device", tunnel_active: true,
    tunnel_url: "https://device.example.test", last_seen: new Date().toISOString(), is_active: true };
  const response = await POST(new Request("https://app.example.test/api/compute-targets/resolve", {
    method: "POST", body: JSON.stringify({ kind: "local-pc", id: "device" }),
  }));
  expect(response.status).toBe(503);
});

test.each([null, "unknown", "hosted"])("EC2 request refuses invalid or mismatched persisted tier %s before minting", async (tier) => {
  mockRow = { id: "row", sandbox_id: "sbx-test", status: "running", tier };
  const fetch = jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({
    sandbox_id: "sbx-test", base_url: "https://orchestrator.example.test/sandboxes/sbx-test",
    access_token: "scoped", root_path: "/home/agent",
  })));
  const response = await POST(new Request("https://app.example.test/api/compute-targets/resolve", {
    method: "POST", body: JSON.stringify({ kind: "ec2", id: "row" }),
  }));
  expect(response.status).toBe(tier === "hosted" ? 409 : 503);
  expect(fetch).not.toHaveBeenCalled();
});
