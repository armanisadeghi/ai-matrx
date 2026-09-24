/**
 * @jest-environment node
 *
 * LIVE, DEV CLONE ONLY. A PROMPT'S @table / @table_row / @table_cell REFERENCE TO A MOVED
 * TABLE READS THE RECORD STORE, NOT THE ARCHIVED OLDER COPY (lane INTEG-CLIENTS,
 * CUTOVER-PLAN rev 3 row F10).
 *
 * The real use case: Rincon Plumbing's dispatcher writes a prompt that names the "Service
 * Calls" table and the Stage cell of work order WO-4471. The tech moves the call to
 * "Complete" in the grid (the record store, since the table moved). The chip in the prompt —
 * and so what the agent is told — must say "Complete", and the Customer cell must read the
 * household's name, never a bare record id.
 *
 * RED before the repoint: the resolver read `workbench.udt_dataset_rows`, the archived copy
 * the move left behind, so the cell still said "On site" after the edit. GREEN after.
 * The edit is put back when the suite ends.
 */
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../../.env"), override: false });
dotenv.config({ path: path.resolve(__dirname, "../../../../aidream/.env"), override: false });

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

const URL_ = process.env.GRID_PORT_SUPABASE_URL ?? "";
const KEY = process.env.GRID_PORT_SUPABASE_PUBLISHABLE_KEY ?? "";
const EMAIL = process.env.AI_ADMIN_USERNAME ?? "";
const PASSWORD = process.env.AI_ADMIN_PASSWORD ?? "";
const CLONE_REF = "jxhgzalwckuarngvsdyq";
const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f"; // admin's Workspace — moved on the clone
const SERVICE_CALLS = "dbc7cd48-7b46-4402-ac9d-e459a95f4598"; // "Rincon Plumbing — Service Calls"
const WO_4471 = "cfc72430-2dbf-40d6-980d-f6e5efdeab3d";
const READY = Boolean(URL_ && KEY && EMAIL && PASSWORD);

let client: SupabaseClient;
let userId = "";

jest.mock("@/utils/supabase/client", () => ({
  get supabase() {
    return client;
  },
  createClient: () => client,
}));
jest.mock("@/lib/organizations/activeOrg", () => ({ getActiveOrgId: () => ORG }));
// The scope resolvers are not under test and their service reads `supabase.auth` at load.
jest.mock("@/features/scopes/service/scopesService", () => ({ scopesService: {} }));
jest.mock("@/lib/organizations/personalOrg", () => ({
  ensureOrgId: async (id: string | null | undefined) => id ?? ORG,
}));

import { getReferenceResolver } from "../referenceResolvers";
import * as service from "@/features/data-tables/service";
import { forgetAllTablePlacements, placeTableInRecordStore } from "@/features/data-tables/data-source/table-home";

const describeLive = READY ? describe : describe.skip;
if (!READY) {
  // eslint-disable-next-line no-console
  console.warn("[a-reference-to-a-moved-table-reads-the-store] SKIPPED: set GRID_PORT_SUPABASE_URL and GRID_PORT_SUPABASE_PUBLISHABLE_KEY (the dev clone).");
}

async function resolve(type: string, ref: Record<string, string>): Promise<string | undefined> {
  forgetAllTablePlacements(); // the resolver must find the table's home itself
  const resolver = getReferenceResolver(type);
  if (!resolver) throw new Error(`no resolver for ${type}`);
  return resolver.resolveValue(client, ref);
}

async function setStage(stage: string): Promise<void> {
  forgetAllTablePlacements();
  placeTableInRecordStore(SERVICE_CALLS, { organizationId: ORG, userId });
  const written = await service.upsertCell({ tableId: SERVICE_CALLS, rowId: WO_4471, fieldName: "stage", value: stage });
  if (!written.success) throw new Error(`could not set stage: ${written.error}`);
}

describeLive("a reference to a moved table reads the record store", () => {
  let before = "";

  beforeAll(async () => {
    if (!URL_.includes(CLONE_REF)) throw new Error(`refusing to run: ${URL_} is not the dev clone`);
    client = createSupabaseClient(URL_, KEY, { auth: { persistSession: false } });
    const signed = await client.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signed.error || !signed.data.user) throw new Error(`sign-in failed: ${signed.error?.message}`);
    expect(signed.data.user.email).toBe("admin@admin.com");
    userId = signed.data.user.id;
    before = (await resolve("table_cell", { table_id: SERVICE_CALLS, row_id: WO_4471, column_name: "stage" })) ?? "";
  });

  afterAll(async () => {
    if (before) await setStage(before);
    forgetAllTablePlacements();
  });

  it("the Stage cell says what the grid says after an edit, not the archived copy", async () => {
    const next = before === "Complete" ? "On site" : "Complete";
    await setStage(next);
    // RED before the repoint: this read the archived older row and still said the old stage.
    expect(await resolve("table_cell", { table_id: SERVICE_CALLS, row_id: WO_4471, column_name: "stage" })).toBe(next);
  });

  it("the Customer cell reads the household's name, never a record id", async () => {
    const customer = await resolve("table_cell", { table_id: SERVICE_CALLS, row_id: WO_4471, column_name: "customer" });
    expect(customer).toBe("Maria Delgado");
  });

  it("the table, its schema and a row preview come from the store", async () => {
    expect(await resolve("table", { table_id: SERVICE_CALLS })).toBe("Rincon Plumbing — Service Calls");
    const schema = await resolve("table_schema", { table_id: SERVICE_CALLS });
    expect(schema).toContain("Rincon Plumbing — Service Calls");
    expect(schema).toContain("Work order");
    const row = await resolve("table_row", { table_id: SERVICE_CALLS, row_id: WO_4471 });
    expect(row).toContain("WO-4471");
  });
});
