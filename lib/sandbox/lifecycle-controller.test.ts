import { retryExactSandboxLifecycleOperation, submitSandboxLifecycleOperation } from "./lifecycle-controller";
import { SandboxLifecycleReceiptController } from "./SandboxLifecycleController";
import type { ReceiptStorage } from "@/lib/durable-run/sandbox-operation-receipt";

const receipt = { schema_version: 1 as const, row_id: "11111111-1111-4111-8111-111111111111", operation_id: "22222222-2222-4222-8222-222222222222", kind: "stop" as const, observation: "prepared" as const };
const storage: ReceiptStorage = { length: 0, key: () => null, getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() };
const wire = (status: number, payload: object) => ({ ok: status >= 200 && status < 300, status, json: async () => payload }) as Response;
describe("sandbox lifecycle controller", () => {
  it("does not apply an admission response after its actor generation changes", async () => {
    const result = await submitSandboxLifecycleOperation({ actorId: "33333333-3333-4333-8333-333333333333", actorGeneration: 1, isCurrentActorGeneration: () => false, storage, receipt, sandboxId: "runtime-a", adapter: { admit: async () => new Response(JSON.stringify({ row_id: receipt.row_id, sandbox_id: "runtime-a", operation_id: receipt.operation_id, kind: "stop", status: "accepted" }), { status: 202 }), status: jest.fn(), recover: jest.fn() } });
    expect(result).toBeNull();
  });

  it("reconnects a reload receipt using the returned runtime sandbox id and keeps HTTP 200 running pending", async () => {
    const views: unknown[] = [];
    const controller = new SandboxLifecycleReceiptController({ actorId: "33333333-3333-4333-8333-333333333333", generation: 1, isCurrent: () => true, receipt, adapter: { admit: jest.fn(), recover: jest.fn(), status: async () => wire(200, { row_id: receipt.row_id.replaceAll("-", ""), sandbox_id: "runtime-a", operation_id: receipt.operation_id.replaceAll("-", ""), kind: receipt.kind, state: "running" }) }, onView: (view) => views.push(view), environment: { visible: () => true, online: () => true, addEventListener: () => {}, removeEventListener: () => {} } });
    controller.start(); await new Promise((resolve) => setTimeout(resolve, 0)); controller.stop();
    expect(views).toEqual([expect.objectContaining({ state: "pending", sandboxId: "runtime-a" })]);
  });

  it("drops a late status response after an actor change", async () => {
    let current = true; let resolveStatus: ((response: Response) => void) | undefined; const views: unknown[] = [];
    const controller = new SandboxLifecycleReceiptController({ actorId: "33333333-3333-4333-8333-333333333333", generation: 1, isCurrent: () => current, receipt, adapter: { admit: jest.fn(), recover: jest.fn(), status: () => new Promise<Response>((resolve) => { resolveStatus = resolve; }) }, onView: (view) => views.push(view), environment: { visible: () => true, online: () => true, addEventListener: () => {}, removeEventListener: () => {} } });
    controller.start(); await new Promise((resolve) => setTimeout(resolve, 0)); current = false; resolveStatus?.(wire(200, { row_id: receipt.row_id, sandbox_id: "runtime-a", operation_id: receipt.operation_id, kind: receipt.kind, state: "succeeded" })); await new Promise((resolve) => setTimeout(resolve, 0)); controller.stop();
    expect(views).toEqual([]);
  });

  it("offers only exact retry for a receipt whose status is unknown at 404", async () => {
    const views: unknown[] = [];
    const controller = new SandboxLifecycleReceiptController({ actorId: "33333333-3333-4333-8333-333333333333", generation: 1, isCurrent: () => true, receipt, adapter: { recover: jest.fn(), status: async () => wire(404, { error: "missing" }), admit: async (same) => { expect(same.operation_id).toBe(receipt.operation_id); expect(same.row_id).toBe(receipt.row_id); expect(same.kind).toBe(receipt.kind); return wire(202, { row_id: receipt.row_id, sandbox_id: "runtime-a", operation_id: receipt.operation_id, kind: receipt.kind, state: "accepted" }); } }, onView: (view) => views.push(view), environment: { visible: () => true, online: () => true, addEventListener: () => {}, removeEventListener: () => {} } });
    controller.start(); await new Promise((resolve) => setTimeout(resolve, 10)); await controller.retry(); controller.stop();
    expect(views).toEqual([expect.objectContaining({ state: "unknown", action: "retry" }), expect.objectContaining({ state: "pending" })]);
  });

  it("keeps a lost first POST followed by same-UUID 409 unknown, never refused", async () => {
    const result = await retryExactSandboxLifecycleOperation({ actorId: "33333333-3333-4333-8333-333333333333", actorGeneration: 1, isCurrentActorGeneration: () => true, storage, receipt: { ...receipt, observation: "dispatched" }, sandboxId: "runtime-a", adapter: { status: jest.fn(), recover: jest.fn(), admit: async (same) => { expect(same.operation_id).toBe(receipt.operation_id); return wire(409, { error: "conflict" }); } } });
    expect(result).toMatchObject({ state: "unknown" });
  });

  it("permits recovery only from attention and records terminal success without deleting the receipt", async () => {
    const views: unknown[] = []; const recover = jest.fn(async () => wire(200, { row_id: receipt.row_id, sandbox_id: "runtime-a", operation_id: receipt.operation_id, kind: receipt.kind, state: "succeeded" }));
    const controller = new SandboxLifecycleReceiptController({ actorId: "33333333-3333-4333-8333-333333333333", generation: 1, isCurrent: () => true, receipt, adapter: { admit: jest.fn(), recover, status: async () => wire(200, { row_id: receipt.row_id, sandbox_id: "runtime-a", operation_id: receipt.operation_id, kind: receipt.kind, state: "recovery_required" }) }, onView: (view) => views.push(view), environment: { visible: () => true, online: () => true, addEventListener: () => {}, removeEventListener: () => {} } });
    controller.start(); await new Promise((resolve) => setTimeout(resolve, 10)); await controller.recover(); controller.stop();
    expect(views).toEqual([expect.objectContaining({ state: "attention", action: "recover" }), expect.objectContaining({ state: "success" })]); expect(recover).toHaveBeenCalledWith(receipt, expect.anything());
  });
});
