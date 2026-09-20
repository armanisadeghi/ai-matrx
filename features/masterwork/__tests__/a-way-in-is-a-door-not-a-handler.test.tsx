/**
 * N5 (jobs-bar cold-walk-13): "ALL THE WAYS TO ADD" WAS A DEAD CONTROL.
 *
 * Verbatim from the walk: "Measured on two separate clicks with the element
 * scrolled into view: zero network requests, no dialog, no popup, no
 * navigation, no console error. The route it presumably wants,
 * `/masterwork/approaches`, exists in the source. Its neighbour 'Your words'
 * does open a panel, so the two controls sit side by side and only one of them
 * is real."
 *
 * The wiring read correctly end to end — `onOpenApproaches` →
 * `setApproachPickerOpen(true)` → `<ApproachPickerDialog open>` — and a
 * `Button` inside a `TooltipTrigger asChild` fires its `onClick` in a real DOM
 * (proven separately). Which is exactly the problem: the control's ENTIRE
 * promise rested on one handler, so there was no evidence to find and nothing
 * left over when it did not fire. A control whose only behaviour is JavaScript
 * can fail silently; an anchor cannot.
 *
 * THE LAW THIS GUARDS: a control that promises a door is a door. The primary
 * behaviour stays the in-place picker (it launches an Approach's lane into THIS
 * Rulebook), and the href is the floor underneath it.
 *
 * RED PROOF (run either and this file fails):
 *   1. In `RulebookInputsSection.tsx`, put the plain `<Button onClick=…>` back
 *      in place of the `<Button asChild><Link href=…>` — "is a real door"
 *      fails: the control is a BUTTON with no href.
 *   2. Delete the `event.preventDefault()` at the end of the click handler —
 *      "a plain click opens the picker in place" fails: the click is left
 *      unhandled and the browser would navigate away from the Rulebook.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// The two lists this section wraps each talk to the server on mount. Neither
// has anything to do with the header control under test, and a real one would
// make this a network test. The header itself is the real thing.
jest.mock("../record/ConversationsSection", () => ({
  ConversationsSection: () => null,
}));
jest.mock("../components/detail/RulebookSourcesPanel", () => ({
  RulebookSourcesPanel: () => null,
}));

import { RulebookInputsSection } from "../components/detail/RulebookInputsSection";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Rulebook } from "../types";

const RULEBOOK = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Commercial irrigation",
} as unknown as Rulebook;

let host: HTMLDivElement;
let root: Root;

function renderSection(onOpenApproaches: () => void) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  return act(async () => {
    root.render(
      <Provider store={configureStore({ reducer: { noop: (state = {}) => state } })}>
        <TooltipProvider>
          <RulebookInputsSection
          rulebook={RULEBOOK}
          canEdit
          dumpFocus={false}
          onRulebookChanged={() => undefined}
          onIngested={() => undefined}
          onContinueInterview={() => undefined}
          onStartInterview={() => undefined}
            onOpenApproaches={onOpenApproaches}
          />
        </TooltipProvider>
      </Provider>,
    );
  });
}

function control(): HTMLElement {
  const match = Array.from(host.querySelectorAll("a, button")).find((node) =>
    node.textContent?.includes("All the ways to add"),
  );
  if (!match) throw new Error('no "All the ways to add" control on screen');
  return match as HTMLElement;
}

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

test("is a real door — an anchor to the catalog the tooltip promises", async () => {
  await renderSection(() => undefined);
  const node = control();
  expect(node.tagName).toBe("A");
  expect(node.getAttribute("href")).toBe("/masterwork/approaches");
});

test("a plain click opens the picker in place and does not navigate away", async () => {
  const onOpenApproaches = jest.fn();
  await renderSection(onOpenApproaches);
  const event = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
  });
  await act(async () => {
    control().dispatchEvent(event);
  });
  expect(onOpenApproaches).toHaveBeenCalledTimes(1);
  expect(event.defaultPrevented).toBe(true);
});

test("a modifier click is the person's — it is left to the browser", async () => {
  const onOpenApproaches = jest.fn();
  await renderSection(onOpenApproaches);
  const event = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
    metaKey: true,
  });
  await act(async () => {
    control().dispatchEvent(event);
  });
  expect(onOpenApproaches).not.toHaveBeenCalled();
  expect(event.defaultPrevented).toBe(false);
});
