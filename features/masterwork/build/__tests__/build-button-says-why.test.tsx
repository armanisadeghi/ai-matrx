/**
 * 🚨 THE BUILD BUTTON IS NEVER SILENTLY DISABLED (`teach-recent-practitioner`
 * W2, 2026-09-15).
 *
 * THE LIVE SHAPE THIS CLOSES: a non-technical Expert reached the payoff moment
 * of the whole product — "Build the Masterwork", after 28 drafted rules and 26
 * approvals — and the button was disabled with nothing said. The name field's
 * placeholder was the Rulebook's own name with "Masterwork" appended, which is
 * shaped exactly like a filled-in answer, so the screen read as complete. The
 * user clicked twice, by element reference and by coordinate; nothing happened,
 * no toast, no console error. They only got past it by guessing that the field
 * they could already read was empty and re-typing it.
 *
 * Two forcing functions, on the REAL window:
 *
 *   GUARD A — with an empty name, the disabled Build renders the sentence
 *             "Name your Masterwork to build it" on the screen.
 *   GUARD B — with a name typed, the reason is gone and the button is live.
 *
 * How to see GUARD A go red: swap the footer's `GatedActionButton` back for a
 * plain `<Button disabled={… || !name.trim() || …}>`. The button is disabled in
 * exactly the same states, and the test fails because the screen says nothing —
 * which is precisely the wall.
 *
 * The primitives themselves are guarded in
 * `components/official/__tests__/no-silent-disabled-action.test.tsx`.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { Rulebook } from "../../types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const RULEBOOK: Rulebook = {
  id: "rb-headless-headhunter",
  name: "Headless Headhunter Resume Review",
  description: "Reviews a resume the way Lee Korelitz would.",
  rules: [
    {
      id: "one-in-seven",
      name: "The 1-in-7 ratio",
      section: "A",
      statement: "A resume built to this method gets one interview per seven sends.",
      severity: "critical",
      draft: false,
    },
  ],
  metadata: null,
} as unknown as Rulebook;

jest.mock("../../service", () => ({
  getRulebook: jest.fn(async () => RULEBOOK),
}));

jest.mock("../useBuildRun", () => ({
  useBuildRun: () => ({
    running: false,
    result: null,
    progress: null,
    error: null,
    rejoining: false,
    launch: jest.fn(),
    reset: jest.fn(),
  }),
}));

// The window chrome is proven elsewhere; this test is about the footer's words.
jest.mock("@/features/window-panels/WindowPanel", () => ({
  WindowPanel: ({
    children,
    footer,
  }: {
    children: React.ReactNode;
    footer: React.ReactNode;
  }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}));
jest.mock("@/features/agents/components/live-run/LiveRunProgress", () => ({
  LiveRunProgress: () => null,
}));
jest.mock("../../components/masterworks/TryMasterworkBox", () => ({
  TryMasterworkBox: () => null,
}));
jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

const BuildWindow = require("../BuildWindow").default;

let host: HTMLDivElement;
let root: Root;

async function open() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <BuildWindow isOpen onClose={() => {}} rulebookId={RULEBOOK.id} />,
    );
  });
}

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function buildButton(): HTMLButtonElement {
  const found = Array.from(host.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes("Build the Masterwork"),
  );
  if (!found) throw new Error("no Build button on the screen");
  return found as HTMLButtonElement;
}

describe("the Build button", () => {
  it("GUARD A — disabled on an empty name, and SAYS SO", async () => {
    await open();

    const button = buildButton();
    expect(button.disabled).toBe(true);

    // The wall itself: disabled is allowed, wordless is not.
    expect(host.textContent ?? "").toContain(
      "Name your Masterwork to build it",
    );
    expect(button.getAttribute("aria-describedby")).toBeTruthy();

    // And the field the user could not tell was empty now says it is.
    const nameInput = host.querySelector<HTMLInputElement>(
      "#masterwork-name",
    );
    expect(nameInput).not.toBeNull();
    expect(nameInput!.value).toBe("");
    expect(host.querySelector('[data-required-empty="true"]')).not.toBeNull();
    expect(host.textContent ?? "").toMatch(/example, not your answer/i);
  });

  it("GUARD B — a typed name clears the reason and arms the button", async () => {
    await open();

    const input = host.querySelector<HTMLInputElement>("#masterwork-name")!;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      setter.call(input, "Headless Headhunter Resume Review Masterwork");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(buildButton().disabled).toBe(false);
    expect(host.textContent ?? "").not.toContain(
      "Name your Masterwork to build it",
    );
    expect(host.querySelector('[data-required-empty="true"]')).toBeNull();
  });
});
