/**
 * @jest-environment node
 *
 * LIVE, DEV CLONE ONLY. AN ACCEPTED LIST CHANGE ON A MOVED SCOPE TABLE LANDS IN THE RECORD STORE
 * (lane INTEG-CLIENTS, CUTOVER-PLAN rev 3 row F8).
 *
 * The real use case: the repository scope "matrx-frontend (LCP test)" keeps its known-defects list
 * as a template-backed table. An agent proposes adding one defect it found while reviewing the
 * share email; the developer accepts it in the message. admin's Workspace was moved into the record
 * store on the clone and the scope's table moved with it (same id), so the accepted row must be a
 * record of that Table — never a row in the archived older copy, which nothing reads any more.
 *
 * F8 was marked "already the seam" in the plan with no test on a moved table; this is that test.
 * Its failing half is shown by planting the old behavior (the id handed back UNPLACED, as
 * `provisionScopeDataset` did before F11): with `INTEG_PLANT_UNPLACED=1` the write goes to the
 * older door and the assertions fail.
 */
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../../.env.local"), override: false });
dotenv.config({ path: path.resolve(__dirname, "../../../../aidream/.env"), override: false });

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

const URL_ = process.env.GRID_PORT_SUPABASE_URL ?? "";
const KEY = process.env.GRID_PORT_SUPABASE_PUBLISHABLE_KEY ?? "";
const EMAIL = process.env.AI_ADMIN_USERNAME ?? "";
const PASSWORD = process.env.AI_ADMIN_PASSWORD ?? "";
const CLONE_REF = "jxhgzalwckuarngvsdyq";
const ITEM = "f2acc6cd-c4f0-42ac-9cbc-3ceaeed34c40"; // context item "known_defects" (template-backed table)
const SCOPE = "cc6a9ba2-fb83-4ea7-bb56-96b9e4ef4d91"; // scope "matrx-frontend (LCP test)", admin's Workspace
const MOVED_TABLE = "8c67a085-197d-44c0-b2bb-ceeea9555303"; // its instance, moved with the same id
const ADMINS_WORKSPACE = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
const READY = Boolean(URL_ && KEY && EMAIL && PASSWORD);

const holder: { client?: SupabaseClient; userId: string } = { userId: "" };
jest.mock("@/utils/supabase/client", () => {
  const proxy = new Proxy({}, { get: (_t, k) => (holder.client as unknown as Record<string | symbol, unknown>)?.[k] });
  return { supabase: proxy, createClient: () => holder.client };
});
jest.mock("@/utils/auth/getUserId", () => ({
  getUserId: () => holder.userId,
  requireUserId: () => holder.userId,
}));
jest.mock("@/lib/organizations/personalOrg", () => ({
  ensureOrgId: async (id: string | null | undefined) => id,
}));
// THE PLANTED DEFECT (only with INTEG_PLANT_UNPLACED=1): the scope's table id comes back
// UNPLACED, as `provisionScopeDataset` did before F11.
jest.mock("@/features/scopes/service/scopesService", () => {
  const actual = jest.requireActual("@/features/scopes/service/scopesService");
  if (process.env.INTEG_PLANT_UNPLACED !== "1") return actual;
  const { forgetAllTablePlacements: forget } = jest.requireActual("@/features/data-tables/data-source/table-home");
  return {
    ...actual,
    scopesService: {
      ...actual.scopesService,
      provisionScopeDataset: async (item: string, scope: string) => {
        const res = await actual.scopesService.provisionScopeDataset(item, scope);
        forget();
        return res;
      },
    },
  };
});

import { applyListChange, readListTarget } from "../applyListChange";
import { forgetAllTablePlacements } from "@/features/data-tables/data-source/table-home";
import type { ListChangeTarget } from "@/features/content-ir/kinds/list-change-proposal";

function db(): SupabaseClient {
  if (!holder.client) throw new Error("not signed in");
  return holder.client;
}

const describeLive = READY ? describe : describe.skip;
if (!READY) {
  console.warn("[applying-a-proposal-to-a-moved-scope-table] SKIPPED: set GRID_PORT_SUPABASE_URL and GRID_PORT_SUPABASE_PUBLISHABLE_KEY (the dev clone).");
}

const target: ListChangeTarget = {
  kind: "scope_dataset",
  contextItemId: ITEM,
  scopeId: SCOPE,
  label: "Known defects",
};

describeLive("an accepted list change on a moved scope table lands in the record store", () => {
  let written: string | null = null;

  beforeAll(async () => {
    if (!URL_.includes(CLONE_REF)) throw new Error(`refusing to run: ${URL_} is not the dev clone`);
    holder.client = createSupabaseClient(URL_, KEY, { auth: { persistSession: false } });
    const signed = await holder.client.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signed.error || !signed.data.user) throw new Error(`sign-in failed: ${signed.error?.message}`);
    expect(signed.data.user.email).toBe("admin@admin.com");
    holder.userId = signed.data.user.id;
  });

  afterAll(async () => {
    // Archive (soft, reversible) the one record this suite added.
    if (!written || !holder.client) return;
    await holder.client.schema("custom").rpc("record_delete", { p_organization_id: ADMINS_WORKSPACE, p_record_id: written });
  });

  it("adds the accepted defect as a record of the moved Table, and the older copy is untouched", async () => {
    forgetAllTablePlacements();
    const read = await readListTarget(target);
    if (read.status !== "read") throw new Error(`the list did not read: ${read.detail}`);
    const names = read.snapshot.fields.map((f) => f.name);
    expect(names.length).toBeGreaterThan(0);

    // A defect worded the way a reviewer writes one, in the list's own columns.
    expect(names).toEqual(expect.arrayContaining(["title", "detail", "first_seen"]));
    const title = 'Share email named a table "Shared dataset"';
    const values: Record<string, unknown> = {
      title,
      detail: "app/api/sharing/notify had no branch for a table; the link went to /datasets/<id>, which does not exist.",
      area: "sharing",
      severity: "medium",
      status: "fixed",
      first_seen: "2026-09-23",
    };

    const { count: olderBefore } = await db()
      .schema("workbench")
      .from("udt_dataset_rows")
      .select("id", { count: "exact", head: true })
      .eq("table_id", MOVED_TABLE);

    forgetAllTablePlacements();
    const out = await applyListChange(target, {
      id: "p1",
      action: "add",
      title,
      reason: "Found while reviewing the share email for tables.",
      values,
    });
    if (out.status === "applied") written = out.rowId;
    else console.log(`APPLY SAID: ${out.status} — ${out.detail}`); // the store's own words on a refusal
    expect(out.status).toBe("applied");
    expect(written).toBeTruthy();

    const inStore = await db().schema("custom").rpc("read_records_by_ids", {
      p_organization_id: ADMINS_WORKSPACE,
      p_table_id: MOVED_TABLE,
      p_record_ids: [written],
      p_by_id: true,
    });
    expect(((inStore.data ?? []) as unknown[]).length).toBe(1);

    const { count: olderAfter } = await db()
      .schema("workbench")
      .from("udt_dataset_rows")
      .select("id", { count: "exact", head: true })
      .eq("table_id", MOVED_TABLE);
    expect(olderAfter).toBe(olderBefore);
  }, 120_000);
});
