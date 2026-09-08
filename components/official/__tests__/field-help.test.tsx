import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FieldHelp } from "../ConfigurationFields";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function pointer(
  target: Element,
  type: string,
  relatedTarget: EventTarget | null = null,
) {
  const event = new MouseEvent(type, { bubbles: true, relatedTarget });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  act(() => {
    target.dispatchEvent(event);
  });
}

describe("field help interaction lifecycle", () => {
  let host: HTMLDivElement;
  let root: Root;
  let first: HTMLButtonElement;
  let second: HTMLButtonElement;
  beforeEach(() => {
    jest.useFakeTimers();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() =>
      root.render(
        <>
          <FieldHelp label="First">First explanation</FieldHelp>
          <FieldHelp label="Second">Second explanation</FieldHelp>
          <button>Outside</button>
        </>,
      ),
    );
    first = host.querySelector<HTMLButtonElement>(
      '[aria-label="Help: First"]',
    )!;
    second = host.querySelector<HTMLButtonElement>(
      '[aria-label="Help: Second"]',
    )!;
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    jest.useRealTimers();
  });
  it("closes after a short pointer-leave grace period", () => {
    pointer(first, "pointerover");
    expect(first.getAttribute("aria-expanded")).toBe("true");
    pointer(first, "pointerout", document.body);
    act(() => jest.advanceTimersByTime(100));
    expect(first.getAttribute("aria-expanded")).toBe("true");
    act(() => jest.advanceTimersByTime(150));
    expect(first.getAttribute("aria-expanded")).toBe("false");
  });
  it("allows moving into the help content and closes after leaving it", () => {
    pointer(first, "pointerover");
    const content = document.querySelector('[role="dialog"]')!;
    pointer(first, "pointerout", content);
    pointer(content, "pointerover", first);
    act(() => jest.advanceTimersByTime(300));
    expect(first.getAttribute("aria-expanded")).toBe("true");
    pointer(content, "pointerout", document.body);
    act(() => jest.advanceTimersByTime(250));
    expect(first.getAttribute("aria-expanded")).toBe("false");
  });
  it("keeps only the most recently opened help expanded", () => {
    pointer(first, "pointerover");
    pointer(second, "pointerover");
    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(second.getAttribute("aria-expanded")).toBe("true");
  });
  it("closes after keyboard focus leaves the help", () => {
    act(() => first.focus());
    expect(first.getAttribute("aria-expanded")).toBe("true");
    act(() => host.querySelectorAll("button")[2].focus());
    act(() => jest.advanceTimersByTime(250));
    expect(first.getAttribute("aria-expanded")).toBe("false");
  });
});
