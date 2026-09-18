/** @jest-environment jsdom */
//
// The organization's "personal overrides" switch on a settings row (scfg_50).
//
// WHY THIS SUITE EXISTS. Arman ruled on 2026-08-29 that "on an individual option
// basis, the org can choose to disable user-level overrides even if our system
// allows it." On 2026-09-12 aidream 0640 made that lock inert for every key
// that allows the user rung, and f489f35f3e mirrored it here by deleting the
// switch. aidream 0702 reverted the exemption on the server; this suite pins
// the switch that lets an org owner reach it. It renders the REAL row and
// mocks only the RPC module boundary (`platform.knob_rung_lock_set`).

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { KnobOverrideRow } from "../KnobOverrideRow";
import { setKnobRungLock } from "../service";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import type { ScopedKnob } from "../types";

jest.mock("../service", () => ({
  setKnobOverride: jest.fn(),
  setKnobRungLock: jest.fn(),
  writeKnobOverrideThroughDoor: jest.fn(),
}));
jest.mock("@/features/admin/limits/service", () => ({
  setFeatureKnob: jest.fn(),
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: jest.fn(async () => true),
}));

const lockDoor = jest.mocked(setKnobRungLock);
const askToConfirm = jest.mocked(confirm);

const ORG = "11111111-1111-4111-8111-111111111111";

function knobWith(overrides: Partial<ScopedKnob>): ScopedKnob {
  return {
    feature: "tables.pagination",
    key: "mode",
    full_key: "tables.pagination.mode",
    label: "Pagination mode",
    description: "How long tables page.",
    value_type: "string",
    unit: null,
    allowed_values: null,
    min_value: null,
    max_value: null,
    basis: null,
    set_by: "human",
    review_due: null,
    overridable_by: ["organization", "table", "user"],
    override_direction: "any",
    bound_value: null,
    platform_locked: false,
    // A sub-org lock this organization already holds — flipping the user
    // rung must never wipe it.
    org_locked_kinds: ["table"],
    user_override_locked: false,
    platform_default: "pages",
    shipped_default: "pages",
    org_override: null,
    user_override: null,
    effective_value: "pages",
    origin: "platform_default",
    origin_scope_id: null,
    origin_precedence: null,
    is_overridden: false,
    out_of_range: false,
    ui: {},
    taxonomy: null,
    propagation: null,
    scope_chain: [],
    locked: null,
    write_rung: { kind: "organization", scope_id: ORG },
    can_write: true,
    can_write_reason: null,
    secret: null,
    ...overrides,
  } as unknown as ScopedKnob;
}

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
const onChanged = jest.fn();

function mount(knob: ScopedKnob, showUserLockControl: boolean) {
  act(() =>
    root.render(
      <KnobOverrideRow
        knob={knob}
        scopeKind="organization"
        scopeId={ORG}
        organizationId={ORG}
        blastRadius="Applies to everyone in AI Matrx."
        showUserLockControl={showUserLockControl}
        onChanged={onChanged}
      />,
    ),
  );
}

function buttonNamed(pattern: RegExp): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll("button")].find((button) =>
    pattern.test(button.textContent ?? button.getAttribute("aria-label") ?? ""),
  ) as HTMLButtonElement | undefined;
}

async function openOptions() {
  const trigger = [...document.body.querySelectorAll("button")].find((button) =>
    /^Options for /.test(button.getAttribute("aria-label") ?? ""),
  );
  expect(trigger).toBeDefined();
  await act(async () => {
    trigger!.click();
  });
}

beforeEach(() => {
  lockDoor.mockReset();
  lockDoor.mockResolvedValue({
    ok: true,
    feature: "tables.pagination",
    key: "mode",
    organization_id: ORG,
    locked_kinds: ["table", "user"],
  });
  askToConfirm.mockReset();
  askToConfirm.mockResolvedValue(true);
  onChanged.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

test("an org owner turns off personal overrides, keeping the org's other rung locks", async () => {
  mount(knobWith({}), true);
  await openOptions();
  const turnOff = buttonNamed(/Turn off personal overrides/);
  expect(turnOff).toBeDefined();
  await act(async () => {
    turnOff!.click();
  });
  expect(askToConfirm).toHaveBeenCalledTimes(1);
  expect(lockDoor).toHaveBeenCalledWith({
    feature: "tables.pagination",
    key: "mode",
    organizationId: ORG,
    lockedKinds: ["table", "user"],
  });
  expect(onChanged).toHaveBeenCalled();
});

test("a locked user rung offers Allow, which clears only the user rung", async () => {
  mount(knobWith({ org_locked_kinds: ["table", "user"], user_override_locked: true }), true);
  await openOptions();
  const allow = buttonNamed(/Allow personal overrides/);
  expect(allow).toBeDefined();
  await act(async () => {
    allow!.click();
  });
  expect(askToConfirm).not.toHaveBeenCalled();
  expect(lockDoor).toHaveBeenCalledWith(
    expect.objectContaining({ lockedKinds: ["table"] }),
  );
});

test("no switch without the caller's permission, or on a key the platform keeps off the user rung", async () => {
  mount(knobWith({}), false);
  await openOptions();
  expect(buttonNamed(/personal overrides/)).toBeUndefined();

  mount(knobWith({ overridable_by: ["organization", "table"] }), true);
  expect(buttonNamed(/personal overrides/)).toBeUndefined();
});
