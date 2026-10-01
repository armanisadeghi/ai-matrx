import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const mockStart = jest.fn();
const mockLoad = jest.fn();
const mockSync = jest.fn();
const mockDisconnect = jest.fn();
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "test-org" }));
jest.mock("./service", () => ({
  EMPTY_INVENTORY: {
    connection: null,
    account: null,
    installations: [],
    repositories: [],
  },
  startGitHubConnection: (...args: unknown[]) => mockStart(...args),
  loadGitHubConnectionInventory: () => mockLoad(),
  syncGitHubConnection: () => mockSync(),
  disconnectGitHubConnection: () => mockDisconnect(),
}));
import { useGitHubConnection } from "./useGitHubConnection";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("GitHub connection action lifecycle", () => {
  let root: Root;
  let container: HTMLDivElement;
  let github: ReturnType<typeof useGitHubConnection>;
  let finish: (value: { ok: false; cancelled: boolean; error: string }) => void;
  function Harness() {
    github = useGitHubConnection();
    return (
      <output>
        {github.busy ? "pending" : "idle"}
        {github.error}
      </output>
    );
  }
  beforeEach(async () => {
    jest.clearAllMocks();
    mockLoad.mockResolvedValue({
      connection: null,
      account: null,
      installations: [],
      repositories: [],
    });
    mockStart.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    container = document.createElement("div");
    root = createRoot(container);
    await act(async () => root.render(<Harness />));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
  });

  it("starts once across rapid connect/install presses and releases cancellation", async () => {
    let pending!: Promise<void>;
    await act(async () => {
      pending = github.connect("/user-settings/integrations");
      void github.connect();
      void github.install();
      void github.sync();
      void github.disconnect();
    });
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockSync).not.toHaveBeenCalled();
    expect(mockDisconnect).not.toHaveBeenCalled();
    expect(container.textContent).toBe("pending");
    await act(async () => {
      finish({ ok: false, cancelled: true, error: "Cancelled" });
      await pending;
    });
    expect(container.textContent).toBe("idle");
    mockStart.mockResolvedValue({
      ok: false,
      cancelled: true,
      error: "Cancelled",
    });
    await act(async () => {
      await github.install("/user-settings/integrations");
    });
    expect(mockStart).toHaveBeenLastCalledWith(
      "/user-settings/integrations",
      "test-org",
      "install",
    );
    expect(mockStart).toHaveBeenCalledTimes(2);
  });

  it("releases a rejected authorization and permits retry", async () => {
    mockStart.mockRejectedValueOnce(new Error("Authorization unavailable"));
    await act(async () => {
      await github.connect();
    });
    expect(container.textContent).toBe("idleAuthorization unavailable");
    mockStart.mockResolvedValue({
      ok: false,
      cancelled: true,
      error: "Cancelled",
    });
    await act(async () => {
      await github.connect();
    });
    expect(mockStart).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe("idle");
  });
});
