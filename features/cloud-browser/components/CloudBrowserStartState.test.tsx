/**
 * The failed-start card must never offer a button that cannot work: Try again
 * appears ONLY when the server said a retry can succeed. Otherwise it says so
 * plainly and shows the reference to quote.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  CloudBrowserStartFailed,
  CloudBrowserStarting,
} from "./CloudBrowserStartState";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

async function render(ui: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(ui);
  });
  const button = (label: string) =>
    Array.from(container.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes(label),
    );
  return {
    text: () => container.textContent ?? "",
    button,
    async click(label: string) {
      const b = button(label);
      if (!b) throw new Error(`no button "${label}"`);
      await act(async () => {
        b.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe("CloudBrowserStartState", () => {
  it("says what is happening while a browser starts", async () => {
    const v = await render(<CloudBrowserStarting />);
    expect(v.text()).toContain("Starting your cloud browser");
    expect(v.text()).toContain("up to a minute");
    await v.unmount();
  });

  it("offers Try again when the server says a retry can work", async () => {
    const onRetry = jest.fn();
    const v = await render(
      <CloudBrowserStartFailed
        error={{ message: "Busy right now.", retryable: true, requestId: "req-1" }}
        retrying={false}
        onRetry={onRetry}
      />,
    );
    expect(v.text()).toContain("Busy right now.");
    await v.click("Try again");
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(v.text()).toContain("req-1");
    await v.unmount();
  });

  it("never offers a button that cannot work", async () => {
    const v = await render(
      <CloudBrowserStartFailed
        error={{ message: "No access.", retryable: false, requestId: "req-2" }}
        retrying={false}
        onRetry={jest.fn()}
      />,
    );
    expect(v.button("Try again")).toBeUndefined();
    expect(v.text()).toContain("Trying again will not fix this one.");
    expect(v.text()).toContain("req-2");
    await v.unmount();
  });
});
