// "Test orgs" on the admin Custom tables page (lane ONE-HOME, wave 6.2): marking an organization writes
// the key every picker reads (`settings.test_fixture`) through `public.org_update`, which REPLACES
// settings whole — so each organization is read fresh and every other setting must survive. Unmark
// removes the key (presence is the classification). A refusal is reported by name with the door's own
// sentence while the others carry on. Also: a filter change never leaves hidden rows selected.
// The doors here are recorders standing in for PostgREST, answering in the live shapes.

import {
  setTestFixture,
  withTestFixture,
  isTestFixture,
  type OrgSettingsDoors,
  type Settings,
} from "../testFixtureOrgs";
import { filterRows, keepVisibleSelection, type CustomTableRow } from "../archiveTables";

function recordingDoors(stored: Record<string, Settings | null>, refuse: Record<string, string> = {}) {
  const writes: { orgId: string; settings: Settings }[] = [];
  const doors: OrgSettingsDoors = {
    readSettings: async (orgId) => ({ ok: true, data: stored[orgId] ?? null }),
    writeSettings: async (orgId, settings) => {
      if (refuse[orgId]) return { ok: false, message: refuse[orgId] };
      writes.push({ orgId, settings });
      stored[orgId] = settings;
      return { ok: true, data: { id: orgId } };
    },
  };
  return { doors, writes, stored };
}

const cedar = { id: "0a54df90-0000-4000-8000-000000000001", name: "Cedar Ridge Physical Therapy" };
const calder = { id: "235a6add-0000-4000-8000-000000000002", name: "Calder Approvals" };
const harbor = { id: "11111111-0000-4000-8000-000000000003", name: "Harbor Dental Group" };

describe("Test orgs: mark and unmark through org_update", () => {
  it("marks with the key, keeps every other setting, skips an already-marked org, names a refusal", async () => {
    const { doors, writes, stored } = recordingDoors(
      {
        [cedar.id]: { timezone: "America/Los_Angeles", modules: { hr: true } },
        [calder.id]: { test_fixture: "earlier lane" },
        [harbor.id]: { timezone: "America/New_York" },
      },
      { [harbor.id]: "org_update: you are not a manager of this organization." },
    );

    const outcomes = await setTestFixture([cedar, calder, harbor], true, doors, "Custom tables admin page, 2026-10-02");

    expect(outcomes.map((o) => o.status)).toEqual(["changed", "unchanged", "refused"]);
    expect(writes.map((w) => w.orgId)).toEqual([cedar.id]);
    expect(stored[cedar.id]).toEqual({
      timezone: "America/Los_Angeles",
      modules: { hr: true },
      test_fixture: "Custom tables admin page, 2026-10-02",
    });
    expect(isTestFixture(stored[cedar.id])).toBe(true);
    const refused = outcomes[2];
    expect(refused.status === "refused" && refused.message).toBe("org_update: you are not a manager of this organization.");
    expect(refused.target.name).toBe("Harbor Dental Group");
  });

  it("unmark removes the key (presence is the mark) and leaves the rest", async () => {
    const { doors, stored } = recordingDoors({ [calder.id]: { test_fixture: true, locale: "en-US" }, [cedar.id]: {} });
    const outcomes = await setTestFixture([calder, cedar], false, doors);
    expect(outcomes.map((o) => o.status)).toEqual(["changed", "unchanged"]);
    expect(stored[calder.id]).toEqual({ locale: "en-US" });
    expect(isTestFixture(stored[calder.id])).toBe(false);
  });

  it("a falsy stored value still counts as marked (readers ask only whether the key is there)", () => {
    expect(isTestFixture({ test_fixture: false })).toBe(true);
    expect(withTestFixture(null, true, "s")).toEqual({ test_fixture: "s" });
  });
});

describe("a filter change never leaves hidden rows selected", () => {
  const row = (id: string, name: string, organizationId: string, platformOwned = false): CustomTableRow => ({
    id,
    name,
    organizationId,
    organizationName: organizationId,
    updatedAt: null,
    system: false,
    platformOwned,
  });
  const rows = [
    row("van", "Rincon Plumbing — Van Inventory (archive test)", "admin-ws"),
    row("jobs", "Rincon Plumbing — Job Log", "admin-ws"),
    row("visits", "Cedar Ridge — Patient Visits", "cedar"),
    row("kept", "Cedar Ridge — Scope list", "cedar", true),
  ];

  it("drops rows the name filter hides", () => {
    expect(keepVisibleSelection(["van", "jobs", "visits"], filterRows(rows, null, "archive test"))).toEqual(["van"]);
  });

  it("drops rows of another organization but retains protected rows for copy", () => {
    expect(keepVisibleSelection(["van", "visits", "kept"], filterRows(rows, "cedar", ""))).toEqual(["visits", "kept"]);
  });
});
