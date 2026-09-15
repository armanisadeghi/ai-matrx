import { retryExactSandboxLifecycleOperation, submitSandboxLifecycleOperation } from "./lifecycle-controller";
import { SandboxLifecycleReceiptController } from "./SandboxLifecycleController";
import type { ReceiptStorage } from "@/lib/durable-run/sandbox-operation-receipt";

const receipt = { schema_version: 1 as const, row_id: "11111111-1111-4111-8111-111111111111", operation_id: "22222222-2222-4222-8222-222222222222", kind: "stop" as const, observation: "prepared" as const };
const storage: ReceiptStorage = { length: 0, key: () => null, getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() };
const wire = (status: number, payload: object) => ({ ok: status >= 200 && status < 300, status, json: async () => payload }) as Response;
describe("sandbox lifecycle controller", () => {
  afterEach(() => { jest.useRealTimers(); });

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

  it("replaces the pending timer on focus and stops polling after terminal truth", async () => {
    jest.useFakeTimers();
    const listeners = new Map<string, () => void>();
    const status = jest
      .fn<Promise<Response>, []>()
      .mockResolvedValueOnce(wire(200, { row_id: receipt.row_id, sandbox_id: "runtime-a", operation_id: receipt.operation_id, kind: receipt.kind, state: "running" }))
      .mockResolvedValue(wire(200, { row_id: receipt.row_id, sandbox_id: "runtime-a", operation_id: receipt.operation_id, kind: receipt.kind, state: "succeeded" }));
    const views: Array<{ state: string }> = [];
    const controller = new SandboxLifecycleReceiptController({ actorId: "33333333-3333-4333-8333-333333333333", generation: 1, isCurrent: () => true, receipt, adapter: { admit: jest.fn(), recover: jest.fn(), status }, onView: (view) => views.push(view), environment: { visible: () => true, online: () => true, addEventListener: (name, listener) => listeners.set(name, listener), removeEventListener: (name) => listeners.delete(name) } });

    controller.start();
    await jest.advanceTimersByTimeAsync(0);
    listeners.get("focus")?.();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(60_000);

    expect(status).toHaveBeenCalledTimes(2);
    expect(views.map((view) => view.state)).toEqual(["pending", "success"]);
    controller.stop();
  });

  it.each([
    ["succeeded", "success", "focus"],
    ["succeeded", "success", "online"],
    ["succeeded", "success", "visibilitychange"],
    ["failed", "failure", "focus"],
  ] as const)("keeps validated %s as %s terminal when %s fires later", async (wireState, expectedState, eventName) => {
    jest.useFakeTimers();
    const listeners = new Map<string, () => void>();
    const status = jest
      .fn<Promise<Response>, []>()
      .mockResolvedValueOnce(wire(200, { row_id: receipt.row_id, sandbox_id: "runtime-a", operation_id: receipt.operation_id, kind: receipt.kind, state: wireState }))
      .mockResolvedValue(wire(200, { row_id: receipt.row_id, sandbox_id: "runtime-a", operation_id: receipt.operation_id, kind: receipt.kind, state: "failed" }));
    const views: Array<{ state: string; action: string | null }> = [];
    const controller = new SandboxLifecycleReceiptController({ actorId: "33333333-3333-4333-8333-333333333333", generation: 1, isCurrent: () => true, receipt, adapter: { admit: jest.fn(), recover: jest.fn(), status }, onView: (view) => views.push(view), environment: { visible: () => true, online: () => true, addEventListener: (name, listener) => listeners.set(name, listener), removeEventListener: (name) => listeners.delete(name) } });

    controller.start();
    await jest.advanceTimersByTimeAsync(0);
    const staleListener = listeners.get(eventName);
    staleListener?.();
    await jest.advanceTimersByTimeAsync(60_000);

    expect(status).toHaveBeenCalledTimes(1);
    expect(views).toEqual([expect.objectContaining({ state: expectedState, action: null })]);
    expect(listeners.size).toBe(0);
  });

  it("stops automatic observation after a validated recovery refusal", async () => {
    jest.useFakeTimers();
    const listeners = new Map<string, () => void>();
    const status = jest.fn(async () => wire(200, { row_id: receipt.row_id, sandbox_id: "runtime-a", operation_id: receipt.operation_id, kind: receipt.kind, state: "recovery_required" }));
    const recover = jest.fn(async () => wire(409, { error: "conflict" }));
    const views: Array<{ state: string; action: string | null }> = [];
    const controller = new SandboxLifecycleReceiptController({ actorId: "33333333-3333-4333-8333-333333333333", generation: 1, isCurrent: () => true, receipt, adapter: { admit: jest.fn(), recover, status }, onView: (view) => views.push(view), environment: { visible: () => true, online: () => true, addEventListener: (name, listener) => listeners.set(name, listener), removeEventListener: (name) => listeners.delete(name) } });

    controller.start();
    await jest.advanceTimersByTimeAsync(0);
    await controller.recover();
    const staleFocus = listeners.get("focus");
    staleFocus?.();
    await jest.advanceTimersByTimeAsync(60_000);

    expect(status).toHaveBeenCalledTimes(1);
    expect(recover).toHaveBeenCalledTimes(1);
    expect(views).toEqual([expect.objectContaining({ state: "attention", action: "recover" }), expect.objectContaining({ state: "refused", action: null })]);
    expect(listeners.size).toBe(0);
  });

  it("uses 1/2/4/8/15 second polling then pauses at five minutes without losing known pending identity", async () => {
    jest.useFakeTimers();
    const status = jest.fn(async () => wire(200, { row_id: receipt.row_id, sandbox_id: "runtime-a", operation_id: receipt.operation_id, kind: receipt.kind, state: "running" }));
    const views: Array<{ message: string; sandboxId: string | null }> = [];
    const controller = new SandboxLifecycleReceiptController({ actorId: "33333333-3333-4333-8333-333333333333", generation: 1, isCurrent: () => true, receipt, adapter: { admit: jest.fn(), recover: jest.fn(), status }, onView: (view) => views.push(view), environment: { visible: () => true, online: () => true, addEventListener: () => {}, removeEventListener: () => {} } });

    controller.start();
    await jest.advanceTimersByTimeAsync(299_999);
    expect(status).toHaveBeenCalledTimes(23);
    await jest.advanceTimersByTimeAsync(1);
    expect(status).toHaveBeenCalledTimes(24);
    expect(views.at(-1)).toEqual(expect.objectContaining({ message: "Still in progress; automatic status checks paused. Check status.", sandboxId: "runtime-a" }));
    await jest.advanceTimersByTimeAsync(60_000);
    expect(status).toHaveBeenCalledTimes(24);
    controller.stop();
  });

  it("serializes retry double-clicks and rejects recovery until validated attention", async () => {
    let resolveAdmit: ((response: Response) => void) | undefined;
    const admit = jest.fn(() => new Promise<Response>((resolve) => { resolveAdmit = resolve; }));
    const recover = jest.fn(async () => wire(200, { row_id: receipt.row_id, sandbox_id: "runtime-a", operation_id: receipt.operation_id, kind: receipt.kind, state: "succeeded" }));
    const controller = new SandboxLifecycleReceiptController({ actorId: "33333333-3333-4333-8333-333333333333", generation: 1, isCurrent: () => true, receipt, adapter: { admit, recover, status: async () => wire(200, { row_id: receipt.row_id, sandbox_id: "runtime-a", operation_id: receipt.operation_id, kind: receipt.kind, state: "recovery_required" }) }, onView: () => {}, environment: { visible: () => true, online: () => true, addEventListener: () => {}, removeEventListener: () => {} } });

    await controller.recover();
    expect(recover).not.toHaveBeenCalled();
    const first = controller.retry();
    const second = controller.retry();
    expect(admit).toHaveBeenCalledTimes(1);
    await second;
    resolveAdmit?.(wire(202, { row_id: receipt.row_id, sandbox_id: "runtime-a", operation_id: receipt.operation_id, kind: receipt.kind, state: "accepted" }));
    await first;
    await controller.check(true);
    await Promise.all([controller.recover(), controller.recover()]);
    expect(recover).toHaveBeenCalledTimes(1);
    controller.stop();
  });
});
