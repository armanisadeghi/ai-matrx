/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
const settle = async () => {
  for (let i = 0; i < 5; i += 1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
};
import { Toaster as Sonner } from "sonner";
import { toast, dismissAllTrackedToasts } from "@/lib/toast";
import { decorateErrorToast } from "../errorToastAlchemy";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

it("keeps the error copy menu open when focus leaves Sonner, then copies the rendered error", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  await act(async () =>
    root.render(
      <>
        <button>Launch</button>
        <Sonner />
      </>,
    ),
  );
  const launch = host.querySelector("button")!;
  launch.focus();
  await act(async () => {
    toast.error(
      "Couldn't mark messages as read",
      decorateErrorToast(
        "Couldn't mark messages as read",
        { description: "Try again." },
        null,
      ),
    );
  });
  try {
    await settle();
    expect(
      host.querySelector("[data-error-alchemy-menu] button"),
    ).not.toBeNull();
    const trigger = host.querySelector<HTMLButtonElement>(
      "[data-error-alchemy-menu] button",
    )!;
    await act(async () => {
      trigger.focus();
      trigger.click();
    });
    await settle();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const copy = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Copy Plain text"]',
    );
    expect(copy).not.toBeNull();
    await act(async () => {
      copy!.click();
    });
    await settle();
    expect(writeText).toHaveBeenCalledWith(
      "Couldn't mark messages as read: Try again.",
    );
  } finally {
    await act(async () => {
      toast.dismiss();
      dismissAllTrackedToasts();
      root.unmount();
    });
    host.remove();
  }
});
