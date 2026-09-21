/** @jest-environment jsdom */
//
// 🚨 THE ORGANIZATION PANE ASKS THE RESOLVER WHAT IS RUNNING FOR THE READER.
//
// THE STRUCTURAL HALF of feedback 7dc1e5ae. The organization destination calls
// `platform.knob_index` WITHOUT `p_user_id` on purpose — an organization page
// must never send a personal rung that could move the write target — so the
// rows it renders are physically incapable of knowing that the reader's own
// override is masking what they show. That is why the pane showed "Never"
// while "auto" was running for the admin looking at it.
//
// The fix is a SECOND read, addressed at the viewer, used for display only.
// This suite pins both halves at once, because either one alone is the bug:
//
//   · the EDITING read still carries no user and no device rung (regressing
//     this would move where a save lands — far worse than the original bug);
//   · a SECOND read IS made, carrying the viewer's user rung and this
//     browser's device rung, and its answer is what `viewerEffectFor` returns.
//
// And the answer is the DATABASE's: nothing here recomputes precedence. A
// client that re-derives the ladder is a second ladder, which is the one thing
// the Unified Settings Platform exists to prevent.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  UniversalSettingsProvider,
  useUniversalSettings,
} from "../UniversalSettingsContext";
import { fetchKnobIndex } from "@/lib/scoped-config/service";
import type { ScopedKnob } from "@/lib/scoped-config/types";

const ORG = "0907939e-2b75-43e8-bfee-da758e5ea75b";
const USER = "22222222-2222-4222-8222-222222222222";
const DEVICE = "33333333-3333-4333-8333-333333333333";

jest.mock("@/lib/scoped-config/service", () => ({ fetchKnobIndex: jest.fn() }));
jest.mock("@/features/admin/limits/service", () => ({ fetchFeatureKnobs: jest.fn() }));
jest.mock("../taxonomy", () => ({
  ...jest.requireActual("../taxonomy"),
  fetchTaxonomyIndex: jest.fn(async () => ({ byId: new Map(), bySlug: new Map() })),
}));
jest.mock("@/lib/scoped-config/deviceId", () => ({ getWebDeviceId: () => DEVICE }));
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({ invalidateEffectiveKnob: jest.fn() }));
jest.mock("@/lib/knobs/featureKnobs", () => ({ invalidateFeatureKnobs: jest.fn() }));
jest.mock("@/lib/client-directives/directiveRegistry", () => ({
  registerDirectiveHandler: () => () => {},
}));
jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ({
    organizations: [{ id: ORG, name: "Hands & Hope Alliance", role: "owner", memberCount: 4 }],
  }),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: unknown) => (selector as () => unknown)(),
}));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({ selectOrganizationId: () => ORG }));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: () => USER,
  selectIsSuperAdmin: () => false,
}));

const readIndex = jest.mocked(fetchKnobIndex);

/** The same key from the report, answered differently by the two reads. */
function escalationMode(effective: string, origin: string, precedence: number): ScopedKnob {
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
    user_override: origin === "user" ? effective : null,
    effective_value: effective,
    origin,
    origin_scope_id: origin === "user" ? USER : ORG,
    origin_precedence: precedence,
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
}

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
let seen: ReturnType<typeof useUniversalSettings> | null = null;

function Probe() {
  seen = useUniversalSettings();
  return null;
}

beforeEach(() => {
  seen = null;
  readIndex.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function mountOrganizationDestination() {
  await act(async () => {
    root.render(
      <UniversalSettingsProvider
        target="organization"
        organizationId={ORG}
        organizationName="Hands & Hope Alliance"
        canManageOrganization
      >
        <Probe />
      </UniversalSettingsProvider>,
    );
  });
  // Let the device id effect and both reads settle.
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

test("the editing read stays personal-rung-free, and a SECOND read asks for the viewer", async () => {
  readIndex.mockImplementation(async (options) =>
    options.userId
      ? [escalationMode("auto", "user", 100)]
      : [escalationMode("off", "organization", 10)],
  );
  await mountOrganizationDestination();

  const editing = readIndex.mock.calls.map(([o]) => o).filter((o) => !o.userId);
  const viewerCalls = readIndex.mock.calls.map(([o]) => o).filter((o) => o.userId);

  // The write target is untouched: the editing read names no person, no device.
  expect(editing.length).toBeGreaterThan(0);
  for (const call of editing) {
    expect(call.userId).toBeUndefined();
    expect(call.deviceId).toBeUndefined();
    expect(call.organizationId).toBe(ORG);
  }
  // And the viewer is asked, separately, with both of their rungs.
  expect(viewerCalls.length).toBeGreaterThan(0);
  expect(viewerCalls[0]).toMatchObject({
    organizationId: ORG,
    userId: USER,
    deviceId: DEVICE,
  });
});

test("viewerEffectFor returns the RESOLVER's answer for the reader, not the row's own", async () => {
  readIndex.mockImplementation(async (options) =>
    options.userId
      ? [escalationMode("auto", "user", 100)]
      : [escalationMode("off", "organization", 10)],
  );
  await mountOrganizationDestination();

  expect(seen!.viewerEffect.status).toBe("ready");
  const knob = seen!.knobByKey("personal_staff.escalation_mode")!;
  // The row the pane EDITS still says what the organization set.
  expect(knob.effective_value).toBe("off");
  // What is actually running for the reader is the other answer, from the
  // database's own resolution — origin and precedence included.
  expect(seen!.viewerEffectFor(knob)).toEqual({
    value: "auto",
    origin: "user",
    originPrecedence: 100,
  });
});

test("a failed viewer read is an ERROR, never a quiet 'nothing masks this'", async () => {
  readIndex.mockImplementation(async (options) => {
    if (options.userId) throw new Error("knob_index failed: network error");
    return [escalationMode("off", "organization", 10)];
  });
  await mountOrganizationDestination();

  expect(seen!.viewerEffect.status).toBe("error");
  expect(seen!.viewerEffectFor(seen!.knobByKey("personal_staff.escalation_mode")!)).toBeNull();
});
