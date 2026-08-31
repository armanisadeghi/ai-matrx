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
      },
      loading: false,
      busy: false,
      error: null,
      sync: jest.fn(),
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
