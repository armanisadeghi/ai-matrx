/**
 * @jest-environment node
 *
 * LIVE, DEV CLONE ONLY. THE "SHARED WITH YOU" EMAIL NAMES A TABLE WHEREVER IT LIVES
 * (lane INTEG-CLIENTS, CUTOVER-PLAN rev 3 row F14).
 *
 * The real use case: the Rincon Plumbing office manager shares "Rincon Plumbing — Parts on order"
 * with the warehouse lead. The grid's Share sends `resourceType: "dataset"` (older screen) or
 * `"record"` (record-store screen) to /api/sharing/notify, and the email must say which table and
 * link to it. Before the repoint neither type had a branch: the email said "Shared dataset" /
 * "Shared record" and linked /datasets/<id> or /records/<id> — pages that do not exist.
 *
 * Signed in as admin@admin.com with the publishable key (the route reads as the sharer, never with
 * a service key). Nothing is written.
 */
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../../../.env.local"), override: false });
dotenv.config({ path: path.resolve(__dirname, "../../../../../aidream/.env"), override: false });

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

jest.mock("@/lib/organizations/linkCarriesItsOrganization", () => ({
  // The real helper appends `?org=` for the link's organization; what this suite proves is the
  // TITLE and the PAGE, so the organization is surfaced verbatim for the assertion.
  linkCarriesItsOrganization: async (url: string, org: string | null) => (org ? `${url}#org=${org}` : url),
}));

import { getResourceDetails, type SupabaseServerClient } from "../sharedResourceDetails";

const URL_ = process.env.GRID_PORT_SUPABASE_URL ?? "";
const KEY = process.env.GRID_PORT_SUPABASE_PUBLISHABLE_KEY ?? "";
const EMAIL = process.env.AI_ADMIN_USERNAME ?? "";
const PASSWORD = process.env.AI_ADMIN_PASSWORD ?? "";
const CLONE_REF = "jxhgzalwckuarngvsdyq";
const RINCON = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
/** Moved into the record store by OLD-TABLES-4 (same id; the older copy is archived). */
const PARTS_ON_ORDER = "00d6e9a2-45c4-4e45-af46-431bccb3c51a";
const READY = Boolean(URL_ && KEY && EMAIL && PASSWORD);
const describeLive = READY ? describe : describe.skip;

let client: SupabaseClient;

describeLive("the share email names the table where it lives", () => {
  beforeAll(async () => {
    if (!URL_.includes(CLONE_REF)) throw new Error(`refusing to run: ${URL_} is not the dev clone`);
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.aimatrx.com";
    client = createSupabaseClient(URL_, KEY, { auth: { persistSession: false } });
    const signed = await client.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signed.error || !signed.data.user) throw new Error(`sign-in failed: ${signed.error?.message}`);
    expect(signed.data.user.email).toBe("admin@admin.com");
  });

  it.each(["dataset", "record"])("a moved table shared as %s is named and linked to its page", async (type) => {
    const got = await getResourceDetails(client as unknown as SupabaseServerClient, type, PARTS_ON_ORDER);
    expect(got).toEqual({
      title: "Rincon Plumbing — Parts on order",
      url: `https://www.aimatrx.com/data-v2/${PARTS_ON_ORDER}#org=${RINCON}`,
    });
  });

  it("an older table the sharer can open is named from the older store and opens at /data", async () => {
    // Whatever older dataset admin can still open that the store does NOT hold (the clone moves
    // organizations while lanes work, so the suite finds one rather than naming it).
    const { data: rows } = await client
      .schema("workbench")
      .from("udt_datasets")
      .select("id, table_name, organization_id")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(40);
    let older: { id: string; table_name: string; organization_id: string | null } | null = null;
    for (const r of rows ?? []) {
      const { data: where } = await client.schema("custom").rpc("where_id_opens", { p_id: r.id });
      if (!where) {
        older = r;
        break;
      }
    }
    if (!older) {
      console.log("NO UNMOVED OLDER TABLE VISIBLE TO admin@admin.com ON THE CLONE — older branch not exercised");
      return;
    }
    const got = await getResourceDetails(client as unknown as SupabaseServerClient, "dataset", older.id);
    expect(got).toEqual({
      title: older.table_name,
      url: `https://www.aimatrx.com/data/${older.id}${older.organization_id ? `#org=${older.organization_id}` : ""}`,
    });
  });

  it("an id that is no table the sharer can open names nothing (the route answers 404, no email)", async () => {
    const got = await getResourceDetails(client as unknown as SupabaseServerClient, "dataset", "3f1d2c4b-5a69-4e70-8b1c-2d3e4f5a6b7c");
    expect(got).toBeNull();
  });
});
