/** @jest-environment node */
import { withClaims as mockWithClaims } from "@/test-utils/supabase-auth";

const mockOwnerSingle = jest.fn();
const mockAdminSingle = jest.fn();
const mockIsSuperAdmin = jest.fn();
const ownerEq = jest.fn();
const adminEq = jest.fn();
const ownerBuilder = { select: jest.fn(), eq: ownerEq, single: mockOwnerSingle };
const adminBuilder = { select: jest.fn(), eq: adminEq, single: mockAdminSingle };
ownerBuilder.select.mockReturnValue(ownerBuilder); ownerEq.mockReturnValue(ownerBuilder);
adminBuilder.select.mockReturnValue(adminBuilder); adminEq.mockReturnValue(adminBuilder);

jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn(async () => ({ auth: mockWithClaims({ getUser: async () => ({ data: { user: { id: "actor-1" } }, error: null }) }), from: () => ownerBuilder })) }));
jest.mock("@/utils/supabase/adminClient", () => ({ createAdminClient: jest.fn(() => ({ from: () => adminBuilder })) }));
jest.mock("@/utils/auth/adminLaneServer", () => ({ hasAdminPower: (...args: unknown[]) => mockIsSuperAdmin(...args) }));
jest.mock("@/lib/sandbox/orchestrator-routing", () => ({
  resolvePersistedOrchestrator: (tier: string) => tier === "hosted" || tier === "ec2" ? { ok: true, orchestrator: { tier, url: `https://${tier}.example.test`, apiKey: `${tier}-key` } } : { ok: false, error: "invalid tier" },
  orchestratorJsonHeaders: (target: { apiKey: string }) => ({ "Content-Type": "application/json", "X-API-Key": target.apiKey }),
}));

import { resolveSandboxLifecycleTarget } from "@/lib/sandbox/lifecycle-target";
import { hasExactLifecycleReceipt, proxyLifecycleReceipt } from "@/lib/sandbox/lifecycle-route-proxy";

const rowId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const row = (tier: "hosted" | "ec2", deleted_at: string | null = null) => ({ id: rowId, sandbox_id: `runtime-${tier}`, tier, config: { tier }, deleted_at });

describe("production lifecycle route authorization and routing", () => {
  beforeEach(() => { jest.clearAllMocks(); ownerBuilder.select.mockReturnValue(ownerBuilder); ownerEq.mockReturnValue(ownerBuilder); adminBuilder.select.mockReturnValue(adminBuilder); adminEq.mockReturnValue(adminBuilder); });
  afterEach(() => { jest.restoreAllMocks(); });

  test.each(["hosted", "ec2"] as const)("routes an owner %s row through its persisted tier and explicit user filter", async (tier) => {
    mockOwnerSingle.mockResolvedValue({ data: row(tier), error: null });
    const result = await resolveSandboxLifecycleTarget(rowId);
    expect(result).toEqual({ ok: true, target: expect.objectContaining({ rowId, sandboxId: `runtime-${tier}`, orchestrator: expect.objectContaining({ tier }) }) });
    expect(ownerEq).toHaveBeenNthCalledWith(1, "id", rowId);
    expect(ownerEq).toHaveBeenNthCalledWith(2, "user_id", "actor-1");
    expect(mockIsSuperAdmin).not.toHaveBeenCalled();
  });

  test.each(["hosted", "ec2"] as const)("permits verified admin fallback for a %s row", async (tier) => {
    mockOwnerSingle.mockResolvedValue({ data: null, error: null });
    mockIsSuperAdmin.mockResolvedValue(true);
    mockAdminSingle.mockResolvedValue({ data: row(tier), error: null });
    const result = await resolveSandboxLifecycleTarget(rowId);
    expect(result).toEqual({ ok: true, target: expect.objectContaining({ sandboxId: `runtime-${tier}`, orchestrator: expect.objectContaining({ tier }) }) });
    expect(adminEq).toHaveBeenCalledWith("id", rowId);
  });

  it("does not disclose or service another actor's unreadable row", async () => {
    mockOwnerSingle.mockResolvedValue({ data: null, error: null });
    mockIsSuperAdmin.mockResolvedValue(false);
    expect(await resolveSandboxLifecycleTarget(rowId)).toEqual({ ok: false, status: 404, error: "Sandbox lifecycle target unavailable" });
    expect(mockAdminSingle).not.toHaveBeenCalled();
  });

  it("retains a readable tombstone only as a tombstone target", async () => {
    mockOwnerSingle.mockResolvedValue({ data: row("ec2", "2026-09-15T00:00:00Z"), error: null });
    expect(await resolveSandboxLifecycleTarget(rowId)).toEqual({ ok: true, target: expect.objectContaining({ deletedAt: "2026-09-15T00:00:00Z" }) });
  });

  it("turns a mismatched upstream receipt into outcome_unknown instead of forwarding success", async () => {
    const target = { rowId, sandboxId: "runtime-ec2", orchestrator: { tier: "ec2" as const, url: "https://ec2.example.test", apiKey: "ec2-key" }, deletedAt: null };
    jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ row_id: rowId, sandbox_id: "other-runtime", operation_id: operationId, kind: "stop", state: "succeeded" }), { status: 200 }));
    const response = await proxyLifecycleReceipt(target, `/${operationId}`, { method: "GET" }, { operation_id: operationId, kind: "stop" });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual(expect.objectContaining({ status: "outcome_unknown" }));
  });

  it("rejects a tombstone census whose kind does not exactly match", async () => {
    const target = { rowId, sandboxId: "runtime-hosted", orchestrator: { tier: "hosted" as const, url: "https://hosted.example.test", apiKey: "hosted-key" }, deletedAt: "2026-09-15T00:00:00Z" };
    jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ row_id: rowId, sandbox_id: target.sandboxId, operation_id: operationId, kind: "delete", state: "succeeded" }), { status: 200 }));
    await expect(hasExactLifecycleReceipt(target, operationId, "stop")).resolves.toBe(false);
  });
});
