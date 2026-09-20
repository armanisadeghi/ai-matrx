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
 *
 * 🚨 WHAT ONE CASE HERE USED TO ASSERT, AND WHY IT IS NOW THE FAILURE MODE
 * (Arman, 2026-09-19). "the press runs the ACT once the read answers, and never
 * on a guess" ended by proving the `required` state was a WALL: `disabled ===
 * true`, and a press that did nothing at all. That was the honest reading of
 * the old law — a control with no organization had nothing to do. It is now the
 * defect, because a dead control is what makes "no organization selected" a
 * dead end, and a dead end is what pushed every boot ladder in this codebase to
 * GUESS an organization rather than end without one:
 *
 *   "one missed org check that should have just failed turns into 50 in a
 *    month and 5,000 in a year, and suddenly we don't have orgs any more, we
 *    have a user and a default org, which means we just have user now."
 *
 * The ruling makes the refusal a QUESTION: `required` stays LIVE, the press
 * opens the ONE picker (`ensureOrganizationContext`), and the act it was
 * wrapping runs with the organization the PERSON sets — never with a guess and
 * never with nothing. Cancelling is an answer meaning "not now", so it is
 * swallowed: no toast, no error, nothing moved. The case below asserts all
 * three, and keeps the half that never changed: the act never runs on a value
 * nobody chose, and the `unavailable` press is still the READ, never the act.
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

// THE PICKER THE REFUSAL NOW OPENS (2026-09-19). Only `ensureOrganizationContext`
// is stood in — `OrganizationSelectionCancelled` stays the REAL class, so the
// swallow below is proved against the error the real gate actually throws and
// not against a look-alike.
const ensureOrganizationContext =
  jest.fn<Promise<string>, [unknown?]>();
jest.mock("@/lib/organization/organization-gate", () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ...(jest.requireActual("@/lib/organization/organization-gate") as object),
  ensureOrganizationContext: (options?: unknown) =>
    ensureOrganizationContext(options),
}));

const retryActiveOrgBootstrap = jest.fn(() => ({ type: "test/retry" }));
jest.mock("@/lib/redux/thunks/activeOrgBootstrap", () => ({
  retryActiveOrgBootstrap: () => retryActiveOrgBootstrap(),
}));

const dispatched: unknown[] = [];
let current: Record<string, unknown>;

// 🚨 DELIBERATELY ONLY `useAppSelector` — the gate must not need a second hook.
// Every surface test in the repo stands this module in with the members the
// gate needed when it was written; a gate that grows a `useAppDispatch`
// dependency kills all of them (it killed seven suites on 2026-09-18). The
// retry dispatches through the store singleton, a pure leaf, instead.
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({ appContext: current }),
}));

jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({
    dispatch: (action: unknown) => {
      dispatched.push(action);
      return action;
    },
    getState: () => ({ appContext: current }),
  }),
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
const { OrganizationSelectionCancelled } =
  require("@/lib/organization/organization-gate") as typeof import("@/lib/organization/organization-gate");
/* eslint-enable @typescript-eslint/no-require-imports */

/** Let the gate's promise chain (`.then(act)` / `.catch(...)`) settle. */
const settleGate = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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
  ensureOrganizationContext.mockReset();
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

  it("the control never spells the refusal — and its own press IS the remedy", async () => {
    resolveActiveOrgContext.mockRejectedValue(new TypeError("Failed to fetch"));
    current = await boot();

    const control = readHook(() =>
      useOrganizationGatedControl("importing Google Tasks"),
    );
    expect(control.title).toBe(ORGANIZATION_UNAVAILABLE_TITLE_CONTROL);
    expect(control.title).not.toMatch(/Select an organization/);
    // V-24 NEW-3: the sentence used to end "Try again." on a control that could
    // not be pressed, with no organization Try again anywhere on the page. It
    // now names THIS button.
    expect(control.title).toMatch(/Press to try again/);
    expect(control.disabled).toBe(false);

    // And the press re-runs the READ, never the act.
    const act = jest.fn();
    retryActiveOrgBootstrap.mockClear();
    readHook(() => useOrganizationGatedControl("importing Google Tasks")).press(act)();
    expect(act).not.toHaveBeenCalled();
    expect(retryActiveOrgBootstrap).toHaveBeenCalledTimes(1);
  });

  it("the press runs the ACT once the read answers, and never on a guess", async () => {
    resolveActiveOrgContext.mockResolvedValue({
      organization_id: "org-7",
      organization_name: "Titanium Success",
      personal_organization_id: "personal-1",
      unreadableReason: null,
    });
    current = await boot();

    const theAct = jest.fn();
    retryActiveOrgBootstrap.mockClear();
    const ready = readHook(() =>
      useOrganizationGatedControl("importing Google Tasks"),
    );
    expect(ready.disabled).toBe(false);
    ready.press(theAct)();
    expect(theAct).toHaveBeenCalledWith("org-7");
    expect(retryActiveOrgBootstrap).not.toHaveBeenCalled();
    // A ready control never asks: the person already answered this question.
    expect(ensureOrganizationContext).not.toHaveBeenCalled();

    // 🚨 Settled with nothing: the press is the QUESTION (2026-09-19). This
    // half asserted `disabled === true` and a press that did nothing until
    // today. The control stays LIVE, the picker opens, and the act runs with
    // the organization the PERSON set — "personal-1" is right there in the
    // resolved context and is still never what the act receives.
    resolveActiveOrgContext.mockResolvedValue({
      organization_id: null,
      organization_name: null,
      personal_organization_id: "personal-1",
      unreadableReason: null,
    });
    current = await boot();
    const refused = readHook(() =>
      useOrganizationGatedControl("importing Google Tasks"),
    );
    expect(refused.organizationState).toBe("required");
    expect(refused.disabled).toBe(false);

    theAct.mockClear();
    ensureOrganizationContext.mockResolvedValue("org-the-person-chose");
    refused.press(theAct)();
    // Never before the person has answered — the act is HELD, not fired at a
    // guess while the picker is still open.
    expect(theAct).not.toHaveBeenCalled();
    await settleGate();
    expect(ensureOrganizationContext).toHaveBeenCalledTimes(1);
    expect(theAct).toHaveBeenCalledTimes(1);
    expect(theAct).toHaveBeenCalledWith("org-the-person-chose");
    expect(theAct).not.toHaveBeenCalledWith("personal-1");
    // And the refusal's press is the picker, never the read's Try again.
    expect(retryActiveOrgBootstrap).not.toHaveBeenCalled();
  });

  it("CANCELLING the picker does nothing at all — no act, no error, nothing moved", async () => {
    // "Not now" is an answer. `OrganizationSelectionCancelled` is swallowed
    // where the press lives, so the person lands exactly where they were.
    resolveActiveOrgContext.mockResolvedValue({
      organization_id: null,
      organization_name: null,
      personal_organization_id: "personal-1",
      unreadableReason: null,
    });
    current = await boot();

    const theAct = jest.fn();
    const errored = jest.spyOn(console, "error").mockImplementation(() => {});
    ensureOrganizationContext.mockRejectedValue(new OrganizationSelectionCancelled());

    const control = readHook(() =>
      useOrganizationGatedControl("importing Google Tasks"),
    );
    control.press(theAct)();
    await settleGate();

    expect(ensureOrganizationContext).toHaveBeenCalledTimes(1);
    expect(theAct).not.toHaveBeenCalled();
    expect(errored).not.toHaveBeenCalled();
    errored.mockRestore();
  });

  it("a picker that cannot open FAILS LOUDLY — the press never dies silently", async () => {
    // The fail-closed path: no picker mounted at all, so the gate re-throws the
    // original `OrganizationContextError`. That is not "not now", so it is
    // reported rather than swallowed (law 4 — nothing fails silently).
    resolveActiveOrgContext.mockResolvedValue({
      organization_id: null,
      organization_name: null,
      personal_organization_id: "personal-1",
      unreadableReason: null,
    });
    current = await boot();

    const theAct = jest.fn();
    const errored = jest.spyOn(console, "error").mockImplementation(() => {});
    ensureOrganizationContext.mockRejectedValue(new Error("no picker is mounted"));

    readHook(() => useOrganizationGatedControl("importing Google Tasks")).press(
      theAct,
    )();
    await settleGate();

    expect(theAct).not.toHaveBeenCalled();
    expect(errored).toHaveBeenCalled();
    errored.mockRestore();
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
