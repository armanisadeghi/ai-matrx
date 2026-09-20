/**
 * 🚨 VERIFY-R7-FIX-WAVE NEW-1 — the three states, as ONE reading a surface
 * cannot get half right.
 *
 * `organization_id === null` means "boot has not answered" as often as it means
 * "you belong to nothing", and ten Google-native surfaces derived a terminal
 * refusal from that one nullable value. The repair is not ten repairs: the hook
 * hands out a DISCRIMINANT, the control gate hands out the `disabled` + `title`
 * a control renders, and the notice picks the screen. This proves all three
 * agree, in every state, and that the resolving state is never spelled as the
 * refusal — which is the only way this defect ever reaches a person.
 *
 * 🚨 WHAT ONE CASE HERE USED TO ASSERT, AND WHY IT IS NOW THE FAILURE MODE
 * (Arman, 2026-09-19). "the control gate never spells the refusal while
 * resolving" also pinned `required.disabled === true` — the refusal was a WALL:
 * the control went dead and its tooltip told the person to go somewhere else,
 * do something else, and come back. That dead end is exactly what pushed every
 * boot ladder in this codebase to GUESS an organization rather than end without
 * one:
 *
 *   "one missed org check that should have just failed turns into 50 in a
 *    month and 5,000 in a year, and suddenly we don't have orgs any more, we
 *    have a user and a default org, which means we just have user now."
 *
 * The ruling closes the loop from both sides: nothing picks for the person, and
 * every refusal must OFFER them the pick. So `required` keeps the control LIVE
 * and its press opens the picker (`the-fourth-state-is-not-the-refusal` proves
 * the press itself). `disabled` is now true in exactly ONE of the four states —
 * `resolving`, where the answer is still coming and there is genuinely nothing
 * useful a click could do — and the case below asserts that as a whole-table
 * property, so a second state going dead again fails here rather than on a
 * screen.
 *
 * The refusal SENTENCE changed with it: `organizationControlRefusal` now reads
 * "Choose an organization before <act>." Both wordings are checked against the
 * resolving beat below, because the defect this file exists for is the refusal
 * appearing early, whatever it happens to say this year.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const store = {
  organization_id: null as string | null,
  orgBootstrapResolved: false,
  // The FOURTH state's field (R37). Null throughout this file: these cases are
  // about the three states a successful read produces. The failed read has its
  // own proof — `the-fourth-state-is-not-the-refusal.test.tsx`.
  orgBootstrapFailure: null as string | null,
};

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({ appContext: store }),
  useAppDispatch: () => () => {},
}));

jest.mock("@/lib/redux/thunks/activeOrgBootstrap", () => ({
  retryActiveOrgBootstrap: () => ({ type: "test/retry" }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useOrganizationRequired } = require("@/features/organizations/useOrganizationRequired") as typeof import("@/features/organizations/useOrganizationRequired");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  useOrganizationGatedControl,
  ORGANIZATION_RESOLVING_TITLE,
  organizationControlRefusal,
} = require("@/features/organizations/useOrganizationGatedControl") as typeof import("@/features/organizations/useOrganizationGatedControl");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { OrganizationContextNotice } = require("@/features/organizations/components/OrganizationRequiredNotice") as {
  OrganizationContextNotice: React.ComponentType<Record<string, unknown>>;
};

jest.mock("@/features/organizations/components/OrganizationPickerPanel", () => ({
  OrganizationPickerPanel: () => null,
}));

function readHook<T>(hook: () => T): T {
  let value: T | undefined;
  const host = document.createElement("div");
  const root = createRoot(host);
  function Probe() {
    value = hook();
    return null;
  }
  act(() => {
    root.render(<Probe />);
  });
  act(() => root.unmount());
  return value as T;
}

function renderNotice(props: Record<string, unknown>): {
  html: string;
  find: (selector: string) => Element | null;
  text: string;
} {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<OrganizationContextNotice {...props} />);
  });
  const snapshot = {
    html: host.innerHTML,
    find: (selector: string) => host.querySelector(selector),
    text: host.textContent ?? "",
  };
  const frozen = {
    html: snapshot.html,
    text: snapshot.text,
    find: (selector: string) => {
      const scratch = document.createElement("div");
      scratch.innerHTML = snapshot.html;
      return scratch.querySelector(selector);
    },
  };
  act(() => root.unmount());
  host.remove();
  return frozen;
}

describe("the three organization states are one reading", () => {
  it("boot still resolving → resolving, never required", () => {
    store.organization_id = null;
    store.orgBootstrapResolved = false;
    const gate = readHook(() => useOrganizationRequired());
    expect(gate.organizationState).toBe("resolving");
    expect(gate.organizationRequired).toBe(false);
    expect(gate.canLoad).toBe(false);
  });

  it("boot settled with nothing → required", () => {
    store.organization_id = null;
    store.orgBootstrapResolved = true;
    expect(readHook(() => useOrganizationRequired()).organizationState).toBe("required");
  });

  it("a selection → ready, whatever the flag says", () => {
    store.organization_id = "11111111-2222-3333-4444-555555555555";
    store.orgBootstrapResolved = false;
    expect(readHook(() => useOrganizationRequired()).organizationState).toBe("ready");
  });

  it("the control gate never spells the refusal while resolving — and only RESOLVING goes dead", () => {
    store.organization_id = null;
    store.orgBootstrapResolved = false;
    const resolving = readHook(() => useOrganizationGatedControl("importing Google Tasks"));
    // The one state where a click has nothing useful to do: the answer is still
    // coming. This is the ONLY `disabled` in the table below.
    expect(resolving.disabled).toBe(true);
    expect(resolving.title).toBe(ORGANIZATION_RESOLVING_TITLE);
    // The defect this file exists for, checked against the refusal as it reads
    // today AND as it read before 2026-09-19 — a renamed sentence must not be
    // able to walk past this.
    expect(resolving.title).not.toMatch(/Select an organization/);
    expect(resolving.title).not.toMatch(/Choose an organization/);
    expect(resolving.title).not.toBe(
      organizationControlRefusal("importing Google Tasks"),
    );

    store.orgBootstrapResolved = true;
    const required = readHook(() => useOrganizationGatedControl("importing Google Tasks"));
    // 🚨 THE REFUSAL IS A QUESTION, NOT A WALL (2026-09-19). This asserted
    // `true` until today. A live control is the whole remedy: pressing it opens
    // the picker instead of sending the person away to find one.
    expect(required.disabled).toBe(false);
    expect(required.title).toBe(
      organizationControlRefusal("importing Google Tasks"),
    );
    expect(required.title).toBe("Choose an organization before importing Google Tasks.");

    store.organization_id = "11111111-2222-3333-4444-555555555555";
    const ready = readHook(() => useOrganizationGatedControl("importing Google Tasks"));
    expect(ready.disabled).toBe(false);
    expect(ready.title).toBeUndefined();
  });

  it("EXACTLY ONE of the four states disables the control, and it is `resolving`", () => {
    // The class guard for the ruling: a control that can do something useful
    // with a click is never dead (law 4). `required` opens the picker,
    // `unavailable` re-runs the read, `ready` acts — only the state that is
    // still waiting for an answer has nothing to offer. Written as a table so a
    // fifth state, or a state quietly going dead again, fails HERE.
    const dead: string[] = [];
    const states: { name: string; set: () => void }[] = [
      {
        name: "resolving",
        set: () => {
          store.organization_id = null;
          store.orgBootstrapResolved = false;
          store.orgBootstrapFailure = null;
        },
      },
      {
        name: "required",
        set: () => {
          store.organization_id = null;
          store.orgBootstrapResolved = true;
          store.orgBootstrapFailure = null;
        },
      },
      {
        name: "unavailable",
        set: () => {
          store.organization_id = null;
          store.orgBootstrapResolved = true;
          store.orgBootstrapFailure = "the organization read failed: Failed to fetch";
        },
      },
      {
        name: "ready",
        set: () => {
          store.organization_id = "11111111-2222-3333-4444-555555555555";
          store.orgBootstrapResolved = true;
          store.orgBootstrapFailure = null;
        },
      },
    ];

    for (const { name, set } of states) {
      set();
      const control = readHook(() =>
        useOrganizationGatedControl("importing Google Tasks"),
      );
      expect(control.organizationState).toBe(name);
      if (control.disabled) dead.push(name);
    }
    expect(dead).toEqual(["resolving"]);
    store.orgBootstrapFailure = null;
  });

  it("a FAILED read is unavailable, and the control never spells the refusal", () => {
    store.organization_id = null;
    store.orgBootstrapResolved = true;
    store.orgBootstrapFailure = "the organization read failed: Failed to fetch";
    const gate = readHook(() => useOrganizationRequired());
    expect(gate.organizationState).toBe("unavailable");
    expect(gate.organizationRequired).toBe(false);
    const control = readHook(() => useOrganizationGatedControl("importing Google Tasks"));
    // THE REMEDY IS THE PRESS (V-24 NEW-3): the fourth state's control is the
    // only one of the four that stays pressable, because its sentence ends
    // "Press to try again." and this press is what tries again.
    expect(control.disabled).toBe(false);
    expect(control.title).toMatch(/Press to try again/);
    expect(control.title).not.toMatch(/Select an organization/);
    store.orgBootstrapFailure = null;
  });

  it("the notice shows a checking state while resolving and the refusal only after", () => {
    const resolving = renderNotice({ state: "resolving", what: "Imported tasks" });
    expect(resolving.find('[data-testid="organization-resolving-notice"]')).not.toBeNull();
    expect(resolving.find('[data-testid="organization-required-notice"]')).toBeNull();
    expect(resolving.text).not.toMatch(/Select an organization/);
    expect(resolving.text).toMatch(/Checking which organization/i);

    const required = renderNotice({ state: "required", what: "Imported tasks" });
    expect(required.find('[data-testid="organization-required-notice"]')).not.toBeNull();

    const ready = renderNotice({ state: "ready", what: "Imported tasks" });
    expect(ready.text.trim()).toBe("");
  });
});
