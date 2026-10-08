/**
 * THE SEARCH BAR FINDS A CHOICE LIST (lane DATA-HOME-SLIM, 2026-10-08).
 *
 * THE BREAK. `custom.data_home` stopped sending platform tables (a choice column's List above all)
 * unless the caller asks with the "Show platform tables" switch. The ⌘K bar's tables source read the
 * door without it, so "Status choices" — a List the person can open — vanished from search.
 *
 * Forced through the REAL source (`dataHomeTables` → `custom.data_home` → the home's row builder →
 * `rankDataHomeTables`). Only the data seam is a double, and it answers what the live door answers:
 * the List only when the switch is sent.
 *
 * RED on the old code: the bar asks without the switch and finds nothing for "status choices".
 */
import type { RecordsDataSource } from "@ai-matrx/records";

const CLINIC = { id: "7a3c1e52-4b8d-4f0a-9c21-5e6d7f8a9b01", name: "Cedar Ridge Physical Therapy" };
const ME = "0d5b2f8e-6a1c-4e3b-8f7d-9c2a1b3e4f50";

function table(id: string, name: string, kind: string, platformOwned: boolean) {
  return {
    table_id: id,
    table_name: name,
    organization_id: CLINIC.id,
    organization_name: CLINIC.name,
    member: true,
    visibility: "internal",
    updated_at: "2026-10-01T16:20:00.000Z",
    mine: true,
    shared_with_me: false,
    platform_owned: platformOwned,
    kept_by_the_app: platformOwned,
    kind,
    team: false,
    system: false,
    created_by: ME,
    created_by_name: "Dana Whitfield",
  };
}

const VISITS = table("5f1a2b3c-0001-4d5e-8f60-718293a4b5c1", "Patient Visits", "table", false);
const STATUS_CHOICES = table("9e8d7c6b-0001-4a5b-9c0d-1e2f3a4b5c61", "Status choices", "list", true);

const asked: Array<Record<string, unknown>> = [];
const door = {
  rpc: async (fn: string, args: Record<string, unknown>) => {
    if (fn === "data_home") {
      asked.push(args);
      const withPlatform = Object.entries(args).some(([k, v]) => k.startsWith("p_include_") && v === true);
      return { data: { tables: withPlatform ? [VISITS, STATUS_CHOICES] : [VISITS], items: [], changed_by: [] }, error: null };
    }
    return { data: [], error: null };
  },
} as unknown as RecordsDataSource;

jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("@ai-matrx/records/core", () => {
  const actual = jest.requireActual("@ai-matrx/records/core");
  return { ...actual, supabaseDataSource: () => door };
});

// eslint-disable-next-line import/first
import { dataHomeTables, forgetDataHomeTables, rankDataHomeTables } from "../dataHomeTablesSource";

describe("the ⌘K bar's tables source", () => {
  beforeEach(() => {
    forgetDataHomeTables();
    asked.length = 0;
  });

  it("asks the data home door with platform tables included", async () => {
    await dataHomeTables(ME).next;
    expect(asked).toHaveLength(1);
    expect(Object.entries(asked[0]!).some(([k, v]) => k.startsWith("p_include_") && v === true)).toBe(true);
  });

  it("finds a choice list the person can open", async () => {
    const rows = await dataHomeTables(ME).next;
    const hits = rankDataHomeTables(rows, "status choices");
    expect(hits.map((r) => r.name)).toContain("Status choices");
    expect(hits[0]!.href).toContain(STATUS_CHOICES.table_id);
  });
});
