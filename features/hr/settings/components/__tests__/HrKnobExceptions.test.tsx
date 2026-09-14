/** @jest-environment jsdom */
//
// DD-203 — HR exceptions are set where HR settings live, with the ONE picker.
//
// WHAT THIS SUITE IS FOR. `platform.feature_knob` offers 194 `hr.*` keys at
// `employer_profile`, `pay_group` and `location`. No screen in the product
// offered any of them: the organization configuration page excludes every
// `hr.*` key by its own first line, and `/hr/settings` rendered a dashed box
// pointing at pages that do not set a scope override. These cases pin the two
// halves of the fix, and they are deliberately the two halves that can rot in
// opposite directions:
//
//   1. the bridge mounts THE picker (not a second one) for an HR key whose
//      readers name the rungs, and the rungs are named by the words a person
//      reads — never a uuid;
//   2. an HR key whose only reader is the `hr._knob` dispatcher gets NO picker
//      at all, because a dispatcher takes no person and can name no rung, so an
//      exception there would be saved, listed back, and answer nothing.
//
// Only the two doors are mocked, at the same boundary the browser proof
// exercises for real.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HrKnobExceptions } from "../HrKnobExceptions";
import { fetchScopeRows } from "@/features/settings/universal/scopeRows";
import { useUniversalSettings } from "@/features/settings/universal/UniversalSettingsContext";
import { KNOB_RUNG_CONSUMERS } from "@/features/settings/universal/knobDatabaseConsumers.generated";
import type { ScopedKnob } from "@/lib/scoped-config/types";

jest.mock("@/features/settings/universal/scopeRows", () => ({
  ...jest.requireActual("@/features/settings/universal/scopeRows"),
  fetchScopeRows: jest.fn(),
}));
jest.mock("@/lib/scoped-config/service", () => ({ setKnobOverride: jest.fn() }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({ confirm: jest.fn(async () => true) }));
jest.mock("@/features/settings/universal/UniversalSettingsContext", () => ({
  ...jest.requireActual("@/features/settings/universal/UniversalSettingsContext"),
  useUniversalSettings: jest.fn(),
}));

const scopeRows = jest.mocked(fetchScopeRows);
const settings = jest.mocked(useUniversalSettings);

const ORG = "11111111-1111-4111-8111-111111111111";
const PAY_GROUP = "44444444-4444-4444-8444-444444444444";

/** THE key DD-203's migration made real: its reader names all three rungs. */
const ANSWERABLE = "hr.employees.adjusted_service_date_rule";
/** A key whose only reader is the `hr._knob` dispatcher, which can name nothing. */
const DISPATCHED = "hr.approvals.escalation_hours";

function hrKnob(fullKey: string): ScopedKnob {
  const [feature, key] = [fullKey.slice(0, fullKey.lastIndexOf(".")), fullKey.slice(fullKey.lastIndexOf(".") + 1)];
  return {
    feature, key, full_key: fullKey,
    label: "An HR setting", description: null,
    value_type: "string", unit: null, allowed_values: null, min_value: null, max_value: null,
    basis: null, set_by: "human", review_due: null,
    overridable_by: ["organization", "employer_profile", "pay_group", "location"],
    override_direction: "any", bound_value: null,
    platform_locked: false, org_locked_kinds: [], user_override_locked: false,
    platform_default: "never_carry", shipped_default: "never_carry",
    org_override: null, user_override: null,
    effective_value: "never_carry", origin: "platform_default",
    origin_scope_id: null, origin_precedence: null,
    is_overridden: false, out_of_range: false, ui: {}, taxonomy: null, propagation: null,
    scope_chain: [
      { kind: "organization", precedence: 10, scope_id: ORG, value: "never_carry", is_set: true, locked: false, is_effective: true },
      { kind: "employer_profile", precedence: 20, scope_id: null, value: null, is_set: false, locked: false, is_effective: false },
      { kind: "pay_group", precedence: 30, scope_id: null, value: null, is_set: false, locked: false, is_effective: false },
      { kind: "location", precedence: 40, scope_id: null, value: null, is_set: false, locked: false, is_effective: false },
    ],
    locked: null, write_rung: { kind: "organization", scope_id: ORG },
    can_write: true, can_write_reason: null, secret: null,
  } as unknown as ScopedKnob;
}

let root: Root;
let host: HTMLDivElement;
const loadRungOverrides = jest.fn();

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {};
if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };
}

function mount(fullKey: string, knobs: Record<string, ScopedKnob>) {
  settings.mockImplementation(
    () =>
      ({
        organizationId: ORG,
        organizationName: "All Green Electronics Recycling",
        canManageOrganization: true,
        knobByKey: (key: string) => knobs[key] ?? null,
        rungOverrides: {
          [fullKey]: {
            status: "ready",
            rows: [
              { scope_kind: "pay_group", scope_id: PAY_GROUP, value: "always_carry", updated_at: null, updated_by: null, set_note: null },
            ],
          },
        },
        loadRungOverrides,
        reloadRungOverrides: jest.fn(),
        refresh: jest.fn(),
      }) as unknown as ReturnType<typeof useUniversalSettings>,
  );
  act(() => root.render(<HrKnobExceptions fullKey={fullKey} />));
}

function textOf(): string {
  return `${host.textContent ?? ""}${document.body.textContent ?? ""}`;
}

beforeEach(() => {
  scopeRows.mockReset();
  scopeRows.mockResolvedValue([{ id: PAY_GROUP, label: "Hourly Biweekly" }]);
  loadRungOverrides.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("mounts THE picker on an HR key whose readers name the rungs, headed by the three HR rungs", async () => {
  // The census is the authority; if this stops being true the guard fails first.
  expect(KNOB_RUNG_CONSUMERS[ANSWERABLE]).toEqual(
    expect.arrayContaining(["employer_profile", "pay_group", "location"]),
  );
  mount(ANSWERABLE, { [ANSWERABLE]: hrKnob(ANSWERABLE) });
  await act(async () => {});

  const text = textOf();
  expect(text).toContain("Exceptions by employer profiles, pay groups, locations");
  // Grammar is part of honesty on a screen a person reads: until HR mounted
  // this panel every rung began with a consonant, so the hard-coded article was
  // invisibly wrong and read "a employer profile" on the first HR key.
  expect(text).toContain("Add override for an employer profile");
  expect(text).toContain("Add override for a pay group");
  expect(loadRungOverrides).toHaveBeenCalled();
});

it("says what a person may add in the SINGULAR, for every rung the panel carries", async () => {
  // `heading.replace(/s$/, "")` un-pluralised only the last word of a joined
  // heading: with three rungs it read "employer profiles, pay groups, location".
  settings.mockImplementation(
    () =>
      ({
        organizationId: ORG,
        organizationName: "All Green Electronics Recycling",
        canManageOrganization: true,
        knobByKey: () => hrKnob(ANSWERABLE),
        rungOverrides: { [ANSWERABLE]: { status: "ready", rows: [] } },
        loadRungOverrides,
        reloadRungOverrides: jest.fn(),
        refresh: jest.fn(),
      }) as unknown as ReturnType<typeof useUniversalSettings>,
  );
  act(() => root.render(<HrKnobExceptions fullKey={ANSWERABLE} />));
  await act(async () => {});
  const header = [...host.querySelectorAll("button")].find((b) => /Exceptions by/.test(b.textContent ?? ""));
  await act(async () => { header!.click(); });
  await act(async () => {});

  expect(textOf()).toContain(
    "Add one for a specific employer profile, pay group or location when it needs to differ.",
  );
  expect(textOf()).not.toContain("pay groups, location ");
});

it("names a standing HR exception by its row label, never by its id", async () => {
  mount(ANSWERABLE, { [ANSWERABLE]: hrKnob(ANSWERABLE) });
  await act(async () => {});
  const header = [...host.querySelectorAll("button")].find((b) => /Exceptions by/.test(b.textContent ?? ""));
  await act(async () => { header!.click(); });
  await act(async () => {});

  expect(textOf()).toContain("Hourly Biweekly");
  expect(textOf()).not.toContain(PAY_GROUP);
});

it("offers NO picker for an HR key whose only reader is the hr._knob dispatcher", async () => {
  // A dispatcher takes a feature and a key and nothing else — no person, no
  // employment, no location — so it can name no rung. An exception here would
  // be saved, listed back, and change nothing (the DD-211 defect at scale).
  expect(KNOB_RUNG_CONSUMERS[DISPATCHED]).toBeUndefined();
  mount(DISPATCHED, { [DISPATCHED]: hrKnob(DISPATCHED) });
  await act(async () => {});

  expect(textOf()).not.toContain("Exceptions by");
  expect(host.querySelectorAll("button")).toHaveLength(0);
});

it("renders nothing at all when the registry read did not carry the key — never a guess", async () => {
  mount(ANSWERABLE, {});
  await act(async () => {});
  expect(host.textContent).toBe("");
});
