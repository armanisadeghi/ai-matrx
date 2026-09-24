/**
 * @jest-environment node
 *
 * LIVE, DEV CLONE ONLY. EVERY "SAVE THIS AS A TABLE" AND "APPEND TO A TABLE" OUTSIDE THE
 * GRID REACHES THE STORE THE ORGANIZATION'S TABLES LIVE IN (lane INTEG-CLIENTS,
 * CUTOVER-PLAN rev 3 rows F4, F5, F6).
 *
 * The real use case: Rincon Plumbing (admin's Workspace on the clone, whose tables
 * OLD-TABLES-4 moved into the record store) asks the chat what parts came in this week,
 * then clicks "Save as table" on the answer — and, the next morning, appends two more
 * deliveries to the "Parts on order" table it already keeps.
 *
 * RED before the repoint: `createDatasetFromTable` called `create_new_user_table_dynamic`,
 * so the new table was a `workbench.udt_datasets` row the organization's screens no longer
 * read; and `appendToTable` reached the seam UNPLACED, so the two deliveries were written
 * into the archived older copy of "Parts on order" and reported as saved.
 * GREEN after: the table is a record-store Table (no older row with its id), its rows are
 * readable through the seam, and the appended rows are records of the moved Table while
 * the archived older copy is untouched.
 *
 * Needs GRID_PORT_SUPABASE_URL + GRID_PORT_SUPABASE_PUBLISHABLE_KEY (the clone — the
 * suite refuses any other project) and AI_ADMIN_USERNAME / AI_ADMIN_PASSWORD. Without them
 * it is SKIPPED, loudly. Everything it writes it archives again (never deletes).
 */
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../../../.env"), override: false });
dotenv.config({ path: path.resolve(__dirname, "../../../../../aidream/.env"), override: false });

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

const URL_ = process.env.GRID_PORT_SUPABASE_URL ?? "";
const KEY = process.env.GRID_PORT_SUPABASE_PUBLISHABLE_KEY ?? "";
const EMAIL = process.env.AI_ADMIN_USERNAME ?? "";
const PASSWORD = process.env.AI_ADMIN_PASSWORD ?? "";
const CLONE_REF = "jxhgzalwckuarngvsdyq";
const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f"; // admin's Workspace — moved on the clone
const PARTS_ON_ORDER = "00d6e9a2-45c4-4e45-af46-431bccb3c51a"; // "Rincon Plumbing — Parts on order", moved
const READY = Boolean(URL_ && KEY && EMAIL && PASSWORD);

let client: SupabaseClient;
let userId = "";

jest.mock("@/utils/supabase/client", () => ({
  get supabase() {
    return client;
  },
  createClient: () => client,
}));
// The active organization is UI state (the org picker); the suite acts in admin's Workspace.
jest.mock("@/lib/organizations/personalOrg", () => ({
  ensureOrgId: async (id: string | null | undefined) => id ?? ORG,
}));
// `resolveUniqueDatasetName` reads the signed-in id from the Redux session.
jest.mock("@/utils/auth/getUserId", () => ({
  getUserId: () => userId,
  requireUserId: () => userId,
}));

import { createDatasetFromTable } from "../../create-dataset-from-table";
import { appendToTable } from "../../save-to-table";
import * as service from "../../service";
import { forgetAllTablePlacements, placeTableInRecordStore } from "../table-home";

const describeLive = READY ? describe : describe.skip;
if (!READY) {
  // eslint-disable-next-line no-console
  console.warn(
    "[a-table-saved-outside-the-grid-lives-in-the-store] SKIPPED: set GRID_PORT_SUPABASE_URL, GRID_PORT_SUPABASE_PUBLISHABLE_KEY, AI_ADMIN_USERNAME and AI_ADMIN_PASSWORD to run it against the dev clone.",
  );
}

async function kernelId(): Promise<string> {
  const k = await client.schema("custom" as never).rpc("table_kernel_id" as never);
  if (k.error || typeof k.data !== "string") throw new Error(`table_kernel_id: ${k.error?.message}`);
  return k.data;
}

async function isStoreTable(id: string): Promise<boolean> {
  const found = await client.schema("custom" as never).rpc("read_records_by_ids" as never, {
    p_organization_id: ORG,
    p_table_id: await kernelId(),
    p_record_ids: [id],
  } as never);
  if (found.error) throw new Error(found.error.message);
  return ((found.data ?? []) as Array<{ id: string }>).some((r) => r.id === id);
}

async function olderRowCount(tableId: string): Promise<number> {
  const { count, error } = await client
    .schema("workbench" as never)
    .from("udt_dataset_rows" as never)
    .select("id", { count: "exact", head: true })
    .eq("table_id", tableId);
  if (error) throw new Error(error.message);
  return count ?? 0;
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
    if (!URL_.includes(CLONE_REF)) throw new Error(`refusing to run: ${URL_} is not the dev clone (${CLONE_REF})`);
    client = createSupabaseClient(URL_, KEY, { auth: { persistSession: false } });
    const signed = await client.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signed.error || !signed.data.user) throw new Error(`sign-in failed: ${signed.error?.message}`);
    userId = signed.data.user.id;
    expect(signed.data.user.email).toBe("admin@admin.com");
  });

  afterEach(() => forgetAllTablePlacements());

  afterAll(async () => {
    // Rows first, then their tables (archiving a Table archives what it holds).
    await archive([...made].reverse());
  });

  it("a chat answer saved as a table is born in the record store, rows and all", async () => {
    const result = await createDatasetFromTable({
      name: "Rincon Plumbing — Parts received this week",
      description: "From the chat: what came in from suppliers, Sep 22–26",
      headers: ["Part", "Supplier", "Qty", "For job"],
      rows: [
        { Part: "3/4 in copper sweat elbow (25-pack)", Supplier: "Ferguson Ventura", Qty: "4", "For job": "Ojai repipe" },
        { Part: "Moen 1222 cartridge", Supplier: "Ewing Oxnard", Qty: "6", "For job": "Stock" },
        { Part: "Uponor 1/2 in ProPEX ring (100)", Supplier: "Ferguson Ventura", Qty: "2", "For job": "Ojai repipe" },
      ],
      organizationId: ORG,
    });
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.inserted).toBe(3);
    const tableId = result.tableId!;

    // RED before the repoint: this was a `workbench.udt_datasets` row.
    expect(await isStoreTable(tableId)).toBe(true);
    made.push(tableId);
    const older = await client
      .schema("workbench" as never)
      .from("udt_datasets" as never)
      .select("id")
      .eq("id", tableId);
    expect(older.data ?? []).toHaveLength(0);

    const rows = await storeRows(tableId);
    expect(rows.map((r) => r.data.part).sort()).toEqual([
      "3/4 in copper sweat elbow (25-pack)",
      "Moen 1222 cartridge",
      "Uponor 1/2 in ProPEX ring (100)",
    ]);
    expect(rows.find((r) => r.data.part === "Moen 1222 cartridge")?.data.for_job).toBe("Stock");
    made.push(...rows.map((r) => r.id));
  });

  it("appending deliveries to a moved table writes the store, never the archived older copy", async () => {
    const olderBefore = await olderRowCount(PARTS_ON_ORDER);
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

    // RED before the repoint: the older copy grew by two and the store did not.
    expect(await olderRowCount(PARTS_ON_ORDER)).toBe(olderBefore);
    const after = await storeRows(PARTS_ON_ORDER);
    const added = after.filter((r) => !storeBefore.includes(r.id));
    expect(added.map((r) => r.data.part).sort()).toEqual([
      "Bradford White 40-gal gas water heater",
      "SharkBite 1/2 in coupling (10)",
    ]);
    made.push(...added.map((r) => r.id));
  });

  it("the save-into pickers offer a moved table once, from the store, with its real row count", async () => {
    const listed = await service.listTablesEverywhere({ organizationId: ORG });
    if (!listed.success) throw new Error(listed.error);
    const parts = listed.data.filter((t) => t.id === PARTS_ON_ORDER);
    expect(parts).toHaveLength(1);
    expect(parts[0]!.row_count).toBe((await storeRows(PARTS_ON_ORDER)).length);
    expect(parts[0]!.row_count).toBeGreaterThan(0);
  });

  it("an organization whose tables have not moved keeps its births and its tables in the older store", async () => {
    // The clone moves organizations as lanes work, so the unmoved organization is FOUND, not named:
    // the first organization holding a live older dataset admin can reach whose tables have not moved.
    const where = await import("../where-a-table-is-born");
    const { data } = await client
      .schema("workbench" as never)
      .from("udt_datasets" as never)
      .select("id, organization_id")
      .is("deleted_at", null)
      .neq("organization_id", ORG)
      .limit(200);
    let proved = false;
    for (const row of (data ?? []) as Array<{ id: string; organization_id: string }>) {
      const born = await where.whereANewTableIsBorn(row.organization_id);
      if (!born.ok || born.store !== "older") continue;
      const located = await where.locateTable(row.id, row.organization_id);
      if (!located.ok) continue; // not a member there: the store will not answer for it
      expect(born).toEqual({ ok: true, store: "older", organizationId: row.organization_id });
      expect(located).toEqual({ ok: true, store: "older" });
      expect(service.isRecordStoreTable(row.id)).toBe(false);
      proved = true;
      break;
    }
    if (!proved) console.warn("no unmoved organization with a reachable older table on the clone; the older arm was not exercised");
    // And the moved organization answers the other way, always.
    const moved = await where.whereANewTableIsBorn(ORG);
    expect(moved.ok && moved.store).toBe("record");
  });
});
