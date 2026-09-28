/**
 * Two rules from Arman, 2026-09-28, driven through the REAL Toaster, the REAL
 * sonner renderer and the REAL `lib/toast` clock in jsdom:
 *
 *   1. "errors aren't like positive things. They need to remain for 5 seconds
 *      min." — an error toast never leaves before MIN_ERROR_TOAST_MS.
 *   2. "if you hover it, it cannot close while you're hovering, and in fact,
 *      the timer to close must restart back each time you hover it again" —
 *      including while the toast's Alchemy copy menu (rendered in a portal
 *      OUTSIDE the toaster) is open.
 *
 * RED proof: set MIN_ERROR_TOAST_MS to 0 → test 1 fails; delete
 * `useToastHold()` from components/ui/sonner.tsx → test 2 fails; drop the
 * `[aria-expanded="true"]` arm of `toasterIsHeld` → test 3 fails.
 *
 * jsdom has no PointerEvent; a MouseEvent carrying the pointer event TYPE is
 * what the document listeners receive either way.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("next/navigation", () => ({ usePathname: () => "/notes" }));

import { Toaster } from "@/components/ui/sonner";
import { toast, dismissAllTrackedToasts, MIN_ERROR_TOAST_MS } from "@/lib/toast";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const toastText = () =>
  [...document.querySelectorAll('li[data-sonner-toast]:not([data-removed="true"])')]
    .map((li) => li.textContent ?? "")
    .join(" | ");
const toaster = () => document.querySelector("[data-sonner-toaster]") as HTMLElement;

async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await wait(0);
    });
  }
}

async function pass(ms: number) {
  await act(async () => {
    await wait(ms);
  });
}

beforeEach(async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<Toaster />);
  });
});

afterEach(async () => {
  dismissAllTrackedToasts();
  toast.dismiss();
  await act(async () => root.unmount());
  container.remove();
});

it("an error toast stays at least five seconds, whatever duration the caller asked for", async () => {
  expect(MIN_ERROR_TOAST_MS).toBeGreaterThanOrEqual(5000);
  await act(async () => {
    toast.error("Could not save the note", { duration: 1000 });
  });
  await settle();
  await pass(2000);
  expect(toastText()).toContain("Could not save the note");
  await pass(MIN_ERROR_TOAST_MS - 2000 + 700);
  expect(toastText()).not.toContain("Could not save the note");
}, 15_000);

it("a hovered toast never closes, and leaving it restarts its full lifetime", async () => {
  await act(async () => {
    toast.success("Copied", { duration: 1000 });
  });
  await settle();
  const li = document.querySelector("li[data-sonner-toast]") as HTMLElement;
  await act(async () => {
    li.dispatchEvent(new MouseEvent("pointerover", { bubbles: true, relatedTarget: document.body }));
  });
  await pass(1800); // well past its 1s lifetime — held
  expect(toastText()).toContain("Copied");

  await act(async () => {
    li.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: document.body }));
  });
  await pass(600); // a restarted 1s clock has not run out yet
  expect(toastText()).toContain("Copied");
  await pass(900);
  expect(toastText()).not.toContain("Copied");
}, 15_000);

it("a toast whose copy menu is open stays until the menu closes, then gets its full lifetime", async () => {
  await act(async () => {
    toast.success("Saved", { duration: 1000 });
  });
  await settle();
  // The menu trigger inside the toast reports its open popover.
  const trigger = document.createElement("button");
  trigger.setAttribute("aria-expanded", "true");
  toaster().appendChild(trigger);
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent("pointerover", { bubbles: true, relatedTarget: document.body }));
    // The pointer moves into the menu's portal, outside the toaster.
    trigger.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: document.body }));
  });
  await pass(2500);
  expect(toastText()).toContain("Saved");

  trigger.remove(); // the menu closed
  await pass(1000); // the next look sees the hold ended and restarts the clock
  expect(toastText()).toContain("Saved");
  await pass(1500);
  expect(toastText()).not.toContain("Saved");
}, 15_000);
