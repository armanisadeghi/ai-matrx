import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import FullScreenOverlay from "./FullScreenOverlay";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("FullScreenOverlay pending settlement boundary", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.replaceChildren();
  });

  it("freezes real dialog dismissal, Save, Cancel, tabs, and editor content while a write is pending, then re-enables retry", () => {
    const onClose = jest.fn();
    const onSave = jest.fn();
    const onCancel = jest.fn();
    const onTabChange = jest.fn();
    const render = (isPending: boolean, errorMessage: string | null = null) => {
      act(() => {
        root.render(
          <FullScreenOverlay
            isOpen
            title="Edit draft"
            tabs={[
              { id: "write", label: "Write", content: <textarea aria-label="Draft" /> },
              { id: "preview", label: "Preview", content: <div>Preview</div> },
            ]}
            onClose={onClose}
            onSave={onSave}
            onCancel={onCancel}
            onTabChange={onTabChange}
            showSaveButton
            showCancelButton
            isPending={isPending}
            errorMessage={errorMessage}
            onRetry={onSave}
          />,
        );
      });
    };

    render(true);
    const body = document.querySelector<HTMLElement>("[aria-busy='true']");
    expect(body).not.toBeNull();
    expect(body?.hasAttribute("inert")).toBe(true);
    expect(document.querySelector("[data-slot='dialog-close']")).toBeNull();

    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
    expect(buttons.find((button) => button.textContent?.includes("Save"))?.disabled).toBe(true);
    expect(buttons.find((button) => button.textContent === "Cancel")?.disabled).toBe(true);
    expect(buttons.find((button) => button.textContent === "Preview")?.disabled).toBe(true);
    act(() => {
      buttons.forEach((button) => button.click());
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      document.querySelector<HTMLElement>("[data-slot='dialog-overlay']")?.click();
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onTabChange).not.toHaveBeenCalled();

    render(false, "write failed");
    const enabledButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
    expect(document.querySelector("[data-slot='dialog-close']")).not.toBeNull();
    expect(enabledButtons.find((button) => button.textContent?.includes("Save"))?.disabled).toBe(false);
    expect(enabledButtons.find((button) => button.textContent === "Cancel")?.disabled).toBe(false);
    expect(enabledButtons.find((button) => button.textContent === "Preview")?.disabled).toBe(false);
    act(() => {
      enabledButtons.find((button) => button.textContent === "Preview")?.click();
      enabledButtons.find((button) => button.textContent === "Retry")?.click();
      enabledButtons.find((button) => button.textContent === "Cancel")?.click();
      document.querySelector<HTMLButtonElement>("[data-slot='dialog-close']")?.click();
    });
    expect(onTabChange).toHaveBeenCalledWith("preview");
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
