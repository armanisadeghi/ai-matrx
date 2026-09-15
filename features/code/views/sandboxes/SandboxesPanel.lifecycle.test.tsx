/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { SandboxInstance } from "@/types/sandbox";

const dispatch = jest.fn();

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: () => null,
}));
jest.mock("../../CodeWorkspaceProvider", () => ({
  useCodeWorkspace: () => ({ setFilesystem: jest.fn(), setProcess: jest.fn() }),
}));
jest.mock("./useSandboxWorkspaceConnection", () => ({
  useSandboxWorkspaceConnection: () => ({ connect: jest.fn(), connectingId: null, wireInstance: jest.fn() }),
}));
jest.mock("@/features/overlays/openers/sandboxManagementWindow", () => ({
  useOpenSandboxManagementWindow: () => jest.fn(),
}));
jest.mock("./CreateSandboxModal", () => ({ CreateSandboxModal: () => null }));
jest.mock("./SandboxVersionHealthCard", () => ({ SandboxVersionHealthCard: () => null }));
jest.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({ children, onClick, disabled }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button onClick={onClick} disabled={disabled}>{children}</button>,
  DropdownMenuSeparator: () => null,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/lib/toast", () => ({ toast: { warning: jest.fn() } }));

const { SandboxesPanel }: typeof import("./SandboxesPanel") = require("./SandboxesPanel");

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const instance = {
  id: "11111111-1111-4111-8111-111111111111",
  sandbox_id: "sandbox-test",
  name: "Test sandbox",
  status: "stopped",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  config: {},
  cold_path: null,
  container_id: null,
  created_by: null,
  deleted_at: null,
  expires_at: null,
  hot_path: null,
  labels: null,
  last_heartbeat_at: null,
  metadata: {},
  organization_id: "22222222-2222-4222-8222-222222222222",
  persistence_volume: null,
  project_id: null,
  proxy_url: null,
  stop_reason: null,
  stopped_at: null,
  task_id: null,
  template: null,
  template_version: null,
  tier: "ec2",
  ttl_seconds: 3600,
  updated_by: null,
  user_id: "33333333-3333-4333-8333-333333333333",
  version: 1,
} satisfies SandboxInstance;

function response(payload: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

async function settle() {
  await act(async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); });
}

describe("SandboxesPanel deletion", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    Object.defineProperty(global, "fetch", { configurable: true, writable: true, value: jest.fn((url: string) => {
      if (url === "/api/sandbox" || url === "/api/sandbox/reconcile") return Promise.resolve(response({ instances: [instance] }));
      if (url === `/api/sandbox/${instance.id}`) return new Promise(() => {});
      throw new Error(`unexpected ${url}`);
    }) });
  });

  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

  it("closes the deletion confirmation while its request is unresolved and leaves Refresh usable", async () => {
    await act(async () => root.render(<SandboxesPanel />));
    await settle();
    const details = [...container.querySelectorAll("button")].find((button) => button.title === "Show details");
    if (!details) throw new Error("sandbox row details control was not rendered");
    await act(async () => details.click());
    const remove = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Delete sandbox"));
    if (!remove) throw new Error("sandbox delete action was not rendered");
    await act(async () => remove.click());
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    const confirm = [...document.querySelectorAll("button")].find(
      (button) =>
        button.textContent === "Delete sandbox" &&
        button.closest('[role="alertdialog"]'),
    );
    if (!confirm) throw new Error("sandbox delete confirmation was not rendered");
    await act(async () => confirm.click());
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.body.style.pointerEvents).not.toBe("none");
    const refresh = [...container.querySelectorAll("button")].find((button) => button.title?.startsWith("Refresh sandbox status"));
    if (!refresh) throw new Error("unrelated refresh control was not rendered");
    expect(refresh.disabled).toBe(false);
    await act(async () => refresh.click());
    expect(global.fetch).toHaveBeenCalledWith("/api/sandbox");
  });
});
