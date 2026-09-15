/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { SandboxInstance } from "@/types/sandbox";

const deleteInstance = jest.fn();
const deleteInstances = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("@/hooks/sandbox/use-sandbox", () => ({
  useSandboxInstances: () => ({
    instances: [first, second, history], loading: false, refreshing: false, error: null, total: 3,
    fetchInstances: jest.fn(), createInstance: jest.fn(), stopInstance: jest.fn(), renameInstance: jest.fn(),
    deleteInstance, deleteInstances,
  }),
}));
jest.mock("@/features/shell/components/header/RouteHeader", () => () => null);
jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({ SurfaceRuntimeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock("@/features/surfaces/manifests/sandboxes.manifest", () => ({ createSandboxesScope: jest.fn() }));
jest.mock("@/features/code/views/sandboxes/CreateSandboxFormFields", () => ({ CreateSandboxFormFields: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock("@/features/code/views/sandboxes/useSandboxCreate", () => ({ useSandboxCreate: () => ({ loadingTemplates: false, persistChoices: jest.fn(), buildRequest: jest.fn() }) }));
jest.mock("@/components/ui/toggle-group", () => {
  const React = require("react");
  const ToggleContext = React.createContext((_: string) => {});
  return {
    ToggleGroup: ({ children, onValueChange }: { children: React.ReactNode; onValueChange: (value: string) => void }) => <ToggleContext.Provider value={onValueChange}>{children}</ToggleContext.Provider>,
    ToggleGroupItem: ({ children, value }: { children: React.ReactNode; value: string }) => {
      const onValueChange = React.useContext(ToggleContext);
      return <button onClick={() => onValueChange(value)}>{children}</button>;
    },
  };
});
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), warning: jest.fn(), error: jest.fn() } }));
jest.mock("@/features/code/views/sandboxes/SandboxInstancesTable", () => ({
  SandboxInstancesTable: ({ instances, onDelete, busyIds, selection }: { instances: SandboxInstance[]; onDelete: (row: SandboxInstance) => void; busyIds: Set<string>; selection?: { onSelectionChange: (ids: Set<string>) => void } }) => <>{instances.map((row) => <button key={row.id} disabled={busyIds.has(row.id)} onClick={() => onDelete(row)}>Delete {row.name}</button>)}{selection && instances[0] ? <button onClick={() => selection.onSelectionChange(new Set([instances[0].id]))}>Select history row</button> : null}</>,
}));

const { default: SandboxListPage }: typeof import("./page") = require("./page");
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function instance(id: string, name: string, status: SandboxInstance["status"] = "ready"): SandboxInstance {
  return { id, sandbox_id: name.toLowerCase().replaceAll(" ", "-"), name, status, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", config: {}, cold_path: null, container_id: null, created_by: null, deleted_at: null, expires_at: null, hot_path: null, labels: null, last_heartbeat_at: null, metadata: {}, organization_id: "22222222-2222-4222-8222-222222222222", persistence_volume: null, project_id: null, proxy_url: null, stop_reason: null, stopped_at: null, task_id: null, template: null, template_version: null, tier: "ec2", ttl_seconds: 3600, updated_by: null, user_id: "33333333-3333-4333-8333-333333333333", version: 1 };
}
const first = instance("11111111-1111-4111-8111-111111111111", "Sandbox A");
const second = instance("11111111-1111-4111-8111-111111111112", "Sandbox B");
const history = instance("11111111-1111-4111-8111-111111111113", "Sandbox history", "stopped");

describe("SandboxListPage deletion ownership", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); deleteInstance.mockReturnValue(new Promise(() => {})); });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.clearAllMocks(); });

  it("lets a second sandbox confirmation be cancelled while the first delete remains unresolved", async () => {
    await act(async () => root.render(<SandboxListPage />));
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Delete Sandbox A")?.click());
    const firstConfirm = [...document.querySelectorAll("button")].find((button) => button.textContent === "Delete Sandbox");
    if (!firstConfirm) throw new Error("first sandbox confirmation was not rendered");
    await act(async () => firstConfirm.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Delete Sandbox B")?.click());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    const cancel = [...document.querySelectorAll("button")].find((button) => button.textContent === "Cancel");
    if (!cancel) throw new Error("second sandbox cancel control was not rendered");
    await act(async () => cancel.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Delete Sandbox B")?.disabled).toBe(false);
  });

  it("closes the real history confirmation before its batch request settles", async () => {
    deleteInstances.mockReturnValue(new Promise(() => {}));
    await act(async () => root.render(<SandboxListPage />));
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent?.startsWith("History"))?.click());
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Select history row")?.click());
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent?.startsWith("Delete selected"))?.click());
    const confirm = [...document.querySelectorAll("button")].find((button) => button.textContent === "Delete selected");
    if (!confirm) throw new Error("history confirmation was not rendered");
    await act(async () => confirm.click());
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });
});
