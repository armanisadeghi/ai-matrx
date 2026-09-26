/** @jest-environment jsdom */
//
// EVERY settings row carries History, and "Revert to this" writes through the
// row's OWN door (settings history, 2026-09-26). Renders the REAL KnobOverrideRow;
// mocks only the RPC module boundaries (`../service`, `../history`).

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { KnobOverrideRow } from "../KnobOverrideRow";
import { setKnobOverride } from "../service";
import { fetchKnobHistory } from "../history";
import { setFeatureKnob } from "@/features/admin/limits/service";
import type { ScopedKnob } from "../types";

jest.mock("../service", () => ({
  setKnobOverride: jest.fn(),
  setKnobRungLock: jest.fn(),
  writeKnobOverrideThroughDoor: jest.fn(),
}));
jest.mock("../history", () => ({
  ...jest.requireActual("../history"),
  fetchKnobHistory: jest.fn(),
}));
jest.mock("@/features/admin/limits/service", () => ({ setFeatureKnob: jest.fn() }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({ confirm: jest.fn(async () => true) }));

const ORG = "11111111-1111-4111-8111-111111111111";
const overrideDoor = jest.mocked(setKnobOverride);
const platformDoor = jest.mocked(setFeatureKnob);
const history = jest.mocked(fetchKnobHistory);

const knob = {
  feature: "orchestration.loop_guard",
  key: "failure_threshold",
  full_key: "orchestration.loop_guard.failure_threshold",
  label: "Failure threshold",
  description: "Failures before the loop guard stops a run.",
  value_type: "integer",
  unit: null,
  allowed_values: null,
  min_value: 1,
  max_value: 200,
  basis: null,
  set_by: "human",
  review_due: null,
  overridable_by: ["organization"],
  override_direction: "any",
  bound_value: null,
  platform_locked: false,
  org_locked_kinds: [],
  user_override_locked: false,
  platform_default: 8,
  shipped_default: 8,
  org_override: 12,
  user_override: null,
  effective_value: 12,
  origin: "organization",
  origin_scope_id: ORG,
  origin_precedence: 10,
  is_overridden: true,
  out_of_range: false,
  ui: {},
  taxonomy: null,
  propagation: "next_load",
  scope_chain: [],
  locked: null,
  write_rung: { kind: "organization", scope_id: ORG },
  can_write: true,
  can_write_reason: null,
  secret: null,
} as unknown as ScopedKnob;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  overrideDoor.mockReset().mockResolvedValue({ ok: true } as never);
  platformDoor.mockReset().mockResolvedValue({ ok: true } as never);
  history.mockReset().mockResolvedValue([
    { id: 3, at: "2026-09-26T08:00:00Z", action: "update", scope_kind: "organization", scope_id: ORG, organization_id: ORG, old_value: 10, new_value: 12, set_note: null, door: "ui", actor_id: "u", actor_name: "Admin", is_this_rung: true },
    { id: 2, at: "2026-09-25T08:00:00Z", action: "set", scope_kind: "organization", scope_id: ORG, organization_id: ORG, old_value: null, new_value: 10, set_note: null, door: "api", actor_id: "u", actor_name: "Admin", is_this_rung: true },
    { id: 1, at: "2026-09-24T08:00:00Z", action: "update", scope_kind: "platform", scope_id: null, organization_id: null, old_value: 6, new_value: 8, set_note: null, door: "migration", actor_id: null, actor_name: "AI Matrx", is_this_rung: false },
  ]);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const button = (pattern: RegExp) =>
  [...document.body.querySelectorAll("button")].filter((b) =>
    pattern.test(b.getAttribute("aria-label") ?? b.textContent ?? ""),
  ) as HTMLButtonElement[];

function mount(system?: { canWrite: boolean; registeredDefault: unknown }) {
  act(() =>
    root.render(
      <KnobOverrideRow
        knob={knob}
        scopeKind="organization"
        scopeId={ORG}
        organizationId={ORG}
        blastRadius="Applies to every run in AI Matrx"
        system={system}
        onChanged={jest.fn()}
      />,
    ),
  );
}

test("History lists the changes with who and which door, and reverts through the row's own door", async () => {
  mount();
  const [trigger] = button(/^History of /);
  expect(trigger).toBeDefined();
  await act(async () => trigger!.click());
  expect(history).toHaveBeenCalledWith(expect.objectContaining({
    feature: "orchestration.loop_guard", key: "failure_threshold", organizationId: ORG, scopeKind: "organization", scopeId: ORG,
  }));
  const text = document.body.textContent ?? "";
  expect(text).toContain("10 → 12");
  expect(text).toContain("in the app");
  expect(text).toContain("Platform value: 6 → 8");
  // The newest entry at this rung offers Undo, the older one Revert; the platform entry neither.
  const reverts = button(/Revert to this/);
  expect(reverts).toHaveLength(1);
  expect(button(/^Undo$/)).toHaveLength(1);
  await act(async () => reverts[0]!.click());
  expect(overrideDoor).toHaveBeenLastCalledWith(expect.objectContaining({
    feature: "orchestration.loop_guard", key: "failure_threshold", scopeKind: "organization", scopeId: ORG, organizationId: ORG, value: 10,
  }));
  // Undo of the newest change restores what was there before it (10), through the same door.
  overrideDoor.mockClear();
  await act(async () => button(/^Undo$/)[0]!.click());
  expect(overrideDoor).toHaveBeenLastCalledWith(expect.objectContaining({ value: 10 }));
});

test("the system register's History reads the platform rung and reverts through feature_knob_set", async () => {
  history.mockResolvedValueOnce([
    { id: 1, at: "2026-09-24T08:00:00Z", action: "update", scope_kind: "platform", scope_id: null, organization_id: null, old_value: 6, new_value: 8, set_note: null, door: "ui", actor_id: null, actor_name: "Admin", is_this_rung: true },
  ]);
  mount({ canWrite: true, registeredDefault: 8 });
  await act(async () => button(/^History of /)[0]!.click());
  expect(history).toHaveBeenCalledWith(expect.objectContaining({ organizationId: null, scopeKind: null }));
  await act(async () => button(/^Undo$/)[0]!.click());
  expect(platformDoor).toHaveBeenCalledWith("orchestration.loop_guard", "failure_threshold", 6);
});

test("the row states what a change affects before it is saved", () => {
  mount();
  const text = document.body.textContent ?? "";
  expect(text).toContain("Applies to every run in AI Matrx. Replaces the value set here, which is 12 today.");
});
