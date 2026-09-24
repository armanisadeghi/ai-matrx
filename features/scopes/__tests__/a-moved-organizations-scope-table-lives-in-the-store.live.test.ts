/**
 * @jest-environment node
 *
 * LIVE, DEV CLONE ONLY. A MOVED ORGANIZATION'S SCOPE TABLE IS ITS RECORD-STORE TABLE
 * (lane INTEG-CLIENTS, CUTOVER-PLAN rev 3 rows F11 / D5).
 *
 * The real use case: a repository scope ("matrx-frontend") keeps its "known defects" list as a
 * table provisioned from a template; an agent proposes a change to that list and the person
 * approves it (the list-change engine reads and writes the scope's table). admin's Workspace
 * was moved into the record store on the clone, and the scope's table moved with it (same id).
 *
 * RED before the repoint: `provisionScopeDataset` asked the OLDER store's
 * `context.provision_scope_dataset`, got the id back UNPLACED, and the engine's next read went
 * to the archived older copy. GREEN after: the id is the moved Table, placed in the record
 * store, and a read of it comes from the store.
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
const ITEM = "f2acc6cd-c4f0-42ac-9cbc-3ceaeed34c40"; // context item "known_defects" (template-backed table)
const SCOPE = "cc6a9ba2-fb83-4ea7-bb56-96b9e4ef4d91"; // scope "matrx-frontend (LCP test)", admin's Workspace
const PRE_MOVE_TABLE = "8c67a085-197d-44c0-b2bb-ceeea9555303"; // its instance, moved with the same id
const READY = Boolean(URL_ && KEY && EMAIL && PASSWORD);

const holder: { client?: SupabaseClient; userId: string } = { userId: "" };
jest.mock("@/utils/supabase/client", () => {
  // A module read at LOAD time (`supabase.auth` in lib/supabase/authRetry) sees the proxy; every
  // call after sign-in reaches the signed-in clone client.
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

import { scopesService } from "../service/scopesService";
import { isScopesRpcErr } from "../types";
import * as service from "@/features/data-tables/service";
import { forgetAllTablePlacements } from "@/features/data-tables/data-source/table-home";

const describeLive = READY ? describe : describe.skip;
if (!READY) {
  // eslint-disable-next-line no-console
  console.warn("[a-moved-organizations-scope-table-lives-in-the-store] SKIPPED: set GRID_PORT_SUPABASE_URL and GRID_PORT_SUPABASE_PUBLISHABLE_KEY (the dev clone).");
}

describeLive("a moved organization's scope table is its record-store Table", () => {
  beforeAll(async () => {
    if (!URL_.includes(CLONE_REF)) throw new Error(`refusing to run: ${URL_} is not the dev clone`);
    holder.client = createSupabaseClient(URL_, KEY, { auth: { persistSession: false } });
    const signed = await holder.client.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signed.error || !signed.data.user) throw new Error(`sign-in failed: ${signed.error?.message}`);
    expect(signed.data.user.email).toBe("admin@admin.com");
    holder.userId = signed.data.user.id;
  });

  afterEach(() => forgetAllTablePlacements());

  it("provisioning answers the moved Table, placed, and its rows read from the store", async () => {
    forgetAllTablePlacements();
    const res = await scopesService.provisionScopeDataset(ITEM, SCOPE);
    if (isScopesRpcErr(res)) throw new Error(res.error.message);
    const tableId = res.data.datasetId;
    // The scope was provisioned BEFORE the move: the answer is that same table, now in the store.
    expect(tableId).toBe(PRE_MOVE_TABLE);

    // RED before the repoint: unplaced, so the engine read the archived older copy.
    expect(service.isRecordStoreTable(tableId)).toBe(true);
    const table = await service.getCompleteTable({ tableId });
    expect(table.success).toBe(true);

    // And it is the same answer twice (idempotent), never a second table.
    forgetAllTablePlacements();
    const again = await scopesService.provisionScopeDataset(ITEM, SCOPE);
    if (isScopesRpcErr(again)) throw new Error(again.error.message);
    expect(again.data.datasetId).toBe(tableId);
  });
});
