/** @jest-environment node */
const resolveSandboxLifecycleTarget = jest.fn(); const proxyLifecycleReceipt = jest.fn(); const getUser = jest.fn(); const checkIsSuperAdmin = jest.fn();
jest.mock("@/lib/sandbox/lifecycle-target", () => ({ resolveSandboxLifecycleTarget }));
jest.mock("@/lib/sandbox/lifecycle-route-proxy", () => ({ proxyLifecycleReceipt }));
jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn(async () => ({ auth: { getUser } })) }));
jest.mock("@/utils/supabase/userSessionData", () => ({ checkIsSuperAdmin }));
const { POST } = require("./route") as typeof import("./route");
const id = "11111111-1111-4111-8111-111111111111"; const operationId = "22222222-2222-4222-8222-222222222222"; const target = { rowId: id, sandboxId: "runtime", orchestrator: { url: "https://example.test", apiKey: "", tier: "ec2" }, deletedAt: null };
test("false graceful recovery requires a fresh super-admin admission before proxying", async () => {
  getUser.mockResolvedValue({ data: { user: { id: "ordinary" } }, error: null }); checkIsSuperAdmin.mockResolvedValue(false);
  const response = await POST({ nextUrl: new URL(`https://test/${id}?kind=stop`), json: async () => ({ graceful: false }) } as any, { params: Promise.resolve({ id, operationId }) });
  expect(response.status).toBe(403); expect(proxyLifecycleReceipt).not.toHaveBeenCalled();
});
test("fresh super-admin recovery forwards the exact false intent", async () => {
  getUser.mockResolvedValue({ data: { user: { id: "admin" } }, error: null }); checkIsSuperAdmin.mockResolvedValue(true); resolveSandboxLifecycleTarget.mockResolvedValue({ ok: true, target }); proxyLifecycleReceipt.mockResolvedValue({ status: 202 });
  await POST({ nextUrl: new URL(`https://test/${id}?kind=stop`), json: async () => ({ graceful: false }) } as any, { params: Promise.resolve({ id, operationId }) });
  expect(proxyLifecycleReceipt).toHaveBeenCalledWith(target, `/${operationId}/recover`, expect.objectContaining({ body: JSON.stringify({ graceful: false }) }), expect.objectContaining({ graceful: false }));
});
