/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const mockDispatch = jest.fn();
const mockCaptureError = jest.fn();
const mockToast = { success: jest.fn(), info: jest.fn() };
const mockToastErrorAlreadyCaptured = jest.fn();

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: () => 0,
}));
jest.mock("../../redux/codeWorkspaceSlice", () => ({
  sandboxRuntimeReplaced: (sandboxId: string) => ({
    type: "replaced",
    sandboxId,
  }),
  selectSandboxRuntimeRevision: () => 0,
}));
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: mockCaptureError,
}));
jest.mock("@/lib/toast", () => ({
  toast: mockToast,
  toastErrorAlreadyCaptured: mockToastErrorAlreadyCaptured,
}));
jest.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));
jest.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
jest.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: ({ onConfirm }: { onConfirm: () => void }) => (
    <button onClick={onConfirm}>Confirm update</button>
  ),
}));

const {
  SandboxVersionHealthCard,
}: typeof import("./SandboxVersionHealthCard") = require("./SandboxVersionHealthCard");

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const sandboxId = "11111111-1111-4111-8111-111111111111";
const operationId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const storageKey = `matrx.sandbox.migration.${sandboxId}`;

const health = {
  health: {
    supported: true,
    sandbox_id: sandboxId,
    template: "default",
    tier: "hosted",
    status: "outdated",
    reason: "update available",
    running_image_id: null,
    running_version: "old",
    current_image_id: null,
    current_version: "new",
    current_image_available: true,
    can_migrate: true,
    manager_version: "test",
    migration_action_reason: null,
  },
};

function status(outcome: string, extra: Record<string, unknown> = {}) {
  return {
    sandbox_id: sandboxId,
    operation_id: operationId,
    outcome,
    execution_state: outcome === "in_progress" ? "running" : "done",
    phase:
      outcome === "in_progress" ? "target_start_intent" : "cleanup_complete",
    ...extra,
  };
}

function response(value: unknown, code = 200) {
  return Promise.resolve({
    ok: code >= 200 && code < 300,
    status: code,
    json: async () => value,
  } as Response);
}

async function settle() {
  await act(async () => {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  });
}

function confirmUpdate(container: HTMLElement) {
  const button = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === "Confirm update",
  );
  if (!button) throw new Error("missing migration confirmation button");
  button.click();
}

describe("SandboxVersionHealthCard migration reconnect", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    Object.defineProperty(global, "fetch", {
      configurable: true,
      writable: true,
      value: jest.fn(),
    });
    sessionStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    jest.useRealTimers();
  });

  test("aborts a settling POST after unmount without scheduling status or toast", async () => {
    let resolvePost: ((value: Response) => void) | undefined;
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockImplementation((input) => {
        const url = String(input);
        if (url.includes("version-health")) return response(health);
        if (url.endsWith("/migration")) return response(status("idle"));
        if (url.includes("/migrate?")) {
          return new Promise<Response>((resolve) => {
            resolvePost = resolve;
          });
        }
        throw new Error(`unexpected ${url}`);
      });

    await act(async () =>
      root.render(<SandboxVersionHealthCard sandboxId={sandboxId} />),
    );
    await settle();
    await act(async () => {
      confirmUpdate(container);
    });
    const postCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/migrate?"),
    );
    expect(postCall?.[1]).toEqual(
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await act(async () => root.unmount());
    expect((postCall?.[1] as RequestInit).signal?.aborted).toBe(true);
    resolvePost?.({
      ok: true,
      status: 200,
      json: async () => status("migrated"),
    } as Response);
    await settle();

    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("migration?operation_id"),
      ).length,
    ).toBe(0);
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  test("saved operation remounts into an exact poll and never posts again", async () => {
    sessionStorage.setItem(storageKey, operationId);
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockImplementation((input) => {
        const url = String(input);
        if (url.includes("version-health")) return response(health);
        if (url.includes(`migration?operation_id=${operationId}`))
          return response(status("in_progress"));
        throw new Error(`unexpected ${url}`);
      });

    await act(async () =>
      root.render(<SandboxVersionHealthCard sandboxId={sandboxId} />),
    );
    await settle();

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/sandbox/${sandboxId}/migration?operation_id=${operationId}`,
      expect.anything(),
    );
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/migrate?")),
    ).toBe(false);
  });

  test("exact idle clears the saved lock so update can be retried", async () => {
    sessionStorage.setItem(storageKey, operationId);
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockImplementation((input) => {
        const url = String(input);
        if (url.includes("version-health")) return response(health);
        if (url.includes(`migration?operation_id=${operationId}`))
          return response(status("idle"));
        if (url.includes("/migrate?")) return response(status("in_progress"));
        throw new Error(`unexpected ${url}`);
      });

    await act(async () =>
      root.render(<SandboxVersionHealthCard sandboxId={sandboxId} />),
    );
    await settle();
    expect(sessionStorage.getItem(storageKey)).toBeNull();
    expect(container.textContent).toContain("You can retry the image update.");
    await act(async () => confirmUpdate(container));
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/migrate?")),
    ).toBe(true);
  });

  test("a provisional status failure does not suppress later terminal recovery evidence", async () => {
    jest.useFakeTimers();
    sessionStorage.setItem(storageKey, operationId);
    let polls = 0;
    jest.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("version-health")) return response(health);
      if (url.includes(`migration?operation_id=${operationId}`)) {
        polls += 1;
        return polls === 1
          ? response({ error: "status unavailable" }, 502)
          : response(status("rolled_back", { reason: "old box restored" }));
      }
      throw new Error(`unexpected ${url}`);
    });

    await act(async () =>
      root.render(<SandboxVersionHealthCard sandboxId={sandboxId} />),
    );
    await act(async () => jest.advanceTimersByTime(0));
    await settle();
    expect(mockCaptureError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "status_unavailable" }),
    );
    await act(async () => jest.advanceTimersByTime(1_000));
    await settle();
    expect(mockCaptureError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "rolled_back" }),
    );
  });
});
