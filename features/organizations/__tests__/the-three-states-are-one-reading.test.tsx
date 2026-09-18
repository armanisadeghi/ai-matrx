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

  it("the control gate never spells the refusal while resolving", () => {
    store.organization_id = null;
    store.orgBootstrapResolved = false;
    const resolving = readHook(() => useOrganizationGatedControl("importing Google Tasks"));
    expect(resolving.disabled).toBe(true);
    expect(resolving.title).toBe(ORGANIZATION_RESOLVING_TITLE);
    expect(resolving.title).not.toMatch(/Select an organization/);

    store.orgBootstrapResolved = true;
    const required = readHook(() => useOrganizationGatedControl("importing Google Tasks"));
    expect(required.disabled).toBe(true);
    expect(required.title).toBe(
      organizationControlRefusal("importing Google Tasks"),
    );

    store.organization_id = "11111111-2222-3333-4444-555555555555";
    const ready = readHook(() => useOrganizationGatedControl("importing Google Tasks"));
    expect(ready.disabled).toBe(false);
    expect(ready.title).toBeUndefined();
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
