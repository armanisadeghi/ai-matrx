/**
 * @jest-environment node
 *
 * LIVE (owner ruling 2026-10-03: tests run on live as admin@admin.com). A PROMPT'S @table / @table_row / @table_cell REFERENCE READS THE
 * RECORD STORE (lane INTEG-CLIENTS, CUTOVER-PLAN rev 3 row F10).
 *
 * The real use case: Rincon Plumbing's dispatcher writes a prompt that names the "Service
 * Calls" table and the Stage cell of work order WO-4471. The tech moves the call to
 * "Complete" in the grid (the record store). The chip in the prompt —
 * and so what the agent is told — must say "Complete", and the Customer cell must read the
 * household's name, never a bare record id.
 *
 * The edit is put back when the suite ends.
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
const ENV = { ...envFile("../../../../aidream/.env"), ...envFile("../../../.env"), ...envFile("../../../.env.local") };

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

const URL_ = ENV.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = ENV.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const EMAIL = ENV.AI_ADMIN_USERNAME ?? process.env.AI_ADMIN_USERNAME ?? "";
const PASSWORD = ENV.AI_ADMIN_PASSWORD ?? process.env.AI_ADMIN_PASSWORD ?? "";
const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f"; // admin's Workspace
const SERVICE_CALLS = "dbc7cd48-7b46-4402-ac9d-e459a95f4598"; // "Rincon Plumbing — Service Calls"
const WO_4471 = "cfc72430-2dbf-40d6-980d-f6e5efdeab3d";
const READY = Boolean(URL_ && KEY && EMAIL && PASSWORD);

let client: SupabaseClient;
let userId = "";

jest.mock("@/utils/supabase/client", () => ({
  // A proxy, because some modules read `supabase.auth` at LOAD time, before sign-in.
  supabase: new Proxy({}, { get: (_t, k) => (client as unknown as Record<string | symbol, unknown>)?.[k] }),
  createClient: () => client,
}));
jest.mock("@/lib/organizations/activeOrg", () => ({ getActiveOrgId: () => ORG }));
// The scope resolvers are not under test and their service reads `supabase.auth` at load.
jest.mock("@/features/scopes/service/scopesService", () => ({ scopesService: {} }));
jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: async (id: string | null | undefined) => id ?? ORG,
}));

import { getReferenceResolver } from "../referenceResolvers";
import * as service from "@/features/data-tables/service";
import { forgetAllTablePlacements, placeTableInRecordStore } from "@/features/data-tables/data-source/table-home";

const describeLive = READY ? describe : describe.skip;
if (!READY) {
  // eslint-disable-next-line no-console
  console.warn("[a-reference-to-a-moved-table-reads-the-store] SKIPPED: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (the live database).");
}

async function resolve(type: string, ref: Record<string, string>): Promise<string | null | undefined> {
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

  it("the Stage cell says what the grid says after an edit", async () => {
    const next = before === "Complete" ? "On site" : "Complete";
    await setStage(next);
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
