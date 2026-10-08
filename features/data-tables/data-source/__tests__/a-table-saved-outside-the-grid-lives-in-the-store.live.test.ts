/**
 * @jest-environment node
 *
 * LIVE (owner ruling 2026-10-03: tests run on live as admin@admin.com). EVERY "SAVE THIS AS A TABLE" AND "APPEND TO A TABLE" OUTSIDE THE
 * GRID REACHES THE RECORD STORE (lane INTEG-CLIENTS, CUTOVER-PLAN rev 3 rows F4, F5, F6).
 *
 * The real use case: Rincon Plumbing (admin's Workspace) asks the chat what parts
 * came in this week, then clicks "Save as table" on the answer — and, the next morning, appends
 * two more deliveries to the "Parts on order" table it already keeps.
 *
 * The table is born a custom Table, its rows are readable through the seam, and the
 * appended rows are records of "Parts on order", found by the seam with no placement handed in.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (the live database)
 * and AI_ADMIN_USERNAME / AI_ADMIN_PASSWORD. Without them
 * it is SKIPPED, loudly. Everything it writes it archives again (never deletes).
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

// The real values, read from the files: jest.setup.ts seeds a dummy localhost Supabase URL into
// process.env for unit tests, so process.env cannot be trusted for a live suite.
function envFile(rel: string): Record<string, string> {
  const file = path.resolve(__dirname, rel);
  return fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
}
const ENV = { ...envFile("../../../../../aidream/.env"), ...envFile("../../../../.env"), ...envFile("../../../../.env.local") };

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

const URL_ = ENV.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = ENV.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const EMAIL = ENV.AI_ADMIN_USERNAME ?? process.env.AI_ADMIN_USERNAME ?? "";
const PASSWORD = ENV.AI_ADMIN_PASSWORD ?? process.env.AI_ADMIN_PASSWORD ?? "";
const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f"; // admin's Workspace
// "Rincon Plumbing — Parts on order": made by this suite's own beforeAll through the product's
// normal path (createTable + bulkWrite) and archived in afterAll — never a clone-era id.
let PARTS_ON_ORDER = "";
const READY = Boolean(URL_ && KEY && EMAIL && PASSWORD);

let client: SupabaseClient;
let userId = "";

jest.mock("@/utils/supabase/client", () => ({
  // A proxy, because some modules read `supabase.auth` at LOAD time, before sign-in.
  supabase: new Proxy({}, { get: (_t, k) => (client as unknown as Record<string | symbol, unknown>)?.[k] }),
  createClient: () => client,
}));
// The active organization is UI state (the org picker); the suite acts in admin's Workspace.
jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: async (id: string | null | undefined) => id ?? ORG,
}));
// The signed-in id, as the Redux session would answer it.
jest.mock("@/utils/auth/getUserId", () => ({
  getUserId: () => userId,
  requireUserId: () => userId,
}));

import { appendToTable } from "../../save-to-table";
import * as service from "../../service";
import { forgetAllTablePlacements, placeTableInRecordStore } from "../table-home";

const describeLive = READY ? describe : describe.skip;
if (!READY) {
  // eslint-disable-next-line no-console
  console.warn(
    "[a-table-saved-outside-the-grid-lives-in-the-store] SKIPPED: set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, AI_ADMIN_USERNAME and AI_ADMIN_PASSWORD to run it.",
  );
}

async function kernelId(): Promise<string> {
  const k = await client.schema("custom" as never).rpc("table_kernel_id" as never);
  if (k.error || typeof k.data !== "string") throw new Error(`table_kernel_id: ${k.error?.message}`);
  return k.data;
}

async function isCustomTable(id: string): Promise<boolean> {
  const found = await client.schema("custom" as never).rpc("read_records_by_ids" as never, {
    p_organization_id: ORG,
    p_table_id: await kernelId(),
    p_record_ids: [id],
  } as never);
  if (found.error) throw new Error(found.error.message);
  return ((found.data ?? []) as Array<{ id: string }>).some((r) => r.id === id);
}

async function storeRows(tableId: string): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  forgetAllTablePlacements();
  placeTableInRecordStore(tableId, { organizationId: ORG, userId });
  const page = await service.getTablePage({ tableId, limit: 500, offset: 0 });
  if (!page.success) throw new Error(page.error);
  return page.data.rows;
}

async function archive(recordIds: string[]): Promise<void> {
  for (const id of recordIds) {
    const r = await client.schema("custom" as never).rpc("record_delete" as never, {
      p_organization_id: ORG,
      p_record_id: id,
    } as never);
    if (r.error) console.warn(`could not archive ${id}: ${r.error.message}`);
  }
}

describeLive("a table saved or appended to outside the grid lives in its organization's store", () => {
  const made: string[] = [];

  beforeAll(async () => {
    client = createSupabaseClient(URL_, KEY, { auth: { persistSession: false } });
    const signed = await client.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signed.error || !signed.data.user) throw new Error(`sign-in failed: ${signed.error?.message}`);
    userId = signed.data.user.id;
    expect(signed.data.user.email).toBe("admin@admin.com");

    const headers = ["Part", "Supplier", "Qty"];
    const born = await service.createTable({
      tableName: "Rincon Plumbing — Parts on order",
      description: "Parts the office has ordered and is waiting on",
      isPublic: false,
      authenticatedRead: false,
      fields: headers.map((h, i) => ({
        field_name: h.toLowerCase(),
        display_name: h,
        data_type: h === "Qty" ? "number" : "string",
        field_order: i + 1,
        is_required: false,
      })),
      organizationId: ORG,
    });
    if (!born.success || !born.tableId) throw new Error(`could not make the Parts on order table: ${born.error}`);
    PARTS_ON_ORDER = born.tableId;
    made.push(PARTS_ON_ORDER);
    const seeded = await service.bulkWrite({
      tableId: PARTS_ON_ORDER,
      operations: [
        { part: "Rheem 50-gal electric water heater", supplier: "Ferguson Ventura", qty: 1 },
        { part: "3/4 in PEX-A coil (300 ft)", supplier: "Ewing Oxnard", qty: 2 },
        { part: "Delta 1/2 in shower valve cartridge", supplier: "Ferguson Ventura", qty: 5 },
      ].map((data) => ({ op: "insert" as const, data })),
    });
    if (!seeded.success) throw new Error(`could not seed Parts on order: ${seeded.error}`);
    forgetAllTablePlacements();
  });

  afterEach(() => forgetAllTablePlacements());

  afterAll(async () => {
    // Rows first, then their tables (archiving a Table archives what it holds).
    await archive([...made].reverse());
  });

  it("a chat answer saved as a table is born in the record store, rows and all", async () => {
    // The seam every birth outside the grid takes: `service.createTable`, then one `bulkWrite` of the rows.
    const headers = ["Part", "Supplier", "Qty", "For job"];
    const born = await service.createTable({
      tableName: "Rincon Plumbing — Parts received this week",
      description: "From the chat: what came in from suppliers, Sep 22–26",
      isPublic: false,
      authenticatedRead: false,
      fields: headers.map((h, i) => ({
        field_name: h.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        display_name: h,
        data_type: "string",
        field_order: i + 1,
        is_required: false,
      })),
      organizationId: ORG,
    });
    expect(born.error).toBeUndefined();
    expect(born.success).toBe(true);
    const tableId = born.tableId!;
    const written = await service.bulkWrite({
      tableId,
      operations: [
        { part: "3/4 in copper sweat elbow (25-pack)", supplier: "Ferguson Ventura", qty: "4", for_job: "Ojai repipe" },
        { part: "Moen 1222 cartridge", supplier: "Ewing Oxnard", qty: "6", for_job: "Stock" },
        { part: "Uponor 1/2 in ProPEX ring (100)", supplier: "Ferguson Ventura", qty: "2", for_job: "Ojai repipe" },
      ].map((data) => ({ op: "insert" as const, data })),
    });
    expect(written.success ? null : written.error).toBeNull();

    expect(await isCustomTable(tableId)).toBe(true);
    made.push(tableId);

    const rows = await storeRows(tableId);
    expect(rows.map((r) => r.data.part).sort()).toEqual([
      "3/4 in copper sweat elbow (25-pack)",
      "Moen 1222 cartridge",
      "Uponor 1/2 in ProPEX ring (100)",
    ]);
    expect(rows.find((r) => r.data.part === "Moen 1222 cartridge")?.data.for_job).toBe("Stock");
    made.push(...rows.map((r) => r.id));
  });

  it("appending deliveries to a table nobody placed writes the store", async () => {
    const storeBefore = (await storeRows(PARTS_ON_ORDER)).map((r) => r.id);
    forgetAllTablePlacements(); // the append must FIND the table's home itself

    const result = await appendToTable({
      tableId: PARTS_ON_ORDER,
      rows: [
        { Part: "Bradford White 40-gal gas water heater", Supplier: "Ewing Oxnard", Qty: 1 },
        { Part: "SharkBite 1/2 in coupling (10)", Supplier: "Ferguson Ventura", Qty: 3 },
      ],
      mapping: { Part: "part", Supplier: "supplier", Qty: "qty" },
    });
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.inserted).toBe(2);

    const after = await storeRows(PARTS_ON_ORDER);
    const added = after.filter((r) => !storeBefore.includes(r.id));
    expect(added.map((r) => r.data.part).sort()).toEqual([
      "Bradford White 40-gal gas water heater",
      "SharkBite 1/2 in coupling (10)",
    ]);
    made.push(...added.map((r) => r.id));
  });

  it("the save-into pickers offer the table once, with its real row count", async () => {
    const listed = await service.listTablesEverywhere({ organizationId: ORG });
    if (!listed.success) throw new Error(listed.error);
    const parts = listed.data.filter((t) => t.id === PARTS_ON_ORDER);
    expect(parts).toHaveLength(1);
    expect(parts[0]!.row_count).toBe((await storeRows(PARTS_ON_ORDER)).length);
    expect(parts[0]!.row_count).toBeGreaterThan(0);
  });
});
