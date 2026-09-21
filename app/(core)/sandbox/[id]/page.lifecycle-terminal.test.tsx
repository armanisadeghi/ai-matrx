/** @jest-environment jsdom */

import { configureStore } from "@reduxjs/toolkit";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import type { SandboxInstance } from "@/types/sandbox";
import appContextReducer from "@/lib/redux/slices/appContextSlice";
import userAuthReducer, { setUserAuth } from "@/lib/redux/slices/userAuthSlice";
import sandboxLifecycleReducer, { applyView, hydrateActor } from "@/lib/redux/slices/sandboxLifecycleSlice";
import type { SandboxOperationReceipt } from "@/lib/durable-run/sandbox-operation-receipt";

let routeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const routerPush = jest.fn();

jest.mock("next/navigation", () => ({
  useParams: () => ({ id: routeId }),
  useRouter: () => ({ push: routerPush }),
}));
jest.mock("@/lib/sandbox/useSandboxLifecycleSubmission", () => ({ useSandboxLifecycleSubmission: () => ({ submit: jest.fn() }) }));
jest.mock("@/features/shell/components/header/templates/EntityModeHeader", () => ({ EntityModeHeader: () => null }));
jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({ SurfaceRuntimeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock("@/features/surfaces/manifests/sandboxes.manifest", () => ({ createSandboxesScope: jest.fn(() => ({})) }));
jest.mock("@/components/ui/button", () => ({ Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button> }));
jest.mock("@/components/ui/card", () => ({ Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
jest.mock("@/components/ui/badge", () => ({ Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
jest.mock("@/components/ui/dialog", () => ({ Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>, DialogContent: ({ children }: { children: React.ReactNode }) => <>{children}</>, DialogHeader: ({ children }: { children: React.ReactNode }) => <>{children}</>, DialogTitle: ({ children }: { children: React.ReactNode }) => <>{children}</>, DialogDescription: ({ children }: { children: React.ReactNode }) => <>{children}</>, DialogFooter: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock("@ai-matrx/design-system", () => ({ Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />, Skeleton: () => null }));
jest.mock("@/components/sandbox/ssh-access-panel", () => ({ SshAccessPanel: () => null }));
jest.mock("@/features/code/views/sandboxes/SandboxDiagnosticsPanel", () => ({ SandboxDiagnosticsPanel: () => null }));
jest.mock("@/components/agent-copy/CopyButtons", () => ({ CopyButtons: () => null }));
jest.mock("@/features/access-gate/components/AccessGate", () => ({ AccessGate: () => null }));
jest.mock("@/hooks/sandbox/use-time-remaining", () => ({ useTimeRemaining: (expiresAt: string | null) => ({ text: `time:${expiresAt}`, seconds: 3600 }) }));
jest.mock("@/lib/sandbox/format", () => ({ sandboxDisplayName: (instance: SandboxInstance) => instance.name ?? "Sandbox", sandboxInstanceSummary: () => "" }));
jest.mock("@/lib/sandbox/status", () => ({ STATUS_BADGE_VARIANT: { ready: "default" }, STATUS_LABELS: { ready: "Ready" }, getEffectiveStatus: () => "ready" }));
jest.mock("@/lib/toast", () => ({ toast: { warning: jest.fn() } }));
jest.mock("@ai-matrx/kit/format", () => ({ formatDurationSeconds: () => "1 hour" }));

const { default: SandboxDetailPage }: typeof import("./page") = require("./page");
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const actorA = "11111111-1111-4111-8111-111111111111";
const actorB = "22222222-2222-4222-8222-222222222222";
const orgA = "33333333-3333-4333-8333-333333333333";
const orgB = "44444444-4444-4444-8444-444444444444";
const unrelatedRow = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const instance = (id: string, name: string): SandboxInstance => ({
  id, sandbox_id: id, name, status: "ready", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", config: {}, boot_kind: null, boot_phase_seconds: null, boot_seconds: null, custom_fields: {}, ready_at: null, cold_path: null, container_id: null, created_by: null, deleted_at: null, expires_at: "2026-01-01T01:00:00.000Z", hot_path: null, labels: null, last_heartbeat_at: null, metadata: {}, organization_id: orgA, persistence_volume: null, project_id: null, proxy_url: null, stop_reason: null, stopped_at: null, task_id: null, template: null, template_version: null, tier: "ec2", ttl_seconds: 3600, updated_by: null, user_id: actorA, version: 1,
});
const ok = (value: SandboxInstance) => ({ ok: true, status: 200, json: async () => ({ instance: value }) }) as Response;
const missing = () => ({ ok: false, status: 404, json: async () => ({}) }) as Response;
const receipt = (rowId: string, operationId: string): SandboxOperationReceipt => ({ schema_version: 1, row_id: rowId, operation_id: operationId, kind: "delete", graceful: true, observation: "accepted" });

const makeStore = () => configureStore({
  reducer: { appContext: appContextReducer, userAuth: userAuthReducer, sandboxLifecycle: sandboxLifecycleReducer },
});
const setTestOrganization = (id: string) => ({ type: "appContext/setOrganization", payload: { id, name: id === orgA ? "Org A" : "Org B" } });

describe("SandboxDetailPage terminal invalidation", () => {
  const originalFetch = global.fetch;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    routeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    routerPush.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: originalFetch, writable: true });
  });

  it("ignores an unrelated row's successful delete without reading or navigating", async () => {
    const store = makeStore();
    store.dispatch(setUserAuth({ id: actorA }));
    store.dispatch(setTestOrganization(orgA));
    const other = receipt(unrelatedRow, "55555555-5555-4555-8555-555555555555");
    store.dispatch(hydrateActor({ actorId: actorA, receipts: [other] }));
    const fetchMock = jest.fn(async () => ok(instance(routeId, "Current sandbox")));
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock, writable: true });
    await act(async () => root.render(<Provider store={store}><SandboxDetailPage /></Provider>));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => store.dispatch(applyView({ actorId: actorA, generation: store.getState().sandboxLifecycle.generation, view: { operation_id: other.operation_id, state: "success", message: "Deleted.", sandboxId: "runtime-b", action: null, dismissed: false } })));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(routerPush).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Current sandbox");
  });

  it.each(["actor", "organization", "route"] as const)("does not apply a delayed canonical read after the %s changes", async (changedScope) => {
    const store = makeStore();
    store.dispatch(setUserAuth({ id: actorA }));
    store.dispatch(setTestOrganization(orgA));
    const currentReceipt = receipt(routeId, "66666666-6666-4666-8666-666666666666");
    store.dispatch(hydrateActor({ actorId: actorA, receipts: [currentReceipt] }));
    let resolveStale: (value: Response) => void = () => { throw new Error("stale read was not started"); };
    const staleRead = new Promise<Response>((resolve) => { resolveStale = resolve; });
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(ok(instance(routeId, "Original sandbox")))
      .mockImplementationOnce(() => staleRead)
      .mockImplementation(async () => ok(instance(routeId, "Current scoped sandbox")));
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock, writable: true });
    await act(async () => root.render(<Provider store={store}><SandboxDetailPage /></Provider>));

    act(() => store.dispatch(applyView({ actorId: actorA, generation: store.getState().sandboxLifecycle.generation, view: { operation_id: currentReceipt.operation_id, state: "success", message: "Deleted.", sandboxId: "runtime-a", action: null, dismissed: false } })));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      if (changedScope === "actor") store.dispatch(setUserAuth({ id: actorB }));
      if (changedScope === "organization") store.dispatch(setTestOrganization(orgB));
      if (changedScope === "route") routeId = unrelatedRow;
      root.render(<Provider store={store}><SandboxDetailPage /></Provider>);
    });
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(container.textContent).toContain("Current scoped sandbox");

    await act(async () => { resolveStale(ok(instance(currentReceipt.row_id, "Stale sandbox"))); await staleRead; });
    expect(routerPush).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Current scoped sandbox");
    expect(container.textContent).not.toContain("Stale sandbox");
  });

  it("does not navigate when a delayed delete miss belongs to the previous route", async () => {
    const store = makeStore();
    store.dispatch(setUserAuth({ id: actorA }));
    store.dispatch(setTestOrganization(orgA));
    const currentReceipt = receipt(routeId, "77777777-7777-4777-8777-777777777777");
    store.dispatch(hydrateActor({ actorId: actorA, receipts: [currentReceipt] }));
    let resolveStale: (value: Response) => void = () => { throw new Error("stale read was not started"); };
    const staleRead = new Promise<Response>((resolve) => { resolveStale = resolve; });
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(ok(instance(routeId, "Original sandbox")))
      .mockImplementationOnce(() => staleRead)
      .mockImplementation(async () => ok(instance(routeId, "New route sandbox")));
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock, writable: true });
    await act(async () => root.render(<Provider store={store}><SandboxDetailPage /></Provider>));
    act(() => store.dispatch(applyView({ actorId: actorA, generation: store.getState().sandboxLifecycle.generation, view: { operation_id: currentReceipt.operation_id, state: "success", message: "Deleted.", sandboxId: "runtime-a", action: null, dismissed: false } })));
    routeId = unrelatedRow;
    await act(async () => root.render(<Provider store={store}><SandboxDetailPage /></Provider>));

    await act(async () => { resolveStale(missing()); await staleRead; });
    expect(routerPush).not.toHaveBeenCalled();
    expect(container.textContent).toContain("New route sandbox");
  });
});
