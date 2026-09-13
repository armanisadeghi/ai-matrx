/** @jest-environment jsdom */
//
// DD-183 — the per-rung override picker on the universal settings screen.
//
// WHAT THIS SUITE IS FOR. Before this component existed, a key whose registry
// row says `overridable_by = {organization, table}` could only ever be written
// at `organization` from this screen: the table rung resolved, the database
// honoured it on every write, and no human could reach it. These three cases
// are the three things a person actually does with an exception — see the ones
// that exist, add one, take one away — and each is asserted through the REAL
// component tree (the section, the one editor row, the one control renderer).
// Only the two doors are mocked, at the module boundary the browser proof
// exercises for real: `platform.knob_scope_rows` (the rows a person picks from)
// and `platform.knob_override_set` (the write).
//
// A LABEL, NEVER AN ID, is asserted explicitly: the whole point of the picker
// is that nobody types or reads a uuid, and a test that only counted rows
// would pass on a screen full of them.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { KnobRungOverrides } from "../KnobRungOverrides";
import { fetchScopeRows } from "../scopeRows";
import { useUniversalSettings, type RungOverridesState } from "../UniversalSettingsContext";
import { setKnobOverride } from "@/lib/scoped-config/service";
import type { KnobRungOverrideRow } from "@/lib/scoped-config/service";
import type { ScopedKnob } from "@/lib/scoped-config/types";

jest.mock("../scopeRows", () => ({
  ...jest.requireActual("../scopeRows"),
  fetchScopeRows: jest.fn(),
}));
jest.mock("@/lib/scoped-config/service", () => ({
  setKnobOverride: jest.fn(),
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: jest.fn(async () => true),
}));
jest.mock("../UniversalSettingsContext", () => ({
  ...jest.requireActual("../UniversalSettingsContext"),
  useUniversalSettings: jest.fn(),
}));

const scopeRows = jest.mocked(fetchScopeRows);
const writeOverride = jest.mocked(setKnobOverride);
const settings = jest.mocked(useUniversalSettings);

const ORG = "11111111-1111-4111-8111-111111111111";
const WINE = "22222222-2222-4222-8222-222222222222";
const NOTES = "33333333-3333-4333-8333-333333333333";

/**
 * A real-shaped `knob_index` row: a table-scoped `records.confirmation.*` key,
 * string-valued so the row renders its text control and its Save button (the
 * typed controls commit on change and are covered by their own renderer).
 */
const knob = {
  feature: "records",
  key: "confirmation.demo_policy",
  full_key: "records.confirmation.demo_policy",
  label: "Confirmation policy",
  description: "How this table treats unconfirmed records.",
  value_type: "string",
  unit: null,
  allowed_values: null,
  min_value: null,
  max_value: null,
  basis: null,
  set_by: "human",
  review_due: null,
  overridable_by: ["organization", "table"],
  override_direction: "any",
  bound_value: null,
  platform_locked: false,
  org_locked_kinds: [],
  user_override_locked: false,
  platform_default: "ask",
  shipped_default: "ask",
  org_override: null,
  user_override: null,
  effective_value: "ask",
  origin: "platform_default",
  origin_scope_id: null,
  origin_precedence: null,
  is_overridden: false,
  out_of_range: false,
  ui: {},
  taxonomy: null,
  propagation: null,
  scope_chain: [
    { kind: "organization", precedence: 10, scope_id: ORG, value: "ask", is_set: true, locked: false, is_effective: true },
    { kind: "table", precedence: 50, scope_id: null, value: null, is_set: false, locked: false, is_effective: false },
  ],
  locked: null,
  write_rung: { kind: "organization", scope_id: ORG },
  can_write: true,
  can_write_reason: null,
  secret: null,
} as unknown as ScopedKnob;

let root: Root;
let host: HTMLDivElement;
let rungOverrides: Record<string, RungOverridesState>;
const loadRungOverrides = jest.fn();
const reloadRungOverrides = jest.fn();

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom ships no ResizeObserver and `cmdk` (the search engine inside the ONE
// Command primitive) constructs one on mount. Local to this suite rather than
// in the shared setup file: this is the only suite that renders it today.
if (!Element.prototype.scrollIntoView) {
  // Same reason: `cmdk` scrolls its highlighted item into view, and jsdom has
  // no layout to scroll.
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

function mountPanel() {
  settings.mockImplementation(
    () =>
      ({
        organizationId: ORG,
        organizationName: "AI Matrx",
        canManageOrganization: true,
        rungOverrides,
        loadRungOverrides,
        reloadRungOverrides,
        refresh: jest.fn(),
      }) as unknown as ReturnType<typeof useUniversalSettings>,
  );
  act(() => root.render(<KnobRungOverrides knob={knob} />));
}

/** The disclosure is closed by default; a person opens it to see the exceptions. */
async function openExceptions() {
  const header = [...host.querySelectorAll("button")].find((button) =>
    /Exceptions by/.test(button.textContent ?? ""),
  );
  expect(header).toBeDefined();
  await act(async () => {
    header!.click();
  });
}

function textOf(): string {
  return `${host.textContent ?? ""}${document.body.textContent ?? ""}`;
}

beforeEach(() => {
  scopeRows.mockReset();
  writeOverride.mockReset();
  loadRungOverrides.mockReset();
  reloadRungOverrides.mockReset();
  rungOverrides = {};
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("names every existing exception by its row label, never by its id, and asks for the list once", async () => {
  rungOverrides = {
    [knob.full_key]: {
      status: "ready",
      rows: [
        { scope_kind: "table", scope_id: WINE, value: "never", updated_at: null, updated_by: null, set_note: null },
      ] as KnobRungOverrideRow[],
    },
  };
  scopeRows.mockResolvedValue([
    { id: WINE, label: "wine_tasting" },
    { id: NOTES, label: "tasting_notes" },
  ]);

  mountPanel();
  await openExceptions();
  await act(async () => {});

  expect(loadRungOverrides).toHaveBeenCalledWith(knob);
  expect(textOf()).toContain("wine_tasting");
  expect(textOf()).not.toContain(WINE);
  // The row is the ONE editor row at the picked scope, so it carries that
  // scope's own standing value rather than the organization's.
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="Confirmation policy for wine_tasting"]`);
  expect(input?.value).toBe("never");
});

it("saves a picked row's value through knob_override_set at that rung", async () => {
  rungOverrides = { [knob.full_key]: { status: "ready", rows: [] } };
  scopeRows.mockResolvedValue([{ id: WINE, label: "wine_tasting" }]);
  writeOverride.mockResolvedValue({
    ok: true,
    feature: knob.feature,
    key: knob.key,
    scope_kind: "table",
    scope_id: WINE,
    effective_value: "never",
    origin: "scope_override",
  });

  mountPanel();
  await openExceptions();

  // Open the picker and choose a row by its name.
  const add = [...host.querySelectorAll("button"), ...document.body.querySelectorAll("button")].find((button) =>
    /Add override for a table/.test(button.textContent ?? ""),
  );
  expect(add).toBeDefined();
  await act(async () => {
    add!.click();
  });
  await act(async () => {});
  const option = [...document.body.querySelectorAll('[cmdk-item=""]')].find((item) =>
    /wine_tasting/.test(item.textContent ?? ""),
  );
  expect(option).toBeDefined();
  await act(async () => {
    (option as HTMLElement).click();
  });

  // A picked row is not an override until it is valued, and it says so.
  expect(textOf()).toContain("Not saved yet");

  const input = host.querySelector<HTMLInputElement>(`input[aria-label="Confirmation policy for wine_tasting"]`);
  expect(input).not.toBeNull();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, "never");
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const save = [...host.querySelectorAll("button")].find((button) => button.textContent === "Save");
  expect(save).toBeDefined();
  await act(async () => {
    save!.click();
  });

  expect(writeOverride).toHaveBeenCalledWith(
    expect.objectContaining({
      feature: "records",
      key: "confirmation.demo_policy",
      scopeKind: "table",
      scopeId: WINE,
      organizationId: ORG,
      value: "never",
    }),
  );
  expect(reloadRungOverrides).toHaveBeenCalledWith(knob);
});

it("removes an exception through the same door with a null value, which deletes the row", async () => {
  rungOverrides = {
    [knob.full_key]: {
      status: "ready",
      rows: [
        { scope_kind: "table", scope_id: WINE, value: "never", updated_at: null, updated_by: null, set_note: null },
      ] as KnobRungOverrideRow[],
    },
  };
  scopeRows.mockResolvedValue([{ id: WINE, label: "wine_tasting" }]);
  writeOverride.mockResolvedValue({
    ok: true,
    feature: knob.feature,
    key: knob.key,
    scope_kind: "table",
    scope_id: WINE,
    effective_value: "ask",
    origin: "organization",
    key_removed: true,
  });

  mountPanel();
  await openExceptions();
  await act(async () => {});

  const options = [...host.querySelectorAll("button")].find(
    (button) => button.getAttribute("aria-label") === "Options for wine_tasting",
  );
  expect(options).toBeDefined();
  await act(async () => {
    options!.click();
  });
  await act(async () => {});
  const inherit = [...document.body.querySelectorAll("button")].find((button) =>
    /Inherit this value/.test(button.textContent ?? ""),
  );
  expect(inherit).toBeDefined();
  await act(async () => {
    inherit!.click();
  });
  await act(async () => {});

  expect(writeOverride).toHaveBeenCalledWith(
    expect.objectContaining({ scopeKind: "table", scopeId: WINE, value: null }),
  );
});

it("says why there is nothing to pick instead of standing empty", async () => {
  rungOverrides = { [knob.full_key]: { status: "ready", rows: [] } };
  scopeRows.mockResolvedValue([]);

  mountPanel();
  await openExceptions();
  const add = [...host.querySelectorAll("button")].find((button) =>
    /Add override for a table/.test(button.textContent ?? ""),
  );
  await act(async () => {
    add!.click();
  });
  await act(async () => {});

  expect(textOf()).toContain("No table is registered for AI Matrx yet");
});

it("renders the door's own refusal sentence when the rows cannot be read", async () => {
  rungOverrides = { [knob.full_key]: { status: "ready", rows: [] } };
  scopeRows.mockRejectedValue(new Error("You are not a member of that organization."));

  mountPanel();
  await openExceptions();
  const add = [...host.querySelectorAll("button")].find((button) =>
    /Add override for a table/.test(button.textContent ?? ""),
  );
  await act(async () => {
    add!.click();
  });
  await act(async () => {});

  expect(textOf()).toContain("You are not a member of that organization.");
});
