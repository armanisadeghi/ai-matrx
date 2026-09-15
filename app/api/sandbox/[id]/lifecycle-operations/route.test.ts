/** @jest-environment node */
const resolveSandboxLifecycleTarget = jest.fn(); const hasExactLifecycleReceipt = jest.fn(); const proxyLifecycleReceipt = jest.fn();
jest.mock("@/lib/sandbox/lifecycle-target", () => ({ resolveSandboxLifecycleTarget }));
jest.mock("@/lib/sandbox/lifecycle-route-proxy", () => ({ hasExactLifecycleReceipt, proxyLifecycleReceipt, validLifecycleRequest: (value: unknown) => !!value && typeof value === "object" && "operation_id" in value && "kind" in value }));
const { POST } = require("./route") as typeof import("./route");
const target = { rowId: "11111111-1111-4111-8111-111111111111", sandboxId: "runtime", orchestrator: { url: "https://example.test", apiKey: "", tier: "ec2" }, deletedAt: "2026-01-01T00:00:00Z" };
describe("durable lifecycle admission route", () => {
  beforeEach(() => { jest.clearAllMocks(); });
  it("refuses a new tombstone operation without forwarding", async () => { resolveSandboxLifecycleTarget.mockResolvedValue({ ok: true, target }); hasExactLifecycleReceipt.mockResolvedValue(false); const response = await POST({ json: async () => ({ operation_id: "22222222-2222-4222-8222-222222222222", kind: "delete" }) } as any, { params: Promise.resolve({ id: target.rowId }) }); expect(response.status).toBe(404); expect(proxyLifecycleReceipt).not.toHaveBeenCalled(); });
  it("forwards only the exact existing tombstone receipt", async () => { resolveSandboxLifecycleTarget.mockResolvedValue({ ok: true, target }); hasExactLifecycleReceipt.mockResolvedValue(true); proxyLifecycleReceipt.mockResolvedValue({ status: 202 }); const response = await POST({ json: async () => ({ operation_id: "22222222-2222-4222-8222-222222222222", kind: "delete" }) } as any, { params: Promise.resolve({ id: target.rowId }) }); expect(response.status).toBe(202); expect(proxyLifecycleReceipt).toHaveBeenCalled(); });
});
