/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { SandboxCreateRequest, SandboxInstance } from "@/types/sandbox";

jest.mock("@/lib/sandbox/useSandboxLifecycleSubmission", () => ({ useSandboxLifecycleSubmission: () => ({ submit: jest.fn(async () => ({ admitted: true, receipt: {}, outcome: null })) }) }));
jest.mock("@/lib/sandbox/useSandboxLifecycleTerminalInvalidation", () => ({ useSandboxLifecycleTerminalInvalidation: () => {} }));

const dispatch = jest.fn();
let selectedOrganizationId = "22222222-2222-4222-8222-222222222222";
let selectedUserId: string | null = "33333333-3333-4333-8333-333333333333";
let authReady = true;
let nextRequest: SandboxCreateRequest = {
  organization_id: selectedOrganizationId,
  tier: "ec2",
  template: "bare",
  ttl_seconds: 3600,
  project_id: "44444444-4444-4444-8444-444444444444",
  config: { name: "captured-name", retained: true },
  resources: { cpu: 2, memory_mb: 2048, disk_mb: 4096 },
  labels: { source: "code" },
};

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: { name: string }) => {
    if (selector.name === "selectOrganizationId") return selectedOrganizationId;
    if (selector.name === "selectUserId") return selectedUserId;
    if (selector.name === "selectAuthReady") return authReady;
    if (selector.name === "selectIsSuperAdmin") return false;
    return null;
  },
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
    buildRequest: () => nextRequest,
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
  boot_kind: null,
  boot_phase_seconds: null,
  boot_seconds: null,
  custom_fields: {},
  ready_at: null,
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
    toast.loading.mockReset().mockImplementation(() => "create-toast");
    selectedOrganizationId = "22222222-2222-4222-8222-222222222222";
    selectedUserId = "33333333-3333-4333-8333-333333333333";
    authReady = true;
    nextRequest = { ...nextRequest, organization_id: selectedOrganizationId };
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
    expect(JSON.parse(createPosts[0][1].body)).toEqual({
      organization_id: selectedOrganizationId,
      tier: "ec2",
      template: "bare",
      ttl_seconds: 3600,
      project_id: "44444444-4444-4444-8444-444444444444",
      config: { name: "captured-name", retained: true },
      resources: { cpu: 2, memory_mb: 2048, disk_mb: 4096 },
      labels: { source: "code" },
    });
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

  it("keeps a newer same-organization actor request busy when an old response settles", async () => {
    const resolves: Array<(value: ReturnType<typeof response>) => void> = [];
    toast.loading
      .mockImplementationOnce(() => "old-scope-toast")
      .mockImplementationOnce(() => "new-scope-toast");
    Object.defineProperty(global, "fetch", { configurable: true, writable: true, value: jest.fn((url: string, init?: RequestInit) => {
      if (url === "/api/sandbox" && init?.method === "POST") {
        return new Promise((resolve) => resolves.push(resolve));
      }
      if (url === "/api/sandbox" || url === "/api/sandbox/reconcile") return Promise.resolve(response({ instances: [] }));
      throw new Error(`unexpected ${url}`);
    }) });
    await act(async () => root.render(<SandboxesPanel />));
    await settle();
    await act(async () => (await openCreateModal(container)).click());
    selectedUserId = "66666666-6666-4666-8666-666666666666";
    await act(async () => root.render(<SandboxesPanel />));
    await settle();
    await act(async () => (await openCreateModal(container)).click());
    await act(async () => resolves[0](response({ instance: { ...instance, name: "old scope", status: "creating" } }, 201)));
    await settle();

    expect(container.textContent).not.toContain("old scope");
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.dismiss).toHaveBeenCalledWith("old-scope-toast");
    const reopened = await openCreateModal(container);
    expect(reopened.disabled).toBe(true);
    await act(async () => resolves[1](response({ instance: { ...instance, name: "new scope", organization_id: selectedOrganizationId, status: "creating" } }, 201)));
    await settle();
    expect(container.textContent).toContain("new scope");
  });

  it("dismisses a held request toast after unmount without publishing its result", async () => {
    let resolveCreate: ((value: ReturnType<typeof response>) => void) | undefined;
    toast.loading.mockImplementationOnce(() => "unmounted-toast");
    Object.defineProperty(global, "fetch", { configurable: true, writable: true, value: jest.fn((url: string, init?: RequestInit) => {
      if (url === "/api/sandbox" && init?.method === "POST") return new Promise((resolve) => { resolveCreate = resolve; });
      if (url === "/api/sandbox" || url === "/api/sandbox/reconcile") return Promise.resolve(response({ instances: [] }));
      throw new Error(`unexpected ${url}`);
    }) });
    await act(async () => root.render(<SandboxesPanel />));
    await settle();
    await act(async () => (await openCreateModal(container)).click());
    await act(async () => root.unmount());
    await act(async () => resolveCreate?.(response({ instance: { ...instance, status: "creating" } }, 201)));

    expect(toast.dismiss).toHaveBeenCalledWith("unmounted-toast");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("invalidates a held create across logout then same-account login", async () => {
    let resolveCreate: ((value: ReturnType<typeof response>) => void) | undefined;
    toast.loading.mockImplementationOnce(() => "logout-toast");
    Object.defineProperty(global, "fetch", { configurable: true, writable: true, value: jest.fn((url: string, init?: RequestInit) => {
      if (url === "/api/sandbox" && init?.method === "POST") return new Promise((resolve) => { resolveCreate = resolve; });
      if (url === "/api/sandbox" || url === "/api/sandbox/reconcile") return Promise.resolve(response({ instances: [] }));
      throw new Error(`unexpected ${url}`);
    }) });
    await act(async () => root.render(<SandboxesPanel />));
    await settle();
    await act(async () => (await openCreateModal(container)).click());
    authReady = false;
    await act(async () => root.render(<SandboxesPanel />));
    authReady = true;
    await act(async () => root.render(<SandboxesPanel />));
    await act(async () => resolveCreate?.(response({ instance: { ...instance, name: "old login", status: "creating" } }, 201)));
    await settle();

    expect(container.textContent).not.toContain("old login");
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.dismiss).toHaveBeenCalledWith("logout-toast");
    const reopened = await openCreateModal(container);
    expect(reopened.disabled).toBe(false);
  });

  it("keeps a new same-user request busy when the pre-logout request settles late", async () => {
    const resolves: Array<(value: ReturnType<typeof response>) => void> = [];
    toast.loading
      .mockImplementationOnce(() => "pre-logout-toast")
      .mockImplementationOnce(() => "post-login-toast");
    Object.defineProperty(global, "fetch", { configurable: true, writable: true, value: jest.fn((url: string, init?: RequestInit) => {
      if (url === "/api/sandbox" && init?.method === "POST") return new Promise((resolve) => resolves.push(resolve));
      if (url === "/api/sandbox" || url === "/api/sandbox/reconcile") return Promise.resolve(response({ instances: [] }));
      throw new Error(`unexpected ${url}`);
    }) });
    await act(async () => root.render(<SandboxesPanel />));
    await settle();
    await act(async () => (await openCreateModal(container)).click());
    authReady = false;
    await act(async () => root.render(<SandboxesPanel />));
    authReady = true;
    await act(async () => root.render(<SandboxesPanel />));
    const postLoginCreate = await openCreateModal(container);
    expect(postLoginCreate.disabled).toBe(false);
    await act(async () => postLoginCreate.click());

    await act(async () => resolves[0](response({ instance: { ...instance, name: "stale pre-logout", status: "creating" } }, 201)));
    await settle();
    expect(container.textContent).not.toContain("stale pre-logout");
    expect(toast.dismiss).toHaveBeenCalledWith("pre-logout-toast");
    const whilePostLoginPending = await openCreateModal(container);
    expect(whilePostLoginPending.disabled).toBe(true);

    await act(async () => resolves[1](response({ instance: { ...instance, name: "post-login create", status: "creating" } }, 201)));
    await settle();
    expect(container.textContent).toContain("post-login create");
  });

  it.each<SandboxCreateRequest>([
    {
      organization_id: "22222222-2222-4222-8222-222222222222",
      tier: "ec2", template: "bare", ttl_seconds: 3600,
      labels: { source: "first-case" },
    },
    {
      organization_id: "22222222-2222-4222-8222-222222222222",
      tier: "hosted", template: "aidream", template_version: "2026.09.15",
      ttl_seconds: 7200, project_id: "44444444-4444-4444-8444-444444444444",
      config: { name: "second-case", retained: true },
      resources: { cpu: 4, memory_mb: 8192, disk_mb: 16384 },
      labels: { source: "second-case", mode: "heavy" },
    },
  ])("forwards every typed create request field exactly", async (request) => {
    nextRequest = request;
    Object.defineProperty(global, "fetch", { configurable: true, writable: true, value: jest.fn((url: string, init?: RequestInit) => {
      if (url === "/api/sandbox" && init?.method === "POST") return Promise.reject(new TypeError("held for payload assertion"));
      if (url === "/api/sandbox" || url === "/api/sandbox/reconcile") return Promise.resolve(response({ instances: [] }));
      throw new Error(`unexpected ${url}`);
    }) });
    await act(async () => root.render(<SandboxesPanel />));
    await settle();
    await act(async () => (await openCreateModal(container)).click());
    const post = (global.fetch as jest.Mock).mock.calls.find(
      ([url, init]) => url === "/api/sandbox" && init?.method === "POST",
    );
    expect(post).toBeDefined();
    expect(JSON.parse(post?.[1].body)).toEqual(request);
  });
});
