/** @jest-environment jsdom */
//
// 🚨 A SETTINGS ROW NEVER STATES A VALUE THAT IS NOT THE ONE RUNNING.
//
// THE DEFECT THIS PINS (users.user_feedback 7dc1e5ae-497c-4aa1-95f1-794dbc510d8d,
// measured on production 2026-09-21 as admin@admin.com in "Hands & Hope
// Alliance"):
//
//   1. An org admin set `personal_staff.escalation_mode` ("When your staff is
//      unsure") to "Never" in the organization configuration pane. It saved —
//      platform.knob_override gained an organization row holding "off" — and
//      the control read "Never" back.
//   2. The value actually in force for that same admin was still "auto",
//      because a USER-rung override written earlier that day outranks the
//      organization's. That is correct ladder behaviour.
//   3. The pane said NOTHING. No notice, no "your own setting overrides this",
//      nothing. An administrator reading that screen would believe escalation
//      was off for the organization while it was on for the very person
//      reading it.
//
// This is not one row. EVERY key whose `overridable_by` names both a rung a
// screen edits and a rung above it has the same shape, and the organization
// destination cannot see the masking at all because its own `knob_index` read
// deliberately withholds the personal rung. So the fix is the resolver's
// answer FOR THE VIEWER, read separately and passed to the one editor row.
//
// What this suite refuses to let regress, in the row itself:
//   · a masked row names the rung that wins, in plain English;
//   · it prints the value that is really running, in the registry's WORDS
//     ("Go ahead (recommended)"), never its stored token ("auto");
//   · it offers the door to the rung that wins;
//   · a row nothing masks stays quiet on the row but still carries the answer
//     in its options panel;
//   · a viewer read that FAILED says so — silence would read as "nothing
//     masks this", which is the original lie arriving through the back door.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { KnobOverrideRow } from "../KnobOverrideRow";
import { resolveKnobLadder, resolveViewerStanding } from "../ladder";
import type { ScopedKnob } from "../types";

jest.mock("../service", () => ({
  setKnobOverride: jest.fn(),
  setKnobRungLock: jest.fn(),
  writeKnobOverrideThroughDoor: jest.fn(),
}));
jest.mock("@/features/admin/limits/service", () => ({ setFeatureKnob: jest.fn() }));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: jest.fn(async () => true),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const ORG = "0907939e-2b75-43e8-bfee-da758e5ea75b";
const USER = "22222222-2222-4222-8222-222222222222";

/**
 * The registry row EXACTLY as `platform.feature_knob` holds it (read live
 * 2026-09-21), and the scope chain `platform.knob_index` returns for the
 * organization destination: the organization rung set to "off", the user rung
 * present in the chain but unaddressed by that read.
 */
function escalationMode(overrides: Partial<ScopedKnob> = {}): ScopedKnob {
  return {
    feature: "personal_staff",
    key: "escalation_mode",
    full_key: "personal_staff.escalation_mode",
    label: "When your staff is unsure",
    description: "",
    value_type: "enum",
    unit: null,
    allowed_values: ["auto", "ask", "off"],
    min_value: null,
    max_value: null,
    basis: null,
    set_by: "human",
    review_due: null,
    overridable_by: ["organization", "user"],
    override_direction: "any",
    bound_value: null,
    platform_locked: false,
    org_locked_kinds: [],
    user_override_locked: false,
    platform_default: "auto",
    shipped_default: "auto",
    org_override: "off",
    user_override: null,
    effective_value: "off",
    origin: "organization",
    origin_scope_id: ORG,
    origin_precedence: 10,
    is_overridden: true,
    out_of_range: false,
    ui: {
      help: "Turning this off does not make your staff guess.",
      group: "Personal Staff",
      order: 20,
      control: "select",
      options: [
        { label: "Go ahead (recommended)", value: "auto" },
        { label: "Ask me first", value: "ask" },
        { label: "Never", value: "off" },
      ],
    },
    taxonomy: {
      node_id: "18ce0556-26fc-4083-9c03-c86123b93649",
      node_level: "feature",
      node_slug: "personal-staff",
      node_name: "Personal Staff",
      domain_slug: "communications",
      domain_name: "Communications",
      feature_slug: "personal-staff",
      feature_name: "Personal Staff",
    },
    propagation: "next_load",
    scope_chain: [
      { kind: "organization", precedence: 10, scope_id: ORG, value: "off", is_set: true, locked: false, is_effective: true },
      { kind: "user", precedence: 100, scope_id: null, value: null, is_set: false, locked: false, is_effective: false },
    ],
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

function mountOrgRow(props: {
  knob?: ScopedKnob;
  /** What `platform.knob_index` answers when it IS addressed at the viewer. */
  viewerValue?: unknown;
  viewerOrigin?: ScopedKnob["origin"];
  viewerPrecedence?: number | null;
  viewerUnknown?: string | null;
  door?: string | null;
}) {
  const knob = props.knob ?? escalationMode();
  const viewer =
    props.viewerOrigin === undefined
      ? null
      : resolveViewerStanding(knob, "organization", {
          value: props.viewerValue,
          origin: props.viewerOrigin,
          originPrecedence: props.viewerPrecedence ?? null,
        });
  act(() =>
    root.render(
      <KnobOverrideRow
        knob={knob}
        scopeKind="organization"
        scopeId={ORG}
        organizationId={ORG}
        blastRadius="Applies to everyone in Hands & Hope Alliance."
        ladder={resolveKnobLadder(knob, "organization", { isOrgAdmin: true })}
        viewer={viewer}
        viewerUnknown={props.viewerUnknown ?? null}
        viewerDoor={props.door ?? null}
        onChanged={jest.fn()}
      />,
    ),
  );
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

const screenText = () => document.body.textContent ?? "";

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

test("THE REPORTED CASE: org says Never, the reader's own value still runs, and the row says so", () => {
  mountOrgRow({
    viewerValue: "auto",
    viewerOrigin: "user",
    viewerPrecedence: 100,
    door: "/user-settings/config/communications/personal-staff#personal_staff.escalation_mode",
  });
  const text = screenText();
  // It names the rung that wins, in the second person, in plain English.
  expect(text).toContain("Your own setting overrides this for you.");
  // It prints the value that is actually running — in the registry's WORDS.
  expect(text).toContain("In effect for you: Go ahead (recommended)");
  expect(text).not.toContain("In effect for you: auto");
  // And it opens the door to the rung that wins.
  const door = [...document.body.querySelectorAll("a")].find((a) =>
    /Change your own setting/.test(a.textContent ?? ""),
  );
  expect(door).toBeDefined();
  expect(door!.getAttribute("href")).toBe(
    "/user-settings/config/communications/personal-staff#personal_staff.escalation_mode",
  );
});

test("nothing masking it: the row stays quiet, and the options panel still carries the answer", async () => {
  mountOrgRow({ viewerValue: "off", viewerOrigin: "organization", viewerPrecedence: 10 });
  expect(screenText()).not.toContain("overrides this for you");
  await openOptions();
  expect(screenText()).toContain("In effect for you: Never — from your organization");
});

test("a viewer read that failed says so — silence would read as 'nothing masks this'", () => {
  mountOrgRow({ viewerUnknown: "knob_index failed: network error" });
  expect(screenText()).toContain("could not be read");
  expect(screenText()).toContain("network error");
});

test("a device value masks a personal row the same way, and is named as this browser", () => {
  const knob = escalationMode({
    overridable_by: ["organization", "user", "device"],
    scope_chain: [
      { kind: "organization", precedence: 10, scope_id: ORG, value: "off", is_set: true, locked: false, is_effective: false },
      { kind: "user", precedence: 100, scope_id: USER, value: "ask", is_set: true, locked: false, is_effective: false },
      { kind: "device", precedence: 110, scope_id: "d", value: "auto", is_set: true, locked: false, is_effective: true },
    ],
  } as Partial<ScopedKnob>);
  const standing = resolveViewerStanding(knob, "user", {
    value: "auto",
    origin: "device",
    originPrecedence: 110,
  });
  expect(standing?.masked).toBe(true);
  expect(standing?.sentence).toBe(
    "Your setting in this browser overrides this for you.",
  );
});

test("a rung BELOW the one being edited never reads as masking it", () => {
  // The personal destination edits `user`; the organization's value is above
  // it in the ladder but BELOW it in precedence. Saying "the organization
  // overrides this for you" there would be the same lie pointing the other way.
  const knob = escalationMode();
  const standing = resolveViewerStanding(knob, "user", {
    value: "off",
    origin: "organization",
    originPrecedence: 10,
  });
  expect(standing).not.toBeNull();
  expect(standing!.masked).toBe(false);
  expect(standing!.sentence).toBeNull();
});

test("no viewer answer is NOT an answer — the comparison refuses rather than guesses", () => {
  expect(resolveViewerStanding(escalationMode(), "organization", null)).toBeNull();
  // A key whose chain does not carry the edited rung cannot be compared either.
  expect(
    resolveViewerStanding(escalationMode({ scope_chain: [] } as Partial<ScopedKnob>), "organization", {
      value: "auto",
      origin: "user",
      originPrecedence: 100,
    }),
  ).toBeNull();
});
