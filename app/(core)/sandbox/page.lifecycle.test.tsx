/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { SandboxInstance } from "@/types/sandbox";

const deleteInstance = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("@/hooks/sandbox/use-sandbox", () => ({
  useSandboxInstances: () => ({
    instances: [first, second], loading: false, refreshing: false, error: null, total: 2,
    fetchInstances: jest.fn(), createInstance: jest.fn(), stopInstance: jest.fn(), renameInstance: jest.fn(),
    deleteInstance, deleteInstances: jest.fn(),
  }),
}));
jest.mock("@/features/shell/components/header/RouteHeader", () => () => null);
jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({ SurfaceRuntimeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock("@/features/surfaces/manifests/sandboxes.manifest", () => ({ createSandboxesScope: jest.fn() }));
jest.mock("@/features/code/views/sandboxes/CreateSandboxFormFields", () => ({ CreateSandboxFormFields: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock("@/features/code/views/sandboxes/useSandboxCreate", () => ({ useSandboxCreate: () => ({ loadingTemplates: false, persistChoices: jest.fn(), buildRequest: jest.fn() }) }));
jest.mock("@/components/ui/toggle-group", () => ({ ToggleGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>, ToggleGroupItem: ({ children, onClick }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button onClick={onClick}>{children}</button> }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), warning: jest.fn(), error: jest.fn() } }));
jest.mock("@/features/code/views/sandboxes/SandboxInstancesTable", () => ({
  SandboxInstancesTable: ({ instances, onDelete, busyIds }: { instances: SandboxInstance[]; onDelete: (row: SandboxInstance) => void; busyIds: Set<string> }) => <>{instances.map((row) => <button key={row.id} disabled={busyIds.has(row.id)} onClick={() => onDelete(row)}>Delete {row.sandbox_id}</button>)}</>,
}));

const { default: SandboxListPage }: typeof import("./page") = require("./page");
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function instance(id: string, sandbox_id: string): SandboxInstance {
  return { id, sandbox_id, name: sandbox_id, status: "ready", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", config: {}, cold_path: null, container_id: null, created_by: null, deleted_at: null, expires_at: null, hot_path: null, labels: null, last_heartbeat_at: null, metadata: {}, organization_id: "22222222-2222-4222-8222-222222222222", persistence_volume: null, project_id: null, proxy_url: null, stop_reason: null, stopped_at: null, task_id: null, template: null, template_version: null, tier: "ec2", ttl_seconds: 3600, updated_by: null, user_id: "33333333-3333-4333-8333-333333333333", version: 1 };
}
const first = instance("11111111-1111-4111-8111-111111111111", "sandbox-a");
const second = instance("11111111-1111-4111-8111-111111111112", "sandbox-b");

describe("SandboxListPage deletion ownership", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); deleteInstance.mockReturnValue(new Promise(() => {})); });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.clearAllMocks(); });

  it("lets a second sandbox confirmation be cancelled while the first delete remains unresolved", async () => {
    await act(async () => root.render(<SandboxListPage />));
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Delete sandbox-a")?.click());
    const firstConfirm = [...document.querySelectorAll("button")].find((button) => button.textContent === "Delete Sandbox");
    if (!firstConfirm) throw new Error("first sandbox confirmation was not rendered");
    await act(async () => firstConfirm.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Delete sandbox-b")?.click());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    const cancel = [...document.querySelectorAll("button")].find((button) => button.textContent === "Cancel");
    if (!cancel) throw new Error("second sandbox cancel control was not rendered");
    await act(async () => cancel.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Delete sandbox-b")?.disabled).toBe(false);
  });
});
