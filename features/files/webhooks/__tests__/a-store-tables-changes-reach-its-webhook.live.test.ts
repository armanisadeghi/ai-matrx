/**
 * @jest-environment node
 *
 * LIVE (owner ruling 2026-10-03: tests run on live as admin@admin.com). The webhook
 * targets a reserved `.example` host, so a delivery attempt reaches nobody.
 * A CUSTOM TABLE'S CHANGES ARE SUBSCRIBED FROM THE WEBHOOKS SCREEN (lane INTEG-CLIENTS,
 * CUTOVER-PLAN rev 3 row F19; the door is GRID-PRIMITIVES G4).
 *
 * The real use case: Rincon Plumbing sends every change to its "Service Calls" table to its
 * dispatch board's HTTPS endpoint. Before the repoint the webhooks screen offered only the older
 * store's `row.*` events, which a moved table never emits — the webhook would never fire. Now the
 * screen declares a webhook for the TABLE, and a change to one of its records becomes exactly the
 * activity row the dispatcher delivers.
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
const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
// Made by this suite's own beforeAll through the product's normal path (createTable + bulkWrite)
// and archived in afterAll — never a clone-era id.
let SERVICE_CALLS = "";
let WO_4471 = "";
let userId = "";
const READY = Boolean(URL_ && KEY && EMAIL && PASSWORD);

let client: SupabaseClient;
jest.mock("@/utils/supabase/client", () => ({
  supabase: new Proxy({}, { get: (_t, k) => (client as unknown as Record<string | symbol, unknown>)?.[k] }),
  createClient: () => client,
}));

jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: async (id: string | null | undefined) => id ?? ORG,
}));
jest.mock("@/utils/auth/getUserId", () => ({
  getUserId: () => userId,
  requireUserId: () => userId,
}));

import * as dataService from "@/features/data-tables/service";
import { forgetAllTablePlacements, placeTableInRecordStore } from "@/features/data-tables/data-source/table-home";
import { declareTableWebhook, listDeliveries } from "../service";

const describeLive = READY ? describe : describe.skip;

describeLive("a custom table's changes reach the webhook declared for it", () => {
  let webhookId = "";

  beforeAll(async () => {
    client = createSupabaseClient(URL_, KEY, { auth: { persistSession: false } });
    const signed = await client.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signed.error || !signed.data.user) throw new Error(`sign-in failed: ${signed.error?.message}`);
    expect(signed.data.user.email).toBe("admin@admin.com");
    userId = signed.data.user.id;

    const born = await dataService.createTable({
      tableName: "Rincon Plumbing — Service calls",
      description: "Open and finished service calls on the dispatch board",
      isPublic: false,
      authenticatedRead: false,
      fields: [
        ["Work order", "string"],
        ["Customer", "string"],
        ["Stage", "string"],
      ].map(([h, type], i) => ({
        field_name: h.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        display_name: h,
        data_type: type,
        field_order: i + 1,
        is_required: false,
      })),
      organizationId: ORG,
    });
    if (!born.success || !born.tableId) throw new Error(`could not make the Service calls table: ${born.error}`);
    SERVICE_CALLS = born.tableId;
    const written = await dataService.bulkWrite({
      tableId: SERVICE_CALLS,
      operations: [
        { work_order: "WO-4471", customer: "Marisol Duarte — Ojai", stage: "Scheduled" },
        { work_order: "WO-4472", customer: "Kern Valley Dental — Oxnard", stage: "On site" },
      ].map((data) => ({ op: "insert" as const, data })),
    });
    if (!written.success) throw new Error(`could not seed Service calls: ${written.error}`);
    forgetAllTablePlacements();
    placeTableInRecordStore(SERVICE_CALLS, { organizationId: ORG, userId });
    const page = await dataService.getTablePage({ tableId: SERVICE_CALLS, limit: 50, offset: 0 });
    if (!page.success) throw new Error(page.error);
    WO_4471 = page.data.rows.find((r) => r.data.work_order === "WO-4471")!.id;
  });

  afterAll(async () => {
    if (webhookId) {
      await client.schema("custom").rpc("table_webhook_archive", { p_organization_id: ORG, p_webhook_id: webhookId });
    }
    // Rows first, then the table (archiving a Table archives what it holds).
    for (const id of [WO_4471, SERVICE_CALLS].filter(Boolean)) {
      const r = await client.schema("custom" as never).rpc("record_delete" as never, {
        p_organization_id: ORG,
        p_record_id: id,
      } as never);
      if (r.error) console.warn(`could not archive ${id}: ${r.error.message}`);
    }
  });

  it("declares the webhook for the table, and a record change is logged for delivery", async () => {
    const made = await declareTableWebhook({
      organizationId: ORG,
      tableId: SERVICE_CALLS,
      targetUrl: "https://dispatch.rinconplumbing.example/hooks/service-calls",
      events: ["record.updated"],
      description: "Dispatch board — service call changes",
    });
    webhookId = made.webhookId;
    expect(made.secret.length).toBeGreaterThan(20);

    const listed = await client.schema("custom").rpc("table_webhooks", { p_organization_id: ORG, p_table_id: SERVICE_CALLS });
    expect(JSON.stringify(listed.data)).toContain(made.webhookId);
    expect(JSON.stringify(listed.data)).not.toContain(made.secret);

    // A change to one of the table's records (put back right after).
    const read = await client.schema("custom").rpc("read_records_by_ids", {
      p_organization_id: ORG,
      p_table_id: SERVICE_CALLS,
      p_record_ids: [WO_4471],
    });
    const before = ((read.data ?? []) as Array<{ document: Record<string, unknown> }>)[0]?.document?.stage as string;
    const write = (stage: string) =>
      client.schema("custom").rpc("record_update", {
        p_organization_id: ORG,
        p_record_id: WO_4471,
        p_patch: { stage },
      });
    const changed = await write(before === "Complete" ? "On site" : "Complete");
    await write(before);
    if (changed.error) throw new Error(changed.error.message);
    // The activity log itself is the admin apps' (a person cannot read it), so the proof a person
    // can see is the one that matters: the platform's dispatcher files a delivery of the change
    // for THIS table's webhook. It runs on a short tick, so the suite waits for it.
    let deliveries: Awaited<ReturnType<typeof listDeliveries>> = [];
    for (let i = 0; i < 24 && deliveries.length === 0; i += 1) {
      await new Promise((r) => setTimeout(r, 5000));
      deliveries = await listDeliveries(webhookId);
    }
    // The webhook belongs to this one table, so a delivery IS a logged change of its records
    // (the suite made two: the change and its put-back), each tied to its activity-log row.
    expect(deliveries.length).toBeGreaterThanOrEqual(1);
    expect(deliveries.every((d) => d.activity_log_id != null)).toBe(true);
  }, 180_000);
});
