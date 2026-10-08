/**
 * @jest-environment node
 *
 * LIVE (owner ruling 2026-10-03: tests run on live as admin@admin.com). THE "SHARED WITH YOU" EMAIL NAMES THE TABLE
 * (lane INTEG-CLIENTS, CUTOVER-PLAN rev 3 row F14).
 *
 * The real use case: the Rincon Plumbing office manager shares "Rincon Plumbing — Parts on order"
 * with the warehouse lead. A share arrives as `resourceType: "record"` (or `"dataset"`, a grant made
 * before the final switch) at /api/sharing/notify, and the email must say which table and link to it.
 *
 * Signed in as admin@admin.com with the publishable key (the route reads as the sharer, never with
 * a service key). The suite makes its own "Parts on order" table first and archives it at the end.
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

let client: SupabaseClient;
let userId = "";
const RINCON = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";

jest.mock("@/lib/organizations/linkCarriesItsOrganization", () => ({
  // The real helper appends `?org=` for the link's organization; what this suite proves is the
  // TITLE and the PAGE, so the organization is surfaced verbatim for the assertion.
  linkCarriesItsOrganization: async (url: string, org: string | null) => (org ? `${url}#org=${org}` : url),
}));

jest.mock("@/utils/supabase/client", () => ({
  supabase: new Proxy({}, { get: (_t, k) => (client as unknown as Record<string | symbol, unknown>)?.[k] }),
  createClient: () => client,
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: async (id: string | null | undefined) => id ?? RINCON,
}));
jest.mock("@/utils/auth/getUserId", () => ({
  getUserId: () => userId,
  requireUserId: () => userId,
}));

import * as dataService from "@/features/data-tables/service";
import { getResourceDetails, type SupabaseServerClient } from "../sharedResourceDetails";

const URL_ = ENV.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = ENV.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const EMAIL = ENV.AI_ADMIN_USERNAME ?? process.env.AI_ADMIN_USERNAME ?? "";
const PASSWORD = ENV.AI_ADMIN_PASSWORD ?? process.env.AI_ADMIN_PASSWORD ?? "";
/** A custom Table, made by this suite's own beforeAll (normal path) and archived in afterAll. */
let PARTS_ON_ORDER = "";
const READY = Boolean(URL_ && KEY && EMAIL && PASSWORD);
const describeLive = READY ? describe : describe.skip;


describeLive("the share email names the table", () => {
  beforeAll(async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.aimatrx.com";
    client = createSupabaseClient(URL_, KEY, { auth: { persistSession: false } });
    const signed = await client.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signed.error || !signed.data.user) throw new Error(`sign-in failed: ${signed.error?.message}`);
    expect(signed.data.user.email).toBe("admin@admin.com");
    userId = signed.data.user.id;

    const born = await dataService.createTable({
      tableName: "Rincon Plumbing — Parts on order",
      description: "Parts the office has ordered and is waiting on",
      isPublic: false,
      authenticatedRead: false,
      fields: ["Part", "Supplier"].map((h, i) => ({
        field_name: h.toLowerCase(),
        display_name: h,
        data_type: "string",
        field_order: i + 1,
        is_required: false,
      })),
      organizationId: RINCON,
    });
    if (!born.success || !born.tableId) throw new Error(`could not make the Parts on order table: ${born.error}`);
    PARTS_ON_ORDER = born.tableId;
  });

  afterAll(async () => {
    if (!PARTS_ON_ORDER) return;
    const r = await client.schema("custom" as never).rpc("record_delete" as never, {
      p_organization_id: RINCON,
      p_record_id: PARTS_ON_ORDER,
    } as never);
    if (r.error) console.warn(`could not archive ${PARTS_ON_ORDER}: ${r.error.message}`);
  });

  it.each(["dataset", "record"])("a table shared as %s is named and linked to its page", async (type) => {
    const got = await getResourceDetails(client as unknown as SupabaseServerClient, type, PARTS_ON_ORDER);
    expect(got).toEqual({
      title: "Rincon Plumbing — Parts on order",
      path: `/data/${PARTS_ON_ORDER}`,
      url: `https://www.aimatrx.com/data/${PARTS_ON_ORDER}#org=${RINCON}`,
    });
  });

  it("an id that is no table the sharer can open names nothing (the route answers 404, no email)", async () => {
    const got = await getResourceDetails(client as unknown as SupabaseServerClient, "dataset", "3f1d2c4b-5a69-4e70-8b1c-2d3e4f5a6b7c");
    expect(got).toBeNull();
  });
});
