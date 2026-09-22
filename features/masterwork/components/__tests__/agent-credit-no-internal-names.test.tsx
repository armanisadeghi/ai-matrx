/**
 * AN INTERNAL MANDATE KEY NEVER REACHES ANYBODY'S SCREEN — INCLUDING AN ADMIN'S.
 *
 * Found live on `/masterwork/<id>` (jobs-bar-2026-09-16 item 12, then cold
 * walks 16, 17, 18, 19 and 20): the Understudy card's title read
 *
 *   Understudy   masterwork.understudy
 *
 * — a dotted internal identifier printed beside a word the Expert is still
 * learning, on every single load of the screen she returns to most.
 *
 * The first version of this guard closed only half of it: it asserted the chip
 * was absent for a non-admin, and asserted the KEY was present for an admin.
 * Cold walk 20 then read the key off production anyway, because every walk,
 * every operator and every test signs in as `admin@admin.com`. An admin is a
 * person too, and `masterwork.understudy` is not a word. So:
 *
 *   • an Expert still sees no chip at all — absent, never greyed;
 *   • an admin sees the JOB'S NAME and a door to that job's own page;
 *   • nobody, in either state, sees a dotted key in the rendered words.
 *
 * Proven failing-then-passing, both clauses:
 *   • delete the `if (!isAdmin) return null` guard in AgentCredit → test 1 fails;
 *   • put `{mandate}` back in place of `{jobName}` → tests 2 and 3 fail.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { Provider } from "react-redux";
import { legacy_createStore as createStore } from "redux";

import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentCredit } from "../AgentCredit";
import { containsMandateKeyShape } from "@/features/mandates/__tests__/mandate-key-shape";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let isAdmin = false;
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => isAdmin,
}));

// The label read is a courtesy, not a gate: this suite deliberately lets it
// fail, because the name the chip paints with NO label at all is the one that
// must still be words. A derived name is the floor, not the happy path.
jest.mock("@/features/mandates/service", () => ({
  fetchMandateIdentities: async () => {
    throw new Error("no database in this suite");
  },
}));

const store = createStore(() => ({}));

/** Every key a real `<AgentCredit>` call site in this repo passes today. */
const REAL_CALL_SITE_KEYS = [
  "masterwork.understudy",
  "masterwork.scout",
  "masterwork.markup_distiller",
  "masterwork.monologue_distiller",
  "masterwork.timeline_distiller",
  "masterwork.source_distiller",
  "masterwork.rule_improver",
  "masterwork.transcript_distiller",
  "masterwork.exemplar_distiller",
  "masterwork.meeting_scavenger",
  "masterwork.triad_generator",
  "masterwork.sort_case_writer",
  "masterwork.conductor",
];

function render(mandate: string): { host: HTMLDivElement; root: Root } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <Provider store={store}>
        <TooltipProvider>
          <AgentCredit
            mandate={mandate as never}
            agent="Masterwork Understudy (generic)"
          />
        </TooltipProvider>
      </Provider>,
    );
  });
  return { host, root };
}

describe("the agent credit chip", () => {
  afterEach(() => {
    jest.spyOn(console, "error").mockRestore?.();
  });

  it("shows an Expert nothing at all — no name, no key, no admin door", () => {
    isAdmin = false;
    const { host, root } = render("masterwork.understudy");
    expect(host.textContent ?? "").toBe("");
    expect(host.querySelector("a")).toBeNull();
    act(() => root.unmount());
    host.remove();
  });

  it("gives an admin the job's NAME and a door to that job's own page", () => {
    isAdmin = true;
    const { host, root } = render("masterwork.understudy");
    const text = host.textContent ?? "";
    expect(text).toContain("Understudy");
    expect(
      host.querySelector('a[href="/mandates/masterwork.understudy"]'),
    ).not.toBeNull();
    act(() => root.unmount());
    host.remove();
  });

  it.each(REAL_CALL_SITE_KEYS)(
    "prints no dotted key for %s, in either identity",
    (key) => {
      for (const asAdmin of [false, true]) {
        isAdmin = asAdmin;
        const { host, root } = render(key);
        const text = host.textContent ?? "";
        expect(containsMandateKeyShape(text)).toBe(false);
        expect(text).not.toContain(key);
        act(() => root.unmount());
        host.remove();
      }
    },
  );
});
