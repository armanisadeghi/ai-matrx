import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CopyForAiButton } from "./FrameCopyForAiButton";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("FrameCopyForAiButton", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.body.appendChild(document.createElement("div"));
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders its visible label without reading the host clipboard", async () => {
    await act(async () => {
      root.render(
        <CopyForAiButton label="Source" agent="<source>frame</source>" />,
      );
    });

    expect(
      container.querySelector('[aria-label="Copy Source for AI"]')?.textContent,
    ).toBe("Copy for AI");
  });
});
