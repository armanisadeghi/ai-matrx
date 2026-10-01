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
  kept_by_the_app: false,
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
    T("t-choices", "Status choices", { kind: "list", kept_by_the_app: true }),
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
    expect(form.href).toBe("/data-v2/t-recall?rail=forms&item=f1");
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
    expect(outside.href).toBe("/data-v2/t-out?org=o-cedar");
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

  it("1 · header: Back, New table and Start from an example only with an active organization, bound to it", () => {
    expect(page).toMatch(/back=\{goBack\}/);
    expect(page).toMatch(/storeOn && active\.organizationId/);
    expect(page).toContain('"New table"');
    expect(page).toContain('"Start from an example"');
  });

  it("2 · 3 · the shell's lanes (System absent) and the shell's organization filter; no hand-rolled control", () => {
    expect(list).toMatch(/scopes: \[\.\.\.DATA_HOME_SHELL_LANES\]/);
    expect(list).toMatch(/lanes: \{ system: false \}/);
    expect(list).toContain("<EntityListPage");
    expect(list).not.toMatch(/<EntityScopeTabs|<EntityOrgFilter/);
  });

  it("3 · rule 1: nothing in the new data home reads the active organization for a read", () => {
    for (const file of ["DataHomeList.tsx", "DataHomeArchive.tsx", "DataHomeViews.tsx", "dataHomeService.ts", "dataHomeRows.ts", "dataHomeCorpus.ts", "DataHomeRoute.tsx"]) {
      expect(read(file)).not.toMatch(/selectActiveOrganizationId|useActiveOrganization|selectOrganizationId\b|useOrganizationRequired/);
    }
    // The active organization appears once, as the write target (the header and the making controls).
    expect(page.match(/active\.organizationId/g)?.length).toBeGreaterThan(0);
  });

  it("4 · 5 · Kind, the `?kind=` alias and the order knob are kept", () => {
    expect(list).toContain('get("kind")');
    expect(list).toContain("DATA_HOME_DEFAULT_ORDER_KNOB");
    expect(list).toContain("DATA_HOME_DEFAULT_SCOPE_KNOB");
  });

  it("11 · one call for the whole home", () => {
    const corpus = read("dataHomeCorpus.ts");
    expect(corpus.match(/\bdataHome\(dataSource, null\)/g)).toHaveLength(1);
    expect(list).not.toMatch(/doors\.dataHome\(/);
  });

  it("12 · 13 · 15 · 16 · the store switch, making in the active organization, the inbox and the mount ports", () => {
    expect(page).toContain("useUnifiedDataCampaign");
    expect(page).toContain("<UnifiedDataSwitchNotice");
    expect(page).toMatch(/<TablesHome makingOnly/);
    expect(page).toContain("<ActionInbox");
    for (const port of ["realtime:", "members,", "share: recordStoreShare", "chat:"]) expect(page).toContain(port);
  });

  it("14 · the archive and its way back stay under the list", () => {
    expect(page).toContain("<DataHomeArchive");
    expect(read("DataHomeArchive.tsx")).toContain("restoreRecordIn");
  });

  it("17 · flat by default: no config, knob or default sets a group-by (acceptance 5)", () => {
    expect(list).not.toMatch(/prefsDefaults:[^}]*group/s);
    expect(list).not.toMatch(/defaultGroup|group=/);
    const seed = readFileSync(join(__dirname, "../../../../migrations/campaign/datahome3_lane_a_the_data_home_shell_is_a_knob.sql"), "utf8");
    expect(seed).not.toMatch(/group/i);
  });

  it("the old page is behind the knob, untouched beside the new one (copy mode)", () => {
    expect(route).toContain("DATA_HOME_SHELL_KNOB");
    const appPage = readFileSync(join(__dirname, "../../../../app/(core)/data-v2/page.tsx"), "utf8");
    expect(appPage).toMatch(/<DataHomeRoute old=\{<UnifiedDataPage \/>\} \/>/);
    expect(appPage).toContain("<OrganizationHub");
  });
});
