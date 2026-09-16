/**
 * AN INTERNAL MANDATE KEY NEVER REACHES A NON-TECHNICAL EXPERT'S SCREEN.
 *
 * Found live on `/masterwork/<id>` (jobs-bar-2026-09-16, item 12): the
 * Understudy card's title read
 *
 *   Understudy   masterwork.understudy
 *
 * — a dotted internal identifier printed beside a word the Expert is still
 * learning, linking to `/mandates`, an admin route she cannot open.
 *
 * The chip exists because Arman asked for it (2026-08-21: "I need to see which
 * agent it's invoking, because I need to go look at that agent's instructions")
 * — as the platform admin. So the chip is kept, in full, for admins, and is
 * absent for everyone else. Absent, never greyed: a screen is absent or honest.
 *
 * Proven failing-then-passing: delete the `if (!isAdmin) return null` guard in
 * AgentCredit and the first test fails.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { Provider } from "react-redux";
import { legacy_createStore as createStore } from "redux";

import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentCredit } from "../AgentCredit";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let isAdmin = false;
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => isAdmin,
}));


const store = createStore(() => ({}));

function render(): { host: HTMLDivElement; root: Root } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <Provider store={store}>
        <TooltipProvider>
          <AgentCredit
            mandate="masterwork.understudy"
            agent="Masterwork Understudy (generic)"
          />
        </TooltipProvider>
      </Provider>,
    );
  });
  return { host, root };
}

describe("the agent credit chip", () => {
  it("shows an Expert nothing at all — no key, no admin link", () => {
    isAdmin = false;
    const { host, root } = render();
    expect(host.textContent ?? "").not.toContain("masterwork.understudy");
    expect(host.querySelector('a[href="/mandates"]')).toBeNull();
    act(() => root.unmount());
    host.remove();
  });

  it("still gives an admin the key and the door to its instructions", () => {
    isAdmin = true;
    const { host, root } = render();
    expect(host.textContent ?? "").toContain("masterwork.understudy");
    expect(host.querySelector('a[href="/mandates"]')).not.toBeNull();
    act(() => root.unmount());
    host.remove();
  });
});
