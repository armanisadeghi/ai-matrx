/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { SandboxInstance } from "@/types/sandbox";
import {
  createSandboxTestStore,
  setSandboxTestIdentity,
  SandboxStoreProvider,
  type SandboxTestStore,
} from "@/test-utils/sandbox-store";

jest.mock("next/navigation", () =>
  require("@/test-utils/next-navigation").nextNavigationMock({
    params: { id: "sandbox-1" },
    pathname: "/sandbox/sandbox-1",
  }),
);
jest.mock("@/features/shell/components/header/templates/EntityModeHeader", () => ({
  EntityModeHeader: ({ actions }: { actions?: Array<{ label: string; disabled?: boolean; onPress: () => void }> }) => (
    <>{actions?.map((action) => <button key={action.label} disabled={action.disabled} onClick={action.onPress}>{action.label}</button>)}</>
  ),
}));
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
jest.mock("@/lib/sandbox/format", () => ({ sandboxDisplayName: () => "Sandbox", sandboxInstanceSummary: () => "" }));
jest.mock("@/lib/sandbox/status", () => ({ STATUS_BADGE_VARIANT: { ready: "default" }, STATUS_LABELS: { ready: "Ready" }, getEffectiveStatus: () => "ready" }));
jest.mock("@/lib/toast", () => ({ toast: { warning: jest.fn() } }));
jest.mock("@ai-matrx/kit/format", () => ({ formatDurationSeconds: () => "1 hour" }));

const { default: SandboxDetailPage }: typeof import("./page") = require("./page");
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const initial: SandboxInstance = {
  boot_kind: null, boot_phase_seconds: null, boot_seconds: null, custom_fields: {}, ready_at: null, id: "sandbox-1", sandbox_id: "sandbox-1", name: "Sandbox", status: "ready", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", config: {}, cold_path: null, container_id: null, created_by: null, deleted_at: null, expires_at: "2026-01-01T01:00:00.000Z", hot_path: null, labels: null, last_heartbeat_at: null, metadata: {}, organization_id: "org-a", persistence_volume: null, project_id: null, proxy_url: null, stop_reason: null, stopped_at: null, task_id: null, template: null, template_version: null, tier: "ec2", ttl_seconds: 3600, updated_by: null, user_id: "user-a", version: 1,
};

function response(instance = initial) {
  return { ok: true, status: 200, json: async () => ({ instance }) };
}

describe("SandboxDetailPage extension", () => {
  const originalFetch = global.fetch;
  let container: HTMLDivElement;
  let root: Root;
  let store: SandboxTestStore;

  // The page under a REAL store and the real selectors it reads.
  const page = () => (
    <SandboxStoreProvider store={store}>
      <SandboxDetailPage />
    </SandboxStoreProvider>
  );

  beforeEach(() => {
    store = createSandboxTestStore({ userId: "user-a", organizationId: "org-a", adminLevel: "super_admin" });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); Object.defineProperty(globalThis, "fetch", { configurable: true, value: originalFetch, writable: true }); jest.restoreAllMocks(); });

  it("uses POST once and publishes its confirmed expiry through the primary detail action", async () => {
    const extended = { ...initial, expires_at: "2026-01-01T02:00:00.000Z" };
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST" ? response(extended) : response());
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock, writable: true });
    await act(async () => root.render(page()));
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "+1h")?.click());

    expect(fetchMock).toHaveBeenCalledWith("/api/sandbox/sandbox-1/extend", expect.objectContaining({ method: "POST", body: JSON.stringify({ ttl_seconds: 3600 }) }));
    expect(container.textContent).toContain("time:2026-01-01T02:00:00.000Z");
  });

  it("routes the inline admin extension through the same POST handler", async () => {
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST" ? response({ ...initial, expires_at: "2026-01-01T02:00:00.000Z" }) : response());
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock, writable: true });
    await act(async () => root.render(page()));
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Admin Quick Actions"))?.click());
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("+1h Debug Time"))?.click());

    expect(fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/sandbox/sandbox-1/extend", expect.objectContaining({ method: "POST", body: JSON.stringify({ ttl_seconds: 3600 }) }));
  });

  it("does not let a stale identity's extension overwrite the detail row", async () => {
    let resolveExtension: (value: ReturnType<typeof response>) => void = () => { throw new Error("Extension resolver was not initialized."); };
    const pending = new Promise<ReturnType<typeof response>>((resolve) => { resolveExtension = resolve; });
    const fetchMock = jest.fn((_input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST" ? pending : Promise.resolve(response()));
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock, writable: true });
    await act(async () => root.render(page()));
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "+1h")?.click());
    await act(async () => setSandboxTestIdentity(store, { userId: "user-b", organizationId: "org-b", adminLevel: "super_admin" }));
    resolveExtension(response({ ...initial, expires_at: "2026-01-01T02:00:00.000Z" }));
    await act(async () => { await pending; });

    expect(container.textContent).toContain("time:2026-01-01T01:00:00.000Z");
  });
});
