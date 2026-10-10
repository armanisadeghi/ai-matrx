/**
 * @jest-environment node
 *
 * LIVE (owner ruling 2026-10-03: tests run on live as admin@admin.com). AN ACCEPTED LIST CHANGE ON A MOVED SCOPE TABLE LANDS IN THE RECORD STORE
 * (lane INTEG-CLIENTS, CUTOVER-PLAN rev 3 row F8).
 *
 * The real use case: the repository scope "matrx-frontend (LCP test)" keeps its known-defects list
 * as a template-backed table. An agent proposes adding one defect it found while reviewing the
 * share email; the developer accepts it in the message. The scope's table lives in the record store
 * (same id), so the accepted row must be a record of that Table, found by the seam with no
 * placement handed in.
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
const ITEM = "f2acc6cd-c4f0-42ac-9cbc-3ceaeed34c40"; // context item "known_defects" (template-backed table)
const SCOPE = "cc6a9ba2-fb83-4ea7-bb56-96b9e4ef4d91"; // scope "matrx-frontend (LCP test)", admin's Workspace
const MOVED_TABLE = "8c67a085-197d-44c0-b2bb-ceeea9555303"; // its instance, moved with the same id
const ADMINS_WORKSPACE = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
const READY = Boolean(URL_ && KEY && EMAIL && PASSWORD);

const holder: { client?: SupabaseClient; userId: string } = { userId: "" };
jest.mock("@/utils/supabase/client", () => {
  const proxy = (require("@/tests/helpers/liveSupabaseProxy") as typeof import("@/tests/helpers/liveSupabaseProxy")).liveSupabaseProxy(holder);
  return { supabase: proxy, createClient: () => holder.client };
});
jest.mock("@/utils/auth/getUserId", () => ({
  getUserId: () => holder.userId,
  requireUserId: () => holder.userId,
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: async (id: string | null | undefined) => id,
}));
import { applyListChange, readListTarget } from "../applyListChange";
import { forgetAllTablePlacements } from "@/features/data-tables/data-source/table-home";
import type { ListChangeTarget } from "@/features/content-ir/kinds/list-change-proposal";

function db(): SupabaseClient {
  if (!holder.client) throw new Error("not signed in");
  return holder.client;
}

const describeLive = READY ? describe : describe.skip;
if (!READY) {
  console.warn("[applying-a-proposal-to-a-moved-scope-table] SKIPPED: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (the live database).");
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

  it("adds the accepted defect as a record of the Table", async () => {
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
  }, 120_000);
});
