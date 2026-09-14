import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const mockConfirm = jest.fn();
const mockUseGitHubConnection = jest.fn();

jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: (...args: unknown[]) => mockConfirm(...args),
}));

jest.mock("@/components/loaders/SuspenseLoader", () => ({
  __esModule: true,
  default: ({ message }: { message: string }) => <span>{message}</span>,
}));

jest.mock("./useGitHubConnection", () => ({
  useGitHubConnection: () => mockUseGitHubConnection(),
}));

const sync = jest.fn();
const INSTALLATION = {
  id: 60982002,
  accountLogin: "armanisadeghi",
  accountType: "User",
  accountAvatarUrl: "https://avatars.githubusercontent.com/u/132974515?v=4",
  repositorySelection: "all" as const,
  repositoryCount: 62,
  htmlUrl: "https://github.com/settings/installations/60982002",
};

import { GitHubConnectionCard } from "./GitHubConnectionCard";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("GitHubConnectionCard mobile layout", () => {
  let container: HTMLDivElement;
  let root: Root;
  const disconnect = jest.fn();

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    disconnect.mockReset();
    sync.mockReset();
    sync.mockResolvedValue(undefined);
    disconnect.mockResolvedValue(undefined);
    mockConfirm.mockReset();
    mockUseGitHubConnection.mockReturnValue({
      inventory: {
        connection: {
          status: "connected",
          metadata: { account_login: "a-very-long-github-account-name" },
          account_name: "a-very-long-github-account-name",
        },
        repositories: Array.from({ length: 62 }, (_, index) => ({ id: index })),
        account: {
          login: "a-very-long-github-account-name",
          avatarUrl: null,
          htmlUrl: "https://github.com/a-very-long-github-account-name",
        },
        installations: [INSTALLATION],
        syncedRepositoryCount: 62,
        lastSyncedAt: "2026-09-07T23:21:19.755189+00:00",
      },
      loading: false,
      busy: false,
      error: null,
      sync,
      disconnect,
      connect: jest.fn(),
    });

    await act(async () => {
      root.render(<GitHubConnectionCard />);
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("stacks actions below a full-width identity block on phones", () => {
    const refresh = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Refresh"),
    );
    if (!refresh?.parentElement)
      throw new Error("GitHub actions did not render");

    expect(refresh.parentElement.className).toContain("grid");
    expect(refresh.parentElement.className).toContain("w-full");
    expect(refresh.parentElement.className).toContain("sm:flex");

    for (const control of container.querySelectorAll("button, a")) {
      if (
        control.textContent?.includes("Refresh") ||
        control.textContent?.includes("Manage access") ||
        control.textContent?.includes("Disconnect")
      ) {
        expect(control.className).toContain("h-11");
        expect(control.className).toContain("sm:h-8");
      }
    }
  });

  it("names the access loss before disconnecting", async () => {
    const disconnectButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Disconnect"));
    if (!disconnectButton) throw new Error("Disconnect button did not render");

    mockConfirm.mockResolvedValue(false);
    await act(async () => {
      disconnectButton.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Disconnect GitHub?",
        confirmLabel: "Disconnect GitHub",
        variant: "destructive",
      }),
    );
    expect(disconnect).not.toHaveBeenCalled();

    mockConfirm.mockResolvedValue(true);
    await act(async () => {
      disconnectButton.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});

describe("GitHubConnectionCard installation coverage", () => {
  let container: HTMLDivElement;
  let root: Root;
  const openSpy = jest.fn();

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    sync.mockReset();
    sync.mockResolvedValue(undefined);
    openSpy.mockReset();
    (window as unknown as { open: typeof window.open }).open =
      openSpy as unknown as typeof window.open;
    mockUseGitHubConnection.mockReturnValue({
      inventory: {
        connection: { status: "connected", metadata: {}, account_name: "x" },
        repositories: Array.from({ length: 62 }, (_, index) => ({ id: index })),
        account: {
          login: "armanisadeghi",
          avatarUrl: null,
          htmlUrl: "https://github.com/armanisadeghi",
        },
        installations: [INSTALLATION],
        syncedRepositoryCount: 62,
        lastSyncedAt: "2026-09-07T23:21:19.755189+00:00",
      },
      loading: false,
      busy: false,
      error: null,
      sync,
      disconnect: jest.fn(),
      connect: jest.fn(),
    });
    await act(async () => {
      root.render(<GitHubConnectionCard />);
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  // Guard (a): the connection is HEALTHY and has one installation, which is
  // exactly the state in which the old card said "Connected · 62 repositories"
  // and offered no way to reach an organization's repos.
  it("shows the installation row and the add-access door while fully connected", () => {
    const row = Array.from(container.querySelectorAll("a")).find((anchor) =>
      anchor.getAttribute("href")?.includes("/settings/installations/60982002"),
    );
    if (!row) throw new Error("installation row did not render");
    expect(row.textContent).toContain("armanisadeghi");
    expect(row.textContent).toContain("All repositories");

    const addButton = Array.from(container.querySelectorAll("button")).find(
      (button) =>
        button.textContent?.includes(
          "Add an organization or more repositories",
        ),
    );
    expect(addButton).toBeDefined();
    expect(container.textContent).toContain("Don't see the repos you want?");
    expect(container.textContent).toContain(
      "refreshes automatically when you come back",
    );
  });

  // Guard (b): one refresh on return, and only one.
  it("refreshes exactly once when the tab regains focus after the click", async () => {
    const addButton = Array.from(container.querySelectorAll("button")).find(
      (button) =>
        button.textContent?.includes(
          "Add an organization or more repositories",
        ),
    );
    if (!addButton) throw new Error("add-access button did not render");

    // Focus BEFORE the click must not refresh — nothing was armed.
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(sync).not.toHaveBeenCalled();

    await act(async () => {
      addButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(openSpy).toHaveBeenCalledWith(
      "https://github.com/apps/ai-matrx-admin/installations/new",
      "_blank",
      "noopener,noreferrer",
    );
    expect(sync).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(sync).toHaveBeenCalledTimes(1);

    // Every later focus is silent until the user asks again.
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(sync).toHaveBeenCalledTimes(1);
  });
});
