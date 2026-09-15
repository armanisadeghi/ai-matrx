/** @jest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { GoogleConnectWindow } from "@/features/window-panels/windows/google/GoogleConnectWindow";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/features/window-panels/WindowPanel", () => ({
  WindowPanel: ({
    children,
    actionsRight,
  }: {
    children: ReactNode;
    actionsRight?: ReactNode;
  }) => (
    <div>
      {actionsRight}
      {children}
    </div>
  ),
}));
jest.mock("@/features/google-workspace/GoogleWorkspaceOverviewBody", () => ({
  GoogleWorkspaceOverviewBody: (props: {
    initialConnectionId?: string | null;
    onManageWorkspace: (id: string) => void;
  }) => {
    const { useState } = jest.requireActual<typeof import("react")>("react");
    const [connectionId, setConnectionId] = useState(
      props.initialConnectionId ?? "connection-two",
    );
    return (
      <div>
        <select
          aria-label="Choose account to inspect"
          value={connectionId}
          onChange={(event) => setConnectionId(event.target.value)}
        >
          <option value="connection-one">one@example.com</option>
          <option value="connection-two">two@example.com</option>
        </select>
        <button onClick={() => props.onManageWorkspace(connectionId)}>
          Manage Google access
        </button>
      </div>
    );
  },
}));
jest.mock("@/features/google-workspace/GoogleWorkspaceConnectBody", () => ({
  GoogleWorkspaceConnectBody: ({
    initialConnectionId,
  }: {
    initialConnectionId?: string | null;
  }) => <div data-testid="workspace-body">{initialConnectionId}</div>,
  closeGoogleWorkspaceConnect: jest.fn(),
}));

describe("GoogleConnectWindow overview transitions", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("carries the inspected account into Workspace and back without closing", () => {
    const onClose = jest.fn();
    act(() =>
      root.render(
        <GoogleConnectWindow
          isOpen
          mode="overview"
          initialConnectionId="connection-one"
          onClose={onClose}
        />,
      ),
    );
    const select = host.querySelector(
      'select[aria-label="Choose account to inspect"]',
    ) as HTMLSelectElement;
    act(() => {
      select.value = "connection-two";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    act(() =>
      (
        Array.from(host.querySelectorAll("button")).find((button) =>
          button.textContent?.includes("Manage Google access"),
        ) as HTMLButtonElement
      ).click(),
    );
    expect(
      host.querySelector('[data-testid="workspace-body"]')?.textContent,
    ).toBe("connection-two");
    expect(onClose).not.toHaveBeenCalled();
    act(() =>
      (
        Array.from(host.querySelectorAll("button")).find((button) =>
          button.textContent?.includes("Back to Google"),
        ) as HTMLButtonElement
      ).click(),
    );
    expect(
      (
        host.querySelector(
          'select[aria-label="Choose account to inspect"]',
        ) as HTMLSelectElement
      ).value,
    ).toBe("connection-two");
    expect(onClose).not.toHaveBeenCalled();
  });
});
