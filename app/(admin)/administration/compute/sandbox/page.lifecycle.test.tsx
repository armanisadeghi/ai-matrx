/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { SandboxInstance } from "@/types/sandbox";
import type { SandboxTestStore } from "@/test-utils/sandbox-store";

const readAllRows = jest.fn();
// Only the paged read is replaced. The rest of the package is real, because the
// real store's appContext slice builds the active-org cookie from it.
jest.mock("@ai-matrx/data/db", () => ({
  ...jest.requireActual("@ai-matrx/data/db"),
  readAllRows: (...args: unknown[]) => readAllRows(...args),
}));
jest.mock("@/utils/supabase/client", () => ({ createClient: jest.fn() }));
jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({ SurfaceRuntimeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock("@/features/surfaces/manifests/admin-sandbox.manifest", () => ({ ADMIN_SANDBOX_SURFACE_NAME: "admin/sandbox", createAdminSandboxScope: jest.fn() }));
jest.mock("@/features/admin/users/components/AdminUserRef", () => ({ AdminUserRef: () => null }));
jest.mock("@/components/agent-copy/CopyButtons", () => ({ CopyButtons: () => null }));
jest.mock("@/components/navigation/AppLink", () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock("@/components/ui/tooltip", () => ({ Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>, TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>, TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock("@ai-matrx/kit/format", () => ({ formatDurationSeconds: () => "1 hour" }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), warning: jest.fn(), error: jest.fn() } }));

// Required, not imported: a top-level value import is hoisted above
// `readAllRows`, and the redux slices it pulls in would run the
// `@ai-matrx/data/db` factory before that spy exists.
/* eslint-disable @typescript-eslint/no-require-imports */
const { default: AdminSandboxManagementPage }: typeof import("./page") = require("./page");
const { createSandboxTestStore, SandboxStoreProvider }: typeof import("@/test-utils/sandbox-store") = require("@/test-utils/sandbox-store");
/* eslint-enable @typescript-eslint/no-require-imports */
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function instance(id: string, name: string): SandboxInstance {
  return { id, sandbox_id: name.toLowerCase().replaceAll(" ", "-"), name, status: "stopped", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", config: {}, boot_kind: null, boot_phase_seconds: null, boot_seconds: null, custom_fields: {}, ready_at: null, cold_path: null, container_id: null, created_by: null, deleted_at: null, expires_at: null, hot_path: null, labels: null, last_heartbeat_at: null, metadata: {}, organization_id: "22222222-2222-4222-8222-222222222222", persistence_volume: null, project_id: null, proxy_url: null, stop_reason: null, stopped_at: null, task_id: null, template: null, template_version: null, tier: "ec2", ttl_seconds: 3600, updated_by: null, user_id: "33333333-3333-4333-8333-333333333333", version: 1 };
}
const viewerId = "33333333-3333-4333-8333-333333333333";
const first = instance("11111111-1111-4111-8111-111111111111", "Sandbox A");
const second = instance("11111111-1111-4111-8111-111111111112", "Sandbox B");

describe("AdminSandboxManagementPage deletion ownership", () => {
  let container: HTMLDivElement;
  let root: Root;
  let store: SandboxTestStore;
  // A REAL store: the page's viewer id and lifecycle reservations come from the
  // app's own selectors and reducers, not from a harness object.
  const page = () => (
    <SandboxStoreProvider store={store}>
      <AdminSandboxManagementPage />
    </SandboxStoreProvider>
  );
  beforeEach(() => {
    store = createSandboxTestStore({ userId: viewerId, organizationId: "22222222-2222-4222-8222-222222222222", adminLevel: "super_admin" });
    readAllRows.mockResolvedValue([first, second]);
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    Object.defineProperty(global, "fetch", { configurable: true, writable: true, value: jest.fn((url: string, init?: RequestInit) => init?.method === "DELETE" && url.endsWith(first.id) ? new Promise(() => {}) : Promise.resolve({ ok: true, json: async () => ({}) })) });
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.clearAllMocks(); });

  it("lets B's real confirmation be cancelled while A's request remains unresolved", async () => {
    await act(async () => { root.render(page()); await Promise.resolve(); });
    await act(async () => { for (let i = 0; i < 4; i += 1) await Promise.resolve(); });
    const deletes = [...container.querySelectorAll<HTMLButtonElement>('button[title="Delete sandbox"]')];
    if (deletes.length !== 2) throw new Error("admin delete controls were not rendered");
    await act(async () => deletes[0]?.click());
    const firstConfirm = [...document.querySelectorAll("button")].find((button) => button.textContent === "Delete");
    if (!firstConfirm) throw new Error("first admin confirmation was not rendered");
    await act(async () => firstConfirm.click());
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    await act(async () => deletes[1]?.click());
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    const cancel = [...document.querySelectorAll("button")].find((button) => button.textContent === "Cancel");
    if (!cancel) throw new Error("second admin cancel control was not rendered");
    await act(async () => cancel.click());
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(deletes[1]?.disabled).toBe(false);
  });
});
