/**
 * The ONE pitch-advisory panel: warnings in the authors' words, offers that are
 * either real buttons or honest guidance, and a promise that nothing stops the
 * action. Every expected string is typed by hand.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../MandateOffer", () => ({
  MandateOffer: ({ offer }: { offer: { label: string; mandate_key?: string } }) => (
    <button type="button" data-mandate={offer.mandate_key}>
      {offer.label}
    </button>
  ),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import { PitchAdvisoryPanel } from "../PitchAdvisoryPanel";
import type { PitchAdvisory, PitchAdvisoryReport } from "../service";

const E1: PitchAdvisory = {
  rule: "E1",
  code: "recipients_warn",
  severity: "warn",
  message: "You're at 21 journalists. We're past the point where one pitch fits all of them.",
  offer: { label: "Cut to the 5–8 who match", action: "mandate", mandate_key: "crm.outreach_recipient_shortlister", detail: {} },
  other_offers: [],
  knob: "pr.recipients_warn_at",
  evidence: {},
};
const E6: PitchAdvisory = {
  rule: "E6",
  code: "no_anchor",
  severity: "warn",
  message: "This is a generic intro. Without a recent reference of theirs, it is mail merge.",
  offer: { label: "Find their latest piece", action: "mandate", mandate_key: "crm.journalist_beat_analyst", detail: {} },
  other_offers: [{ label: "Label as cold", action: "label_cold", detail: {} }],
  knob: "pr.require_anchor",
  evidence: {},
};
const E16: PitchAdvisory = {
  rule: "E16",
  code: "tracking_pixel",
  severity: "warn",
  message: "This pitch carries a tracking pixel.",
  offer: { label: "Strip the beacon", action: "strip_tracking", detail: {} },
  other_offers: [],
  knob: "pr.warn_tracking_pixel",
  evidence: {},
};

function report(advisories: PitchAdvisory[]): PitchAdvisoryReport {
  return { surface: "single_send", advisories, action_may_proceed: true, wants_person: false };
}

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(ui: React.ReactElement) {
  act(() => root.render(ui));
}

const idle = { loading: false, error: null, retry: () => undefined };

test("renders each warning in the authors' words with its rule and the go-ahead promise", () => {
  render(<PitchAdvisoryPanel state={{ ...idle, report: report([E1]) }} organizationId="org-1" actionLabel="the send" />);
  const text = container.textContent ?? "";
  expect(text).toContain("You're at 21 journalists. We're past the point where one pitch fits all of them.");
  expect(text).toContain("E1");
  expect(text).toContain("None of these stop you — the send still goes ahead, and we note that you saw them.");
  expect(container.querySelector('a[href="/organizations/org-1/settings/configuration"]')?.textContent).toBe(
    "Change these in your PR settings",
  );
  expect(container.querySelector('[data-mandate="crm.outreach_recipient_shortlister"]')?.textContent).toBe(
    "Cut to the 5–8 who match",
  );
});

test("a local offer the host performs is a button; one it cannot is guidance, never a dead button", () => {
  const onLocalOffer = jest.fn(() => true);
  render(
    <PitchAdvisoryPanel
      state={{ ...idle, report: report([E6, E16]) }}
      onLocalOffer={onLocalOffer}
      canPerformLocal={(offer) => offer.action === "label_cold"}
    />,
  );
  const buttons = Array.from(container.querySelectorAll("button")).map((b) => b.textContent);
  expect(buttons).toContain("Label as cold");
  expect(buttons).not.toContain("Strip the beacon");
  expect(container.textContent).toContain("Suggested: Strip the beacon");
  const cold = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Label as cold");
  act(() => cold?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(onLocalOffer).toHaveBeenCalledWith(E6, E6.other_offers?.[0]);
  expect(container.querySelectorAll("button[disabled]").length).toBe(0);
});

test("a failed check says plainly that nothing stops the action, and offers a retry", () => {
  const retry = jest.fn();
  render(<PitchAdvisoryPanel state={{ report: null, loading: false, error: "server down", retry }} actionLabel="the send" />);
  expect(container.textContent).toContain("The pitch check could not run (server down). Nothing is stopping the send");
  const again = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Check again");
  act(() => again?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(retry).toHaveBeenCalled();
});

test("a clean pitch renders nothing at all", () => {
  render(<PitchAdvisoryPanel state={{ ...idle, report: report([]) }} />);
  expect(container.innerHTML).toBe("");
});

test("info-only reports carry no go-ahead line", () => {
  const info: PitchAdvisory = { ...E1, rule: "E17", code: "press_pitch_per_message", severity: "info", offer: null, message: "I draft. You send." };
  render(<PitchAdvisoryPanel state={{ ...idle, report: report([info]) }} />);
  expect(container.textContent).toContain("I draft. You send.");
  expect(container.querySelector('[data-testid="pitch-advisories-go-ahead-note"]')).toBeNull();
});
