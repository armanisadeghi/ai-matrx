/** @jest-environment jsdom */
//
// The admin Feature Knobs register shows EVERY level of one key from one place
// (Arman 2026-09-26: defaults for everyone, then per-org and per-user
// overrides). These cases are what an operator does with it: read who differs
// from the default (by NAME, never an id), read what one person actually gets
// and which layer decided it, add an override, and remove one — and each write
// must go through the door the KEY declares, with a removal being that door
// with a null value (never a direct table delete).
//
// Only the module boundaries are mocked: the override list read, the knob_index
// resolution, the door lookup + door write, and the admin roster fetch.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ScopedKnob } from "@/lib/scoped-config/types";
import type { KnobWriteDoor, PlatformKnobOverrideRow } from "@/lib/scoped-config/service";

jest.mock("@/lib/scoped-config/service", () => ({
  ...jest.requireActual("@/lib/scoped-config/service"),
  fetchPlatformKnobOverrides: jest.fn(),
  fetchKnobDefinition: jest.fn(),
  fetchKnobWriteDoor: jest.fn(),
  writeKnobOverrideThroughDoor: jest.fn(),
}));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({ confirm: jest.fn(async () => true) }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

import {
  fetchKnobDefinition,
  fetchKnobWriteDoor,
  fetchPlatformKnobOverrides,
  writeKnobOverrideThroughDoor,
} from "@/lib/scoped-config/service";
import { toast } from "@/lib/toast";
import {
  effectiveAnswer,
  overrideCountWords,
  overrideTableRows,
  resolveKnobFor,
  writeAdminKnobOverride,
  type AdminKnobDirectory,
} from "../knobOverrides";
import { KnobOverridesAdmin } from "../components/KnobOverridesAdmin";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
const OTHER_ORG = "57f2a22b-5875-46c6-80df-437076421c28";
const ADMIN = "87a6e699-3622-4869-8843-d0867456c0dd";
const SETTER = "11111111-2222-4333-8444-555555555555";

function knob(overrides: Partial<ScopedKnob> = {}): ScopedKnob {
  return {
    feature: "data_tables",
    key: "merged_grid",
    full_key: "data_tables.merged_grid",
    label: "Tables use the new spreadsheet grid",
    description: "",
    value_type: "boolean",
    unit: null,
    allowed_values: null,
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
    platform_default: false,
    shipped_default: false,
    org_override: null,
    user_override: null,
    effective_value: false,
    origin: "platform_default",
    origin_scope_id: null,
    origin_precedence: null,
    is_overridden: false,
    out_of_range: false,
    ui: {},
    taxonomy: null,
    propagation: "next_load",
    scope_chain: [],
    locked: null,
    write_rung: null,
    can_write: true,
    can_write_reason: null,
    secret: null,
    ...overrides,
  };
}

const directory: AdminKnobDirectory = {
  organizations: [
    { id: ORG, name: "admin's Workspace", slug: "admins-workspace" },
    { id: OTHER_ORG, name: "Rincon Plumbing Co — Camarillo Branch", slug: "rincon-camarillo" },
  ],
  people: [
    { id: ADMIN, email: "admin@admin.com", display_name: null, full_name: null, organizations: [{ id: ORG, name: "admin's Workspace" }] },
    { id: SETTER, email: "ops@example.com", display_name: "Dana Ops", full_name: null, organizations: [] },
  ],
};

const overrideRows: PlatformKnobOverrideRow[] = [
  { scope_kind: "user", scope_id: ADMIN, organization_id: ORG, value: true, updated_at: "2026-09-28T19:00:00Z", updated_by: SETTER, set_note: null },
  { scope_kind: "organization", scope_id: OTHER_ORG, organization_id: OTHER_ORG, value: true, updated_at: "2026-09-28T18:00:00Z", updated_by: SETTER, set_note: null },
];

const platformDoor: KnobWriteDoor = {
  key: "data_tables.merged_grid",
  featurePrefix: "data_tables",
  setDoor: "platform.knob_override_set",
  clearDoor: "platform.knob_override_set",
  authorityKind: "platform",
  mayWrite: true,
  authorityDetail: "",
  reason: "",
};

describe("the override table names every level, never an id", () => {
  it("lists organizations before people, each named from the roster, with who set it", () => {
    const rows = overrideTableRows(knob(), overrideRows, directory);
    expect(rows.map((row) => [row.levelLabel, row.who, row.valueWords, row.setBy])).toEqual([
      ["Organization", "Rincon Plumbing Co — Camarillo Branch", "On", "Dana Ops"],
      ["Person", "admin@admin.com", "On", "Dana Ops"],
    ]);
    expect(rows[1].organizationName).toBe("admin's Workspace");
    for (const row of rows) {
      expect(row.who).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
    }
  });

  it("counts organizations and people separately, and says when there are none", () => {
    expect(overrideCountWords(overrideTableRows(knob(), overrideRows, directory))).toBe("2 overrides (1 organization, 1 person)");
    expect(overrideCountWords([])).toBe("No overrides");
  });
});

describe("what a person actually gets, and which layer decided it", () => {
  it("names the person's own override when the user rung wins", () => {
    const answer = effectiveAnswer(knob({ effective_value: true, origin: "user" }), {
      organizationName: "admin's Workspace",
      person: directory.people[0],
    });
    expect(answer).toMatchObject({ valueWords: "On", decidedBy: "admin@admin.com's own override" });
  });

  it("names the organization when its override wins, and the platform default otherwise", () => {
    expect(effectiveAnswer(knob({ effective_value: true, origin: "organization" }), { organizationName: "admin's Workspace", person: null }).decidedBy).toBe(
      "admin's Workspace's organization override",
    );
    expect(effectiveAnswer(knob(), { organizationName: "admin's Workspace", person: null })).toMatchObject({
      valueWords: "Off",
      decidedBy: "the platform default",
    });
  });

  it("asks knob_index for the picked organization AND person — never recomputes the ladder", async () => {
    (fetchKnobDefinition as jest.Mock).mockResolvedValue(knob({ effective_value: true, origin: "user" }));
    const resolved = await resolveKnobFor({ knob: knob(), organizationId: ORG, userId: ADMIN });
    expect(fetchKnobDefinition).toHaveBeenCalledWith({ organizationId: ORG, feature: "data_tables", key: "merged_grid", userId: ADMIN });
    expect(resolved.origin).toBe("user");
  });
});

describe("writes go through the door the key declares", () => {
  beforeEach(() => {
    (fetchKnobWriteDoor as jest.Mock).mockReset().mockResolvedValue(platformDoor);
    (writeKnobOverrideThroughDoor as jest.Mock).mockReset().mockResolvedValue({ ok: true });
  });

  it("sets a person override inside their organization through the key's door", async () => {
    expect(await writeAdminKnobOverride({ knob: knob(), kind: "user", organizationId: ORG, scopeId: ADMIN, value: true })).toBeNull();
    expect(fetchKnobWriteDoor).toHaveBeenCalledWith({ fullKey: "data_tables.merged_grid", organizationId: ORG });
    expect(writeKnobOverrideThroughDoor).toHaveBeenCalledWith(
      expect.objectContaining({ door: platformDoor, feature: "data_tables", key: "merged_grid", scopeKind: "user", scopeId: ADMIN, organizationId: ORG, value: true }),
    );
  });

  it("returns the door's refusal as a sentence instead of claiming success", async () => {
    (writeKnobOverrideThroughDoor as jest.Mock).mockResolvedValue({ ok: false, reason: "forbidden", detail: "Organization configuration is owner/admin only." });
    expect(await writeAdminKnobOverride({ knob: knob(), kind: "organization", organizationId: ORG, scopeId: ORG, value: true })).toBe(
      "forbidden — Organization configuration is owner/admin only.",
    );
  });
});

describe("KnobOverridesAdmin — the opened key", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (fetchPlatformKnobOverrides as jest.Mock).mockReset().mockResolvedValue(overrideRows);
    (fetchKnobWriteDoor as jest.Mock).mockReset().mockResolvedValue(platformDoor);
    (writeKnobOverrideThroughDoor as jest.Mock).mockReset().mockResolvedValue({ ok: true });
    (toast.error as jest.Mock).mockReset();
    global.fetch = jest.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes("/organizations")
          ? { directory: { organizations: directory.organizations } }
          : { users: directory.people },
    })) as unknown as typeof fetch;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows the default, the count, every override by name, and removes one through the door with null", async () => {
    const onChanged = jest.fn();
    await act(async () => {
      root.render(<KnobOverridesAdmin knob={knob()} onChanged={onChanged} />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const text = container.textContent ?? "";
    expect(text).toContain("Platform default");
    expect(text).toContain("2 overrides (1 organization, 1 person)");
    expect(text).toContain("Rincon Plumbing Co — Camarillo Branch");
    expect(text).toContain("admin@admin.com");
    expect(text).not.toContain(ADMIN);

    const remove = container.querySelector<HTMLButtonElement>('button[aria-label="Remove admin@admin.com\'s override in admin\'s Workspace"]');
    expect(remove).not.toBeNull();
    await act(async () => {
      remove!.click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(writeKnobOverrideThroughDoor).toHaveBeenCalledWith(
      expect.objectContaining({ scopeKind: "user", scopeId: ADMIN, organizationId: ORG, value: null }),
    );
    expect(toast.error).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
});
