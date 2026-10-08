/**
 * @jest-environment node
 *
 * LIVE (owner ruling 2026-10-03: tests run on live as admin@admin.com). A MOVED ORGANIZATION'S SCOPE TABLE IS ITS CUSTOM TABLE
 * (lane INTEG-CLIENTS, CUTOVER-PLAN rev 3 rows F11 / D5).
 *
 * The real use case: a repository scope ("matrx-frontend") keeps its "known defects" list as a
 * table provisioned from a template; an agent proposes a change to that list and the person
 * approves it (the list-change engine reads and writes the scope's table). admin's Workspace
 * was moved into the record store, and the scope's table moved with it (same id).
 *
 * RED before the repoint: `provisionScopeDataset` asked the OLDER store's
 * `context.provision_scope_dataset`, got the id back UNPLACED, and the engine's next read went
 * to the archived older copy. GREEN after: the id is the moved Table, placed in the record
 * store, and a read of it comes from the store.
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
const PRE_MOVE_TABLE = "8c67a085-197d-44c0-b2bb-ceeea9555303"; // its instance, moved with the same id
const READY = Boolean(URL_ && KEY && EMAIL && PASSWORD);

const holder: { client?: SupabaseClient; userId: string } = { userId: "" };
jest.mock("@/utils/supabase/client", () => {
  // A module read at LOAD time (`supabase.auth` in lib/supabase/authRetry) sees the proxy; every
  // call after sign-in reaches the signed-in client.
  const proxy = new Proxy({}, { get: (_t, k) => (holder.client as unknown as Record<string | symbol, unknown>)?.[k] });
  return { supabase: proxy, createClient: () => holder.client };
});
jest.mock("@/utils/auth/getUserId", () => ({
  getUserId: () => holder.userId,
  requireUserId: () => holder.userId,
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: async (id: string | null | undefined) => id,
}));

import { scopesService } from "../service/scopesService";
import { isScopesRpcErr } from "../types";
import * as service from "@/features/data-tables/service";
import { forgetAllTablePlacements, recordStoreHomeOf } from "@/features/data-tables/data-source/table-home";

const describeLive = READY ? describe : describe.skip;
if (!READY) {
  // eslint-disable-next-line no-console
  console.warn("[a-moved-organizations-scope-table-lives-in-the-store] SKIPPED: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (the live database).");
}

describeLive("a moved organization's scope table is its custom Table", () => {
  beforeAll(async () => {
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

    // The scope's table is placed in the record store by the scope service itself.
    expect(recordStoreHomeOf(tableId)).not.toBeNull();
    const table = await service.getCompleteTable({ tableId });
    expect(table.success).toBe(true);

    // And it is the same answer twice (idempotent), never a second table.
    forgetAllTablePlacements();
    const again = await scopesService.provisionScopeDataset(ITEM, SCOPE);
    if (isScopesRpcErr(again)) throw new Error(again.error.message);
    expect(again.data.datasetId).toBe(tableId);
  });
});
