/**
 * 🚨 V-23 NEW-2 / R37 — a FAILED organization read is the fourth state, and it
 * is never the refusal.
 *
 * From the seat, on a cold load whose Supabase calls failed:
 *
 *   +4.4s  [resolveActiveOrgContext] current_personal_org_id() failed;
 *          falling back to org-list heuristic {TypeError: Failed to fetch}
 *   +4.4s  the import control's title: "Checking which organization you are
 *          working in…"  →  "Select an organization before importing Google
 *          Tasks.", disabled, for the remaining 24 seconds
 *
 * The person is a member of THIRTEEN organizations. Nobody read them. "Select
 * an organization" is a statement about memberships, and it may only be made
 * once the memberships have been READ — every other exit of the boot fetch (an
 * abort, a page that never went idle, a null resolve, a thrown RPC) landed in
 * the same terminal `required` state because that state was the only terminal
 * one there was.
 *
 * This test walks the REAL chain — the policy's own `remote.fetch`, its own
 * `deserialize` (the engine runs it over the fetch body, and a new field it
 * drops is a field the UI never sees), the real reducer, the real selectors,
 * the real hook, the real control gate and the real notice — so nothing here
 * can pass on a shape the boot path does not actually produce.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const resolveActiveOrgContext = jest.fn();
jest.mock("@/lib/organizations/resolveActiveOrgContext", () => ({
  resolveActiveOrgContext: (...args: unknown[]) => resolveActiveOrgContext(...args),
}));
jest.mock("@ai-matrx/kit/idle-scheduler", () => ({
  whenPageIdle: async () => true,
}));
jest.mock("@/lib/sync/identity", () => ({
  getIdentity: () => ({ type: "auth", userId: "user-13-orgs", key: "auth:user-13-orgs" }),
}));
jest.mock("@/lib/organizations/activeOrgCookie", () => ({
  activeOrgCookie: { read: () => null, clear: () => {} },
}));
jest.mock("@/lib/organizations/orgBootstrapGate", () => ({
  markOrgBootstrapResolved: () => {},
}));
jest.mock("@/features/organizations/components/OrganizationPickerPanel", () => ({
  OrganizationPickerPanel: () => null,
}));

const retryActiveOrgBootstrap = jest.fn(() => ({ type: "test/retry" }));
jest.mock("@/lib/redux/thunks/activeOrgBootstrap", () => ({
  retryActiveOrgBootstrap: () => retryActiveOrgBootstrap(),
}));

const dispatched: unknown[] = [];
let current: Record<string, unknown>;

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({ appContext: current }),
  useAppDispatch: () => (action: unknown) => {
    dispatched.push(action);
    return action;
  },
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const sliceModule =
  require("@/lib/redux/slices/appContextSlice") as typeof import("@/lib/redux/slices/appContextSlice");
const { REHYDRATE_ACTION_TYPE } =
  require("@/lib/sync/engine/rehydrate") as typeof import("@/lib/sync/engine/rehydrate");
const {
  useOrganizationRequired,
  ORGANIZATION_UNAVAILABLE_TITLE,
  ORGANIZATION_UNAVAILABLE_DESCRIPTION,
} = require("@/features/organizations/useOrganizationRequired") as typeof import("@/features/organizations/useOrganizationRequired");
const {
  useOrganizationGatedControl,
  ORGANIZATION_UNAVAILABLE_TITLE_CONTROL,
} = require("@/features/organizations/useOrganizationGatedControl") as typeof import("@/features/organizations/useOrganizationGatedControl");
const { OrganizationContextNotice } =
  require("@/features/organizations/components/OrganizationRequiredNotice") as {
    OrganizationContextNotice: React.ComponentType<Record<string, unknown>>;
  };
/* eslint-enable @typescript-eslint/no-require-imports */

const appContextReducer = sliceModule.default;
const { appContextPolicy, selectShouldPromptForOrganization, selectOrgBootstrapFailure } =
  sliceModule;

/** Run the boot fetch exactly as the sync engine does, into real slice state. */
async function boot(): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const result = await appContextPolicy.config.remote!.fetch!({
    identity: { type: "auth", userId: "user-13-orgs", key: "auth:user-13-orgs" },
    signal: controller.signal,
    reason: "cold-boot",
  } as never);
  // The engine honours `deserialize` on the fetch body before rehydrating.
  const state = appContextPolicy.config.deserialize!(result as never);
  return appContextReducer(undefined, {
    type: REHYDRATE_ACTION_TYPE,
    payload: { sliceName: "appContext", state },
  }) as unknown as Record<string, unknown>;
}

function readHook<T>(hook: () => T): T {
  let value: T | undefined;
  const host = document.createElement("div");
  const root = createRoot(host);
  function Probe() {
    value = hook();
    return null;
  }
  act(() => root.render(<Probe />));
  act(() => root.unmount());
  return value as T;
}

function renderNotice(props: Record<string, unknown>): {
  html: string;
  text: string;
  click: (selector: string) => void;
} {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<OrganizationContextNotice {...props} />));
  const html = host.innerHTML;
  const text = host.textContent ?? "";
  const click = (selector: string) => {
    const el = host.querySelector(selector) as HTMLElement | null;
    if (!el) throw new Error(`no element for ${selector}`);
    act(() => {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  };
  return { html, text, click };
}

beforeEach(() => {
  dispatched.length = 0;
  retryActiveOrgBootstrap.mockClear();
  resolveActiveOrgContext.mockReset();
});

describe("a failed organization read is unavailable, never required", () => {
  it("the membership read throwing lands unavailable — and never the refusal", async () => {
    resolveActiveOrgContext.mockRejectedValue(new TypeError("Failed to fetch"));
    current = await boot();

    expect(current.orgBootstrapResolved).toBe(true);
    expect(current.organization_id).toBeNull();
    expect(selectOrgBootstrapFailure({ appContext: current } as never)).toMatch(
      /Failed to fetch/,
    );
    // The nudge every surface and the header derive from must stay silent: we
    // never read this person's thirteen memberships.
    expect(
      selectShouldPromptForOrganization({ appContext: current } as never),
    ).toBe(false);

    const gate = readHook(() => useOrganizationRequired());
    expect(gate.organizationState).toBe("unavailable");
    expect(gate.organizationRequired).toBe(false);
    expect(gate.canLoad).toBe(false);
    expect(gate.unavailableReason).toMatch(/Failed to fetch/);
  });

  it("a degraded resolve (the personal-org RPC failed) is unavailable too", async () => {
    // The exact seat shape: the RPC failed, the resolver fell through every
    // rung and answered with no selection although thirteen memberships exist.
    resolveActiveOrgContext.mockResolvedValue({
      organization_id: null,
      organization_name: null,
      personal_organization_id: null,
      unreadableReason: "the personal-organization read failed: Failed to fetch",
    });
    current = await boot();
    expect(readHook(() => useOrganizationRequired()).organizationState).toBe(
      "unavailable",
    );
  });

  it("the control stays in the checking posture — never 'Select an organization'", async () => {
    resolveActiveOrgContext.mockRejectedValue(new TypeError("Failed to fetch"));
    current = await boot();

    const control = readHook(() =>
      useOrganizationGatedControl("importing Google Tasks"),
    );
    expect(control.disabled).toBe(true);
    expect(control.title).toBe(ORGANIZATION_UNAVAILABLE_TITLE_CONTROL);
    expect(control.title).not.toMatch(/Select an organization/);
  });

  it("the shared notice says we could not check, and offers Retry", async () => {
    resolveActiveOrgContext.mockRejectedValue(new TypeError("Failed to fetch"));
    current = await boot();

    const notice = renderNotice({ state: "unavailable", what: "Imported tasks" });
    expect(notice.html).toContain("organization-unavailable-notice");
    expect(notice.html).not.toContain("organization-required-notice");
    expect(notice.text).toContain(ORGANIZATION_UNAVAILABLE_TITLE);
    expect(notice.text).toContain(ORGANIZATION_UNAVAILABLE_DESCRIPTION);
    expect(notice.text).not.toMatch(/Select an organization/);
    expect(notice.text).toMatch(/Try again/);

    notice.click("button");
    expect(retryActiveOrgBootstrap).toHaveBeenCalled();
  });

  it("a genuine empty answer is still the refusal — the fourth state is not a blanket", async () => {
    resolveActiveOrgContext.mockResolvedValue({
      organization_id: null,
      organization_name: null,
      personal_organization_id: "personal-1",
      unreadableReason: null,
    });
    current = await boot();
    expect(
      selectShouldPromptForOrganization({ appContext: current } as never),
    ).toBe(true);
    expect(readHook(() => useOrganizationRequired()).organizationState).toBe(
      "required",
    );
  });

  it("Retry re-runs the boot read and lands ready when the second call succeeds", async () => {
    resolveActiveOrgContext.mockRejectedValue(new TypeError("Failed to fetch"));
    current = await boot();
    expect(readHook(() => useOrganizationRequired()).organizationState).toBe(
      "unavailable",
    );

    // The button's retry dispatches the ONE bootstrap re-run…
    readHook(() => useOrganizationRequired()).retry();
    expect(retryActiveOrgBootstrap).toHaveBeenCalledTimes(1);
    expect(dispatched).toContainEqual({ type: "test/retry" });

    // …which asks again. This time the read answers.
    resolveActiveOrgContext.mockReset();
    resolveActiveOrgContext.mockResolvedValue({
      organization_id: "org-7",
      organization_name: "Titanium Success",
      personal_organization_id: "personal-1",
      unreadableReason: null,
    });
    current = await boot();

    expect(selectOrgBootstrapFailure({ appContext: current } as never)).toBeNull();
    const gate = readHook(() => useOrganizationRequired());
    expect(gate.organizationState).toBe("ready");
    expect(gate.organizationId).toBe("org-7");
    expect(gate.unavailableReason).toBeNull();
  });
});
