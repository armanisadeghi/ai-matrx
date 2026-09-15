/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { SandboxInstance } from "@/types/sandbox";

const dispatch = jest.fn();

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: () => "22222222-2222-4222-8222-222222222222",
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
jest.mock("./useSandboxCreate", () => ({
  TIER_GUIDANCE: { ec2: "EC2", hosted: "Hosted" },
  useSandboxCreate: () => ({
    tier: "ec2",
    setTier: jest.fn(),
    templateId: "bare",
    setTemplateId: jest.fn(),
    templateVersion: "",
    templates: [],
    loadingTemplates: false,
    templateError: null,
    resources: { enabled: false, cpu: 2, memoryMb: 2048, diskMb: 4096 },
    setResources: jest.fn(),
    persistChoices: jest.fn(),
    buildRequest: () => ({
      organization_id: "22222222-2222-4222-8222-222222222222",
      tier: "ec2",
      template: "bare",
      ttl_seconds: 3600,
    }),
  }),
}));
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
const toast = {
  loading: jest.fn(() => "create-toast"),
  dismiss: jest.fn(),
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
};
jest.mock("@/lib/toast", () => ({ toast }));

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

async function openCreateModal(container: HTMLDivElement) {
  const trigger = [...container.querySelectorAll("button")].find(
    (button) => button.title === "New sandbox",
  );
  if (!trigger) throw new Error("new sandbox control was not rendered");
  await act(async () => trigger.click());
  const create = [...document.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === "Create",
  );
  if (!create) throw new Error("create form was not rendered");
  return create;
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

describe("SandboxesPanel non-blocking creation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

  it("closes the real modal before a held create response and keeps Escape and page controls usable", async () => {
    Object.defineProperty(global, "fetch", { configurable: true, writable: true, value: jest.fn((url: string, init?: RequestInit) => {
      if (url === "/api/sandbox" && init?.method === "POST") return new Promise(() => {});
      if (url === "/api/sandbox") return Promise.resolve(response({ instances: [] }));
      if (url === "/api/sandbox/reconcile") return Promise.resolve(response({ instances: [] }));
      throw new Error(`unexpected ${url}`);
    }) });
    await act(async () => root.render(<SandboxesPanel />));
    await settle();
    const create = await openCreateModal(container);
    await act(async () => create.click());

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.style.pointerEvents).not.toBe("none");
    expect(toast.loading).toHaveBeenCalledWith("Requesting sandbox creation");
    const refresh = [...container.querySelectorAll("button")].find((button) => button.title?.startsWith("Refresh sandbox status"));
    if (!refresh) throw new Error("unrelated refresh control was not rendered");
    expect(refresh.disabled).toBe(false);
    await act(async () => refresh.click());
    expect(global.fetch).toHaveBeenCalledWith("/api/sandbox");
    // Reopening during the held request is safe: Escape still closes its
    // disabled form and cannot launch a second create request.
    await openCreateModal(container);
    const close = document.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
    if (!close) throw new Error("modal close control was not rendered");
    await act(async () => close.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    const createPosts = (global.fetch as jest.Mock).mock.calls.filter(
      ([url, init]) => url === "/api/sandbox" && init?.method === "POST",
    );
    expect(createPosts).toHaveLength(1);
  });

  it("renders a 201 creating row without claiming it is ready", async () => {
    Object.defineProperty(global, "fetch", { configurable: true, writable: true, value: jest.fn((url: string, init?: RequestInit) => {
      if (url === "/api/sandbox" && init?.method === "POST") return Promise.resolve(response({ instance: { ...instance, status: "creating" } }, 201));
      if (url === "/api/sandbox" || url === "/api/sandbox/reconcile") return Promise.resolve(response({ instances: [] }));
      throw new Error(`unexpected ${url}`);
    }) });
    await act(async () => root.render(<SandboxesPanel />));
    await settle();
    const create = await openCreateModal(container);
    await act(async () => create.click());
    await settle();

    expect(container.textContent).toContain("Creating");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).not.toContain("Sandbox ready");
  });

  it("reports a definitive 429 as a refusal rather than an unknown outcome", async () => {
    Object.defineProperty(global, "fetch", { configurable: true, writable: true, value: jest.fn((url: string, init?: RequestInit) => {
      if (url === "/api/sandbox" && init?.method === "POST") return Promise.resolve(response({ error: "Quota reached" }, 429));
      if (url === "/api/sandbox" || url === "/api/sandbox/reconcile") return Promise.resolve(response({ instances: [] }));
      throw new Error(`unexpected ${url}`);
    }) });
    await act(async () => root.render(<SandboxesPanel />));
    await settle();
    await act(async () => (await openCreateModal(container)).click());
    await settle();

    expect(container.textContent).toContain("Quota reached");
    expect(toast.error).toHaveBeenCalledWith("Quota reached");
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("reports a lost create response as unknown and does not retry", async () => {
    Object.defineProperty(global, "fetch", { configurable: true, writable: true, value: jest.fn((url: string, init?: RequestInit) => {
      if (url === "/api/sandbox" && init?.method === "POST") return Promise.reject(new TypeError("network lost"));
      if (url === "/api/sandbox" || url === "/api/sandbox/reconcile") return Promise.resolve(response({ instances: [] }));
      throw new Error(`unexpected ${url}`);
    }) });
    await act(async () => root.render(<SandboxesPanel />));
    await settle();
    await act(async () => (await openCreateModal(container)).click());
    await settle();

    expect(container.textContent).toContain("Could not confirm creation; check sandbox list before retrying");
    expect(toast.warning).toHaveBeenCalledWith("Could not confirm creation; check sandbox list before retrying");
    const postCalls = (global.fetch as jest.Mock).mock.calls.filter(([, init]) => init?.method === "POST");
    expect(postCalls).toHaveLength(2); // create plus reconcile, never an automatic create retry
  });
});
