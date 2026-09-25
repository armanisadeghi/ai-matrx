/**
 * @jest-environment node
 *
 * LIVE, DEV CLONE ONLY (no pg_net, no active cron there: nothing is delivered anywhere).
 * A RECORD-STORE TABLE'S CHANGES ARE SUBSCRIBED FROM THE WEBHOOKS SCREEN (lane INTEG-CLIENTS,
 * CUTOVER-PLAN rev 3 row F19; the door is GRID-PRIMITIVES G4).
 *
 * The real use case: Rincon Plumbing sends every change to its "Service Calls" table to its
 * dispatch board's HTTPS endpoint. Before the repoint the webhooks screen offered only the older
 * store's `row.*` events, which a moved table never emits — the webhook would never fire. Now the
 * screen declares a webhook for the TABLE, and a change to one of its records becomes exactly the
 * activity row the dispatcher delivers.
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
const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
const SERVICE_CALLS = "dbc7cd48-7b46-4402-ac9d-e459a95f4598";
const WO_4471 = "cfc72430-2dbf-40d6-980d-f6e5efdeab3d";
const READY = Boolean(URL_ && KEY && EMAIL && PASSWORD);

let client: SupabaseClient;
jest.mock("@/utils/supabase/client", () => ({
  supabase: new Proxy({}, { get: (_t, k) => (client as unknown as Record<string | symbol, unknown>)?.[k] }),
  createClient: () => client,
}));

import { declareTableWebhook } from "../service";

const describeLive = READY ? describe : describe.skip;

describeLive("a record-store table's changes reach the webhook declared for it", () => {
  let webhookId = "";

  beforeAll(async () => {
    if (!URL_.includes(CLONE_REF)) throw new Error(`refusing to run: ${URL_} is not the dev clone`);
    client = createSupabaseClient(URL_, KEY, { auth: { persistSession: false } });
    const signed = await client.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signed.error || !signed.data.user) throw new Error(`sign-in failed: ${signed.error?.message}`);
    expect(signed.data.user.email).toBe("admin@admin.com");
  });

  afterAll(async () => {
    if (webhookId) {
      await client.schema("custom").rpc("table_webhook_archive", { p_organization_id: ORG, p_webhook_id: webhookId });
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
    const since = new Date().toISOString();
    const write = (stage: string) =>
      client.schema("custom").rpc("record_update", {
        p_organization_id: ORG,
        p_record_id: WO_4471,
        p_patch: { stage },
      });
    const changed = await write(before === "Complete" ? "On site" : "Complete");
    await write(before);
    // The store logs the change for the dispatcher only because this table now has a webhook.
    const logged = await client
      .schema("platform")
      .from("activity_log")
      .select("action, entity_type")
      .eq("entity_id", WO_4471)
      .gte("occurred_at", since);
    if (changed.error) throw new Error(changed.error.message);
    expect(logged.error).toBeNull();
    expect((logged.data ?? []).some((r) => r.action === "record.updated" && r.entity_type === `record:${SERVICE_CALLS}`)).toBe(true);
  });
});
