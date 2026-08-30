import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const preventDefault = jest.fn();

jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect?: (event: { preventDefault: () => void }) => void;
  }) => (
    <button type="button" onClick={() => onSelect?.({ preventDefault })}>
      {children}
    </button>
  ),
}));

jest.mock("@/features/marketing/google/hooks", () => ({
  useGoogleConnectionInventory: () => ({
    data: { connections: [] },
    isLoading: false,
  }),
}));

jest.mock("@/features/overlays/openers/googleConnectWindow", () => ({
  useOpenGoogleConnectWindow: () => jest.fn(),
}));

import { FileAcquisitionActions } from "./FileAcquisitionActions";

describe("FileAcquisitionActions menu chooser", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps the menu input mounted until the native file selection returns", async () => {
    const onFiles = jest.fn();
    const onLocalSelectionComplete = jest.fn();

    act(() => {
      root.render(
        <FileAcquisitionActions
          presentation="menu"
          enableLocalFolder={false}
          enableGoogleDrive={false}
          onFiles={onFiles}
          onLocalSelectionComplete={onLocalSelectionComplete}
        />,
      );
    });

    const action = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Upload files"),
    );
    act(() => action?.click());
    expect(preventDefault).toHaveBeenCalledTimes(1);

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    const selected = new File(["q30"], "q30.jpg", { type: "image/jpeg" });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [selected],
    });

    await act(async () => input?.dispatchEvent(new Event("change", { bubbles: true })));
    expect(onFiles).toHaveBeenCalledWith([selected]);
    expect(onLocalSelectionComplete).toHaveBeenCalledTimes(1);
  });
});
