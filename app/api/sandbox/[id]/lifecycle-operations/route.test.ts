/** @jest-environment node */
const resolveSandboxLifecycleTarget = jest.fn(); const hasExactLifecycleReceipt = jest.fn(); const proxyLifecycleReceipt = jest.fn();
const getUser = jest.fn(); const checkIsSuperAdmin = jest.fn();
jest.mock("@/lib/sandbox/lifecycle-target", () => ({ resolveSandboxLifecycleTarget }));
jest.mock("@/lib/sandbox/lifecycle-route-proxy", () => ({ hasExactLifecycleReceipt, proxyLifecycleReceipt, validLifecycleRequest: (value: unknown) => !!value && typeof value === "object" && "operation_id" in value && "kind" in value }));
// `mayForceStop()` resolves the caller with `getClaimsUser(client)` →
// `client.auth.getClaims()`. A fake stubbing only `getUser` throws there, the
// route's catch reads it as "not a super admin", and the force-stop tests
// below pass or fail for reasons that have nothing to do with admission.
// `withClaims` derives the claims door from this same `getUser`.
jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn(async () => ({ auth: withClaims({ getUser }) })) }));
jest.mock("@/utils/supabase/userSessionData", () => ({ checkIsSuperAdmin }));
const { withClaims } = require("@/test-utils/supabase-auth") as typeof import("@/test-utils/supabase-auth");
const { POST } = require("./route") as typeof import("./route");
const target = { rowId: "11111111-1111-4111-8111-111111111111", sandboxId: "runtime", orchestrator: { url: "https://example.test", apiKey: "", tier: "ec2" }, deletedAt: "2026-01-01T00:00:00Z" };
describe("durable lifecycle admission route", () => {
  beforeEach(() => { jest.clearAllMocks(); getUser.mockResolvedValue({ data: { user: { id: "admin" } }, error: null }); checkIsSuperAdmin.mockResolvedValue(true); });
  it("refuses a new tombstone operation without forwarding", async () => { resolveSandboxLifecycleTarget.mockResolvedValue({ ok: true, target }); hasExactLifecycleReceipt.mockResolvedValue(false); const response = await POST({ json: async () => ({ operation_id: "22222222-2222-4222-8222-222222222222", kind: "delete" }) } as any, { params: Promise.resolve({ id: target.rowId }) }); expect(response.status).toBe(404); expect(proxyLifecycleReceipt).not.toHaveBeenCalled(); });
  it("forwards only the exact existing tombstone receipt", async () => { resolveSandboxLifecycleTarget.mockResolvedValue({ ok: true, target }); hasExactLifecycleReceipt.mockResolvedValue(true); proxyLifecycleReceipt.mockResolvedValue({ status: 202 }); const response = await POST({ json: async () => ({ operation_id: "22222222-2222-4222-8222-222222222222", kind: "delete" }) } as any, { params: Promise.resolve({ id: target.rowId }) }); expect(response.status).toBe(202); expect(proxyLifecycleReceipt).toHaveBeenCalled(); });
  it("rejects force intent before proxying when a fresh super-admin check fails", async () => { checkIsSuperAdmin.mockResolvedValue(false); const response = await POST({ json: async () => ({ operation_id: "22222222-2222-4222-8222-222222222222", kind: "stop", graceful: false }) } as any, { params: Promise.resolve({ id: target.rowId }) }); expect(response.status).toBe(403); expect(proxyLifecycleReceipt).not.toHaveBeenCalled(); expect(checkIsSuperAdmin).toHaveBeenCalledWith(expect.anything(), "admin"); });
  it("forwards the exact false graceful intent after fresh super-admin admission", async () => { resolveSandboxLifecycleTarget.mockResolvedValue({ ok: true, target }); proxyLifecycleReceipt.mockResolvedValue({ status: 202 }); await POST({ json: async () => ({ operation_id: "22222222-2222-4222-8222-222222222222", kind: "stop", graceful: false }) } as any, { params: Promise.resolve({ id: target.rowId }) }); expect(proxyLifecycleReceipt).toHaveBeenLastCalledWith(target, "", expect.objectContaining({ body: JSON.stringify({ operation_id: "22222222-2222-4222-8222-222222222222", kind: "stop", graceful: false }) }), expect.objectContaining({ graceful: false })); });
});

// This file uses `require` + `jest.mock` factories that close over local
// `const`s, so it has no import/export of its own. Without this marker
// TypeScript treats it as a global script and its top-level consts collide
// with the sibling lifecycle route test's identically named ones.
export {};
