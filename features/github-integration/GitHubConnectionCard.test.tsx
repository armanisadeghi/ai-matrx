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
  suspended: false,
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
      install: jest.fn(),
    });

    await act(async () => {
      root.render(<GitHubConnectionCard />);
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps phone actions compact while the identity uses the full row", () => {
    const refresh = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Refresh"),
    );
    if (!refresh?.parentElement)
      throw new Error("GitHub actions did not render");

    expect(refresh.parentElement.className).toContain("flex-wrap");
    expect(refresh.parentElement.className).not.toContain("w-full");
    expect(refresh.className).not.toContain("w-full");

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
  const install = jest.fn();

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    sync.mockReset();
    sync.mockResolvedValue(undefined);
    install.mockReset();
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
      install,
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
      "refreshes the inventory after GitHub confirms",
    );
  });

  it("starts the state-bound install popup instead of opening an unbound GitHub URL", async () => {
    const addButton = Array.from(container.querySelectorAll("button")).find(
      (button) =>
        button.textContent?.includes(
          "Add an organization or more repositories",
        ),
    );
    if (!addButton) throw new Error("add-access button did not render");

    await act(async () => {
      addButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(install).toHaveBeenCalledTimes(1);
  });
});
