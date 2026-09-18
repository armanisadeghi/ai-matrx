import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { TrimControl } from "./TrimControl";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Radix measures its track; jsdom does not provide this browser API.
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

function ControlledTrim({ max, initial = 15 }: { max: number; initial?: number }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <TrimControl label="Trim start" max={max} value={value} onChange={setValue} />
      <output data-trim-value>{value}</output>
    </>
  );
}

function renderControl(max: number, initial = 15) {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => {
    root.render(<ControlledTrim max={max} initial={initial} />);
  });
  return { container, root };
}

function trimValue(container: HTMLDivElement) {
  return Number(container.querySelector("output")?.textContent);
}

describe("TrimControl", () => {
  it("keeps coarse keyboard nudges exact and reaches both large-range endpoints", () => {
    const { container, root } = renderControl(100_000_001);
    const thumb = container.querySelector('[role="slider"]') as HTMLElement;

    expect(thumb.getAttribute("aria-valuetext")).toBe("15 characters");
    act(() => {
      thumb.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
    });
    expect(trimValue(container)).toBe(16);

    act(() => {
      thumb.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "End" }));
    });
    expect(trimValue(container)).toBe(100_000_001);

    act(() => {
      thumb.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Home" }));
    });
    expect(trimValue(container)).toBe(0);

    act(() => {
      root.unmount();
    });
  });

  it("contracts a 100M range until the slider has exact one-character stops", () => {
    const { container, root } = renderControl(100_000_000, 0);
    const fineTune = container.querySelector(
      '[aria-label="Fine tune trim range"]',
    ) as HTMLButtonElement;
    let zooms = 0;

    while (!fineTune.disabled) {
      act(() => {
        fineTune.click();
      });
      zooms += 1;
    }

    const thumb = container.querySelector('[role="slider"]') as HTMLElement;
    expect(zooms).toBe(6);
    expect(thumb.getAttribute("aria-valuemax")).toBe("100");

    act(() => {
      thumb.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
    });
    expect(trimValue(container)).toBe(1);

    act(() => {
      root.unmount();
    });
  });

  it("retains exact endpoint behavior for a short range", () => {
    const { container, root } = renderControl(100);
    const thumb = container.querySelector('[role="slider"]') as HTMLElement;

    act(() => {
      thumb.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "End" }));
    });
    expect(trimValue(container)).toBe(100);
    expect(thumb.getAttribute("aria-valuemax")).toBe("100");

    act(() => {
      root.unmount();
    });
  });
});
