import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ItemSwipeRow } from "./ItemSwipeRow";

const mockRemedy = jest.fn();

jest.mock("@ai-matrx/media/react", () => ({
  InlineMediaRef: () => (
    <div aria-label="Media unavailable">
      <button type="button" onClick={mockRemedy}>
        Open media details
      </button>
    </div>
  ),
}));

describe("ItemSwipeRow media fallback", () => {
  let host: HTMLDivElement;
  let root: Root;
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    mockRemedy.mockClear();
    consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    consoleError.mockRestore();
  });

  it("keeps the fallback remedy outside the row selection button", async () => {
    const onTap = jest.fn();
    await act(async () => {
      root.render(
        <ItemSwipeRow
          row={{
            id: "item-q28",
            code: "Q28-ERROR-FALLBACK",
            notes: "",
            createdAt: "2026-09-01T00:00:00.000Z",
            photoCount: 1,
            videoCount: 0,
            audioCount: 0,
            firstPhotoFileId: "missing-file-q28",
          }}
          onTap={onTap}
          leading={{
            icon: <span />,
            label: "Details",
            className: "",
            onTrigger: jest.fn(),
          }}
          onDelete={jest.fn()}
          onLongPress={jest.fn()}
        />,
      );
    });

    expect(host.querySelector("button button")).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();

    const remedy = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Open media details",
    );
    expect(remedy).toBeDefined();
    await act(async () => remedy?.click());
    expect(mockRemedy).toHaveBeenCalledTimes(1);
    expect(onTap).not.toHaveBeenCalled();

    const selection = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Q28-ERROR-FALLBACK"),
    );
    expect(selection).toBeDefined();
    await act(async () => selection?.click());
    expect(onTap).toHaveBeenCalledTimes(1);
  });
});
