/** @jest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SelectInput } from "./SelectInput";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    onValueChange,
  }: {
    children: ReactNode;
    onValueChange: (value: string) => void;
  }) => (
    <button type="button" onClick={() => onValueChange("3")}>
      {children}
    </button>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => children,
  SelectItem: ({ children }: { children: ReactNode }) => children,
  SelectTrigger: ({ children }: { children: ReactNode }) => children,
  SelectValue: () => null,
}));

jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: () => null,
}));

describe("SelectInput modal-layer close boundary", () => {
  let host: HTMLDivElement;
  let root: Root;
  let originalRaf: typeof requestAnimationFrame;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    originalRaf = globalThis.requestAnimationFrame;
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.style.removeProperty("pointer-events");
    globalThis.requestAnimationFrame = originalRaf;
  });

  it("waits for the Radix body lock to settle before changing parent state", async () => {
    const frames: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    };
    const onChange = jest.fn();

    await act(async () => {
      root.render(
        <SelectInput
          value="2"
          onChange={onChange}
          options={["1", "2", "3"]}
          variableName="How many voices?"
        />,
      );
    });

    document.body.style.pointerEvents = "none";
    act(() => host.querySelector("button")?.click());
    expect(onChange).not.toHaveBeenCalled();

    act(() => frames.shift()?.(0));
    expect(onChange).not.toHaveBeenCalled();

    document.body.style.removeProperty("pointer-events");
    act(() => frames.shift()?.(1));
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      frames.shift()?.(2);
      await Promise.resolve();
    });
    expect(onChange).toHaveBeenCalledWith("3");
  });
});
