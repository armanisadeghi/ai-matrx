import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { SkuQuickEntry } from "./CaptureScreen";

function getInput(host: HTMLDivElement): HTMLInputElement {
  const input = host.querySelector("input");
  if (!(input instanceof HTMLInputElement)) throw new Error("SKU input missing");
  return input;
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  );
  if (!descriptor?.set) throw new Error("native input setter missing");
  descriptor.set.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("SkuQuickEntry", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("commits Enter once even though Enter also blurs the input", async () => {
    const onCommit = jest.fn().mockResolvedValue(true);
    await act(async () => {
      root.render(<SkuQuickEntry initialCode="" onCommit={onCommit} />);
    });
    const input = getInput(host);
    await act(async () => {
      input.focus();
      setNativeInputValue(input, "SKU-ENTER-ONCE");
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      await Promise.resolve();
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("SKU-ENTER-ONCE");
  });

  it("restores database truth when a commit fails", async () => {
    const onCommit = jest.fn().mockResolvedValue(false);
    await act(async () => {
      root.render(<SkuQuickEntry initialCode="SKU-SAVED" onCommit={onCommit} />);
    });
    const input = getInput(host);
    await act(async () => {
      input.focus();
      setNativeInputValue(input, "SKU-UNSAVED");
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      await Promise.resolve();
    });

    expect(input.value).toBe("SKU-SAVED");
  });
});
