/** @jest-environment node */
const resolveSandboxLifecycleTarget = jest.fn(); const proxyLifecycleReceipt = jest.fn(); const readExactLifecycleReceipt = jest.fn(); const getUser = jest.fn(); const checkIsSuperAdmin = jest.fn();
jest.mock("@/lib/sandbox/lifecycle-target", () => ({ resolveSandboxLifecycleTarget }));
jest.mock("@/lib/sandbox/lifecycle-route-proxy", () => ({ proxyLifecycleReceipt, readExactLifecycleReceipt }));
// Same class as the sibling lifecycle route: `mayForceStop()` reads the
// caller through `getClaimsUser(client)` → `client.auth.getClaims()`, so the
// fake must answer at that door with the SAME user its `getUser` returns.
jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn(async () => ({ auth: withClaims({ getUser }) })) }));
jest.mock("@/utils/auth/adminLaneServer", () => ({ hasAdminPower: checkIsSuperAdmin }));
const { withClaims } = require("@/test-utils/supabase-auth") as typeof import("@/test-utils/supabase-auth");
const { POST } = require("./route") as typeof import("./route");
const id = "11111111-1111-4111-8111-111111111111"; const operationId = "22222222-2222-4222-8222-222222222222"; const target = { rowId: id, sandboxId: "runtime", orchestrator: { url: "https://example.test", apiKey: "", tier: "ec2" }, deletedAt: null };
beforeEach(() => jest.clearAllMocks());
test("ordinary owner cannot authorize stored force recovery by claiming graceful intent", async () => {
  resolveSandboxLifecycleTarget.mockResolvedValue({ ok: true, target }); readExactLifecycleReceipt.mockResolvedValue({ graceful: false }); getUser.mockResolvedValue({ data: { user: { id: "ordinary" } }, error: null }); checkIsSuperAdmin.mockResolvedValue(false);
  const response = await POST({ nextUrl: new URL(`https://test/${id}?kind=stop`), json: async () => ({ graceful: true }) } as any, { params: Promise.resolve({ id, operationId }) });
  expect(response.status).toBe(409); expect(proxyLifecycleReceipt).not.toHaveBeenCalled();
});
test("fresh super-admin recovery forwards the exact false intent", async () => {
  getUser.mockResolvedValue({ data: { user: { id: "admin" } }, error: null }); checkIsSuperAdmin.mockResolvedValue(true); resolveSandboxLifecycleTarget.mockResolvedValue({ ok: true, target }); readExactLifecycleReceipt.mockResolvedValue({ graceful: false }); proxyLifecycleReceipt.mockResolvedValue({ status: 202 });
  await POST({ nextUrl: new URL(`https://test/${id}?kind=stop`), json: async () => ({ graceful: false }) } as any, { params: Promise.resolve({ id, operationId }) });
  expect(proxyLifecycleReceipt).toHaveBeenCalledWith(target, `/${operationId}/recover`, expect.objectContaining({ body: JSON.stringify({ graceful: false }) }), expect.objectContaining({ graceful: false }));
});
test("missing or malformed stored receipt fails closed before recovery POST", async () => {
  resolveSandboxLifecycleTarget.mockResolvedValue({ ok: true, target }); readExactLifecycleReceipt.mockResolvedValue(null);
  const response = await POST({ nextUrl: new URL(`https://test/${id}?kind=stop`), json: async () => ({ graceful: true }) } as any, { params: Promise.resolve({ id, operationId }) });
  expect(response.status).toBe(409); expect(proxyLifecycleReceipt).not.toHaveBeenCalled();
});

// This file uses `require` + `jest.mock` factories that close over local
// `const`s, so it has no import/export of its own. Without this marker
// TypeScript treats it as a global script and its top-level consts collide
// with the sibling lifecycle route test's identically named ones.
export {};
