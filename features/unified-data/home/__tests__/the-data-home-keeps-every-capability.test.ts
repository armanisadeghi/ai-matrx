/**
 * THE REBUILT DATA HOME KEEPS EVERY CAPABILITY OF TODAY'S PAGE (DATA-HOME-3-SPEC §3 census, Lane A
 * acceptance 7 and the source-grep half of 5). Adopt, never replace: each of the 18 census items is
 * asserted on the new page — behaviourally where the rows decide it, by reading the source where
 * it is wiring.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

jest.mock("@/features/unified-data/hub/doors", () => {
  const actual = jest.requireActual("@/features/unified-data/hub/doors");
  return {
    ...actual,
    tablesSharedWithMe: jest.fn(async () => ({
      ok: true,
      data: [
        // Accepted, and already a Table row (listed once, not twice — census 8).
        { table_id: "t-shared", organization_id: "o-rincon", organization: "Rincon Plumbing Co", table_name: "Job Board", level: "view", level_label: "Can view", shared_at: "2026-09-20T00:00:00Z", opens: true, say: "" },
        // Accepted, from an organization she is not in, NOT a Table row: kept, opens with ?org=.
        { table_id: "t-out", organization_id: "o-cedar", organization: "Cedar Ridge Dental", table_name: "Referral Partners", level: "view", level_label: "Can view", shared_at: "2026-09-21T00:00:00Z", opens: true, say: "" },
      ],
    })),
    sharedWithMe: jest.fn(async () => ({
      ok: true,
      data: [
        { invitation_id: "inv-1", organization_id: "o-cedar", organization: "Cedar Ridge Dental", table_id: "t-offer", table_name: "Lab Orders", level: "edit", level_label: "Can edit", token: "tok-1", expires_at: null },
      ],
    })),
  };
});

import { buildDataHomeRows, accessOf } from "../dataHomeRows";
import type { DataHomeAnswer } from "@/features/unified-data/hub/doors";

const HOME = join(__dirname, "..");
const read = (file: string) => readFileSync(join(HOME, file), "utf8");

const T = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  table_id: id,
  table_name: name,
  organization_id: "o-harbor",
  organization_name: "Harbor Dental Group",
  member: true,
  visibility: "internal",
  updated_at: "2026-09-29T00:00:00Z",
  mine: false,
  shared_with_me: false,
  platform_owned: false,
  kind: "table",
  created_by: "u-sam",
  ...extra,
});
const I = (kind: string, item_id: string, item_row: Record<string, unknown>, table = "t-recall") => ({
  kind,
  organization_id: "o-harbor",
  organization_name: "Harbor Dental Group",
  item_id,
  table_id: table,
  table_name: "Patient Recall",
  item_row,
});

const ANSWER: DataHomeAnswer = {
  tables: [
    T("t-recall", "Patient Recall", { mine: true }),
    T("t-choices", "Status choices", { kind: "list", platform_owned: true }),
    T("t-shared", "Job Board", { organization_id: "o-rincon", organization_name: "Rincon Plumbing Co", member: false, shared_with_me: true }),
  ] as DataHomeAnswer["tables"],
  items: [
    I("form", "f1", { form_id: "f1", table_id: "t-recall", title: "New patient intake", state: "published", responses: 12, held: 0, published_at: "2026-09-01" }),
    I("booking", "b1", { form_id: "b1", table_id: "t-recall", title: "Book a cleaning", state: "published", slot_minutes: 30, booked: 4, upcoming: 2, published_at: "2026-09-01" }),
    I("portal", "p1", { portal_id: "p1", title: "Patient portal", client_table_id: "t-recall", is_active: true, tables: 0, invited: 3, signed_in: 1, shows: [] }),
    I("dashboard", "d1", { dashboard_id: "d1", table_id: "t-recall", name: "Recall rate", block_count: 3 }),
    I("digest", "g1", { rule_id: "g1", name: "Weekly recall digest", table_id: "t-recall", muted: false, cadence: "weekly", channel: "email", mine: true }),
    I("checklist", "c1", { template_id: "c1", name: "Morning opening", about_table_id: "t-recall", about_table: "Patient Recall", steps: 5, open_runs: 1, total_runs: 9, updated_at: "2026-09-28" }),
    I("automation", "t-recall", { table_id: "t-recall", table_name: "Patient Recall", stage_label: "Stage", stages: 4, rules: 2, broken: null, updated_at: "2026-09-27" }),
    I("share", "s1", { invitation_id: "s1", table_id: "t-recall", table_name: "Patient Recall", email: "front.desk@harbordental.net", level_label: "Can view", joined: false, expired: false, invited_at: "2026-09-25", say: null }),
  ] as DataHomeAnswer["items"],
  changed_by: [{ organization_id: "o-harbor", id: "f1", at: "2026-09-30T08:00:00Z", who: "Sam Ortiz" }],
};

async function rows() {
  return (await buildDataHomeRows({ client: {} as never, dataSource: {} as never, answer: ANSWER })).rows;
}

describe("census items that the rows decide", () => {
  it("6 · all ten listings become one list with a kind on every row", async () => {
    const kinds = new Set((await rows()).map((r) => r.kind));
    for (const k of ["table", "list", "form", "booking", "portal", "dashboard", "digest", "checklist", "automation", "share"]) {
      expect(kinds).toContain(k);
    }
  });

  it("7 · every row keeps its door, its table, its facts, who changed it, its public link and its trouble", async () => {
    const all = await rows();
    const form = all.find((r) => r.kind === "form")!;
    expect(form.href).toBe("/data/t-recall?rail=forms&item=f1");
    expect(form.parentName).toBe("Patient Recall");
    expect(form.details).toContain("12 answers");
    expect(form.changedBy).toBe("Sam Ortiz");
    expect(form.publicHref).toBe("/f/f1");
    const portal = all.find((r) => r.kind === "portal")!;
    expect(portal.trouble).toMatch(/shows no table yet/);
    // `in <table>` only when different from the row's own name.
    expect(all.find((r) => r.kind === "automation")!.parentName).toBeNull();
  });

  it("8 · an accepted share already listed as a Table is listed once; an offer stays; a share from outside opens with ?org=", async () => {
    const all = await rows();
    expect(all.filter((r) => r.tableId === "t-shared")).toHaveLength(1);
    const offer = all.find((r) => r.itemId === "inv-1")!;
    expect(offer.href).toBe("/invitations/table/accept/tok-1");
    const outside = all.find((r) => r.tableId === "t-out")!;
    expect(outside.href).toBe("/data/t-out?org=o-cedar");
    expect(outside.access).toBe("shared");
    expect(outside.organizationName).toBe("Cedar Ridge Dental");
  });

  it("9 · the tables the app keeps are listed with their kind (the home hides nothing)", async () => {
    expect((await rows()).find((r) => r.name === "Status choices")?.kind).toBe("list");
  });

  it("the Access chip names the strongest reason a row is shown", () => {
    expect(accessOf({ mine: true, member: true, sharedWithMe: false, visibility: "internal" })).toBe("mine");
    expect(accessOf({ mine: false, team: true, member: true, sharedWithMe: false, visibility: "internal" })).toBe("team");
    expect(accessOf({ mine: false, member: false, sharedWithMe: false, visibility: "public" })).toBe("public");
  });

  it("10 · a listing whose door refuses is said in the store's own words, never an empty list", async () => {
    const doors = jest.requireMock("@/features/unified-data/hub/doors");
    doors.tablesSharedWithMe.mockResolvedValueOnce({ ok: false, error: { message: "permission denied for function tables_shared_with_me" } });
    const built = await buildDataHomeRows({ client: {} as never, dataSource: {} as never, answer: ANSWER });
    expect(built.refusals).toEqual([{ listing: "Shared with me", error: { message: "permission denied for function tables_shared_with_me" } }]);
  });
});

describe("census items that are wiring", () => {
  const page = read("DataHomeShellPage.tsx");
  const list = read("DataHomeList.tsx");
  const route = read("DataHomeRoute.tsx");

  // G5 b (lane MAKE-HOME, 2026-10-02): New table is never hidden for want of an organization; the
  // press opens the one New table dialog, which says where the table is saved and asks when none is.
  it("1 · header: Back, New table and Start from a template whenever the store is open, opening the one dialog", () => {
    expect(page).toMatch(/back=\{goBack\}/);
    expect(page).not.toMatch(/storeOn && active\.organizationId/);
    expect(page).toMatch(/making\.ask\("create"\)/);
    expect(route).toContain("<NewTableDialog");
    expect(page).toContain('"New table"');
    expect(page).toContain('"Start from a template"');
  });

  it("2 · 3 · the shell's lanes (System absent) and the shell's organization filter; no hand-rolled control", () => {
    expect(list).toMatch(/scopes: \[\.\.\.DATA_HOME_SHELL_LANES\]/);
    expect(list).toMatch(/lanes: \{ system: false \}/);
    expect(list).toContain("<EntityListPage");
    expect(list).not.toMatch(/<EntityScopeTabs|<EntityOrgFilter/);
  });

  it("3 · rule 1: nothing in the new data home reads the active organization for a read", () => {
    for (const file of ["DataHomeList.tsx", "dataHomeArchived.ts", "DataHomeViews.tsx", "dataHomeService.ts", "dataHomeRows.ts", "dataHomeCorpus.ts", "DataHomeRoute.tsx"]) {
      expect(read(file)).not.toMatch(/selectActiveOrganizationId|useActiveOrganization|selectOrganizationId\b|useOrganizationRequired/);
    }
    // The page reads no active organization at all now: the write target is the New table dialog's.
    expect(page).not.toMatch(/useOrganizationRequired\(|active\.organizationId/);
  });

  it("4 · 5 · Kind, the `?kind=` alias and the order knob are kept", () => {
    expect(list).toContain('get("kind")');
    expect(list).toContain("DATA_HOME_DEFAULT_ORDER_KNOB");
    expect(list).toContain("DATA_HOME_DEFAULT_SCOPE_KNOB");
  });

  it("11 · one call for the whole home", () => {
    const corpus = read("dataHomeCorpus.ts");
    // one read of the home; "Show platform tables" (CHAIR-DOORS-2) rides the same call as its third argument
    expect(corpus.match(/\bdataHome\(dataSource, null[,)]/g)).toHaveLength(1);
    expect(list).not.toMatch(/doors\.dataHome\(/);
  });

  it("12 · 13 · 15 · 16 · no store switch (the store is never off), making in the active organization (the dialog), the inbox and the mount ports", () => {
    // 12 · the page asks no store switch and shows no switch notice (CHAIR-ALWAYS-ON, 2026-10-03).
    expect(page).not.toMatch(/SwitchNotice|storeSwitch/);
    // 13 · making in the active organization is the one New table dialog (features/make/MakeMount.tsx).
    expect(route).toContain("<NewTableDialog");
    // 15 · the inbox is a header action opening the one inbox window in place (never a band under
    // the list: mounted there it made /data scroll twice — the page and the table, 2026-10-05).
    expect(page).toContain('overlayId: "workInboxWindow"');
    expect(page).not.toContain("<ActionInbox");
    for (const port of ["members,", "share: recordStoreShare", "chat:"]) expect(page).toContain(port);
    // Realtime rides the app's one records config (2026-10-05): the page takes it, the host builds the port.
    expect(page).toContain("useAppRecordsConfig(organizationId)");
    const host = readFileSync(join(__dirname, "../../../data-tables/records-ui-host/recordsUiHost.tsx"), "utf8");
    expect(host).toContain("realtime: realtimePortFor(organizationId)");
  });

  it("14 · the archive is the list's Archived filter, and each archived table restores", () => {
    expect(list).toContain("supportsArchived: true");
    expect(list).toContain("readArchived:");
    expect(read("useDataHomeRowMenus.tsx")).toContain("restoreTableIn(");
  });

  it("17 · flat by default: no config, knob or default sets a group-by (acceptance 5)", () => {
    expect(list).not.toMatch(/prefsDefaults:[^}]*group/s);
    expect(list).not.toMatch(/defaultGroup|group=/);
    const seed = readFileSync(join(__dirname, "../../../../migrations/campaign/datahome3_lane_a_the_data_home_shell_is_a_knob.sql"), "utf8");
    expect(seed).not.toMatch(/group/i);
  });

  it("/data has one home: no old hub, no knob or ?home= choosing between two", () => {
    const appPage = readFileSync(join(__dirname, "../../../../app/(core)/data/page.tsx"), "utf8");
    expect(appPage).toContain("<DataHomeRoute />");
    expect(route).toContain("<DataHomeShellPage making={making} />");
    for (const src of [appPage, route]) {
      expect(src).not.toMatch(/OrganizationHub|UnifiedDataPage|useSearchParams|useEffectiveKnob|readEffectiveKnobOnServer/);
    }
  });
});
