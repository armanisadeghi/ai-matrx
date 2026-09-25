/**
 * THE SHEET READS A RECORD-STORE TABLE THE WAY THE GRID DOES (lane POST-PUBLISH-FE).
 *
 * THE USE CASE: the Birchwood Avenue Renovation's Rooms table. Its colours are the
 * organization's decorations (colour rows by Status; one rule, "Status is On Hold -> Red"),
 * and its Budget column is confidential: a reader below Editor gets it masked, with the store's
 * reason beside the row (`ReadRow.hidden`).
 *
 * 1. COLOURS. The Sheet used to translate the decorations itself (`olderStyle` in
 *    record-store.ts), a second copy of records-ui's `styleFromDecorations` that had already
 *    drifted: a rule the store kept without an id reached the Sheet with none, while the grid
 *    names it `decoration:<n>`. The Sheet now holds exactly what records-ui's
 *    `resolveTableStyle` answers for the table.
 * 2. WITHHELD. The Sheet dropped `hidden`, so a masked Budget read "—" — the mark an EMPTY cell
 *    wears. Each row now carries the store's notice for every withheld column, and the cell
 *    draws records-ui's one withheld helper.
 */
import { resolveTableStyle } from "@ai-matrx/records-ui";

const TABLE = "5b0f3c1e-2d7a-4c55-9e0b-6f1a2b3c4d01";
const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
const STATUS = "6c1f0a2b-1111-4a00-8000-000000000001";
const BUDGET = "6c1f0a2b-1111-4a00-8000-000000000002";
const ROOM = "6c1f0a2b-1111-4a00-8000-000000000003";

const FIELDS = [
  { id: ROOM, key: "room_name", label: "Room", type: "text", sort: 1, organization_id: ORG },
  { id: STATUS, key: "status", label: "Status", type: "text", sort: 2, organization_id: ORG },
  { id: BUDGET, key: "budget", label: "Budget", type: "number", sort: 3, organization_id: ORG },
];

const DECORATIONS = {
  color_by: { field: STATUS, target: "row" },
  // The store kept this rule with no id of its own.
  rules: [{ field: STATUS, op: "is", value: "On Hold", color: "red", target: "row" }],
};

const BUDGET_NOTICE = { reason: "confidential", needs: "Editor", or: "a share of this one field with you" };

const ROWS = [
  { id: "r-garage", document: { room_name: "Garage", status: "On Hold", budget: null }, hidden: { budget: BUDGET_NOTICE } },
  { id: "r-deck", document: { room_name: "Backyard Deck", status: "Complete", budget: null }, hidden: { budget: BUDGET_NOTICE } },
];

const ok = <T,>(data: T) => ({ ok: true as const, data });
const client = {
  recordRead: jest.fn(async () => ok({ document: { name: "Rooms", row_order: "sorted" } })),
  fields: jest.fn(async () => ok(FIELDS)),
  myLevels: jest.fn(async () => ok([{ id: TABLE, level: "viewer" }])),
  fieldOptions: jest.fn(async () => ok([])),
  list: jest.fn(async ({ offset }: { offset: number }) => ok({ rows: offset === 0 ? ROWS : [] })),
  tableDecorations: jest.fn(async () => ok(DECORATIONS)),
  rowActions: jest.fn(async () => ok({ actions: [] })),
  views: jest.fn(async () => ok([])),
};

jest.mock("@ai-matrx/records/core", () => ({
  ...jest.requireActual("@ai-matrx/records/core"),
  createRecordsClient: () => client,
}));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("../record-store-grid", () => ({
  readRecordsInViewOrder: jest.fn(async () => ({ ok: false, absent: true, error: { message: "absent here" } })),
  viewRecordOrderSet: jest.fn(),
  migrateRetype: jest.fn(),
}));

import { getTableMetadata, getTablePage } from "../record-store";

const HOME = { store: "record" as const, organizationId: ORG, userId: "87a6e699-0000-4000-8000-000000000009" };

describe("Birchwood Rooms · the Sheet reads the table the way the grid does", () => {
  it("holds exactly the style records-ui's resolveTableStyle answers for the table", async () => {
    const read = await getTableMetadata(HOME, { tableId: TABLE });
    if (!read.success) throw new Error(read.error);
    const style = (read.data.table.metadata as { style?: unknown }).style;
    expect(style).toEqual(resolveTableStyle(DECORATIONS as never, FIELDS as never, undefined));
  });

  it("a masked Budget carries the store's notice, never a bare empty", async () => {
    const page = await getTablePage(HOME, { tableId: TABLE, limit: 20, offset: 0 });
    if (!page.success) throw new Error(page.error);
    const garage = page.data.rows.find((r) => r.id === "r-garage") as {
      data: Record<string, unknown>;
      withheld?: Record<string, { notice: unknown; field: { key: string } }>;
    };
    expect(garage.data.budget).toBeNull();
    expect(garage.withheld?.budget?.notice).toEqual(BUDGET_NOTICE);
    expect(garage.withheld?.budget?.field.key).toBe("budget");
    expect(garage.withheld?.room_name).toBeUndefined();
  });
});
