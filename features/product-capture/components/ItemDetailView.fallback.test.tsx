import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { MediaTile } from "./ItemDetailView";

const mockRemedy = jest.fn();

jest.mock("@/features/media-capture/components/CaptureThumb", () => ({
  CaptureThumb: () => (
    <div aria-label="Media unavailable">
      <button type="button" onClick={mockRemedy}>
        Copy URL
      </button>
    </div>
  ),
}));

describe("ItemDetailView MediaTile fallback", () => {
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

  it("keeps the fallback remedy outside an interactive ancestor", async () => {
    const onOpen = jest.fn();
    await act(async () => {
      root.render(
        <MediaTile
          fileId="missing-file-q28"
          kind="photo"
          alt="Q28 missing media"
          onOpen={onOpen}
          onLongPress={jest.fn()}
        />,
      );
    });

    expect(host.querySelector("button button")).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();

    const remedy = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Copy URL",
    );
    await act(async () => remedy?.click());
    expect(mockRemedy).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();

    const tile = host.querySelector<HTMLElement>("[role='button'][aria-label='View file']");
    expect(tile).not.toBeNull();
    await act(async () => tile?.click());
    expect(onOpen).toHaveBeenCalledTimes(1);

    await act(async () => {
      tile?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
