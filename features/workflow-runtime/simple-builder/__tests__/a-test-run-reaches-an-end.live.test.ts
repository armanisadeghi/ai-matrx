/**
 * @jest-environment node
 *
 * LIVE (owner ruling 2026-10-03: tests run on live as admin@admin.com). "TEST WITH A RECORD"
 * NEVER SITS QUEUED: the run it starts reaches an end (or a sentence-bearing wait) within
 * seconds, and its real step writes the real record.
 *
 * The use case: a home-health intake desk keeps "Referrals" (title + Status) and "Visits".
 * Its Workflow: when a Referral's Status becomes Scheduled, create a Visit for it, then notify
 * the coordinator. The coordinator tests it on Maria Delgado's referral and reads the run.
 *
 * Talks to the live database (sign-in, tables, records) and the live server
 * (`/workflow-builder/*`). Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
 * NEXT_PUBLIC_BACKEND_URL_PROD and AI_ADMIN_USERNAME / AI_ADMIN_PASSWORD — SKIPPED loudly
 * without them. Everything it makes it archives again (never deletes).
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

function envFile(rel: string): Record<string, string> {
  const file = path.resolve(__dirname, rel);
  return fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
}
const ENV = {
  ...envFile("../../../../../aidream/.env"),
  ...envFile("../../../../.env"),
  ...envFile("../../../../.env.local"),
};

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

const URL_ = ENV.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = ENV.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const SERVER = process.env.MATRX_TEST_SERVER ?? ENV.NEXT_PUBLIC_BACKEND_URL_PROD ?? "";
const EMAIL = ENV.AI_ADMIN_USERNAME ?? process.env.AI_ADMIN_USERNAME ?? "";
const PASSWORD = ENV.AI_ADMIN_PASSWORD ?? process.env.AI_ADMIN_PASSWORD ?? "";
const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f"; // admin's Workspace
const READY = Boolean(URL_ && KEY && SERVER && EMAIL && PASSWORD);
/** How long a test run may take to leave "Queued" with nothing said. */
const REACHES_AN_END_WITHIN_MS = 60_000;

let client: SupabaseClient;
let userId = "";
let token = "";

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

import * as service from "@/features/data-tables/service";
import { forgetAllTablePlacements, placeTableInRecordStore } from "@/features/data-tables/data-source/table-home";

const describeLive = READY ? describe : describe.skip;
if (!READY) {
  // eslint-disable-next-line no-console
  console.warn(
    "[a-test-run-reaches-an-end] SKIPPED: set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_BACKEND_URL_PROD, AI_ADMIN_USERNAME and AI_ADMIN_PASSWORD to run it.",
  );
}

async function server<T>(method: string, route: string, body?: unknown): Promise<T> {
  const res = await fetch(`${SERVER}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Organization-Id": ORG,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${route} → ${res.status}: ${text.slice(0, 600)}`);
  return (text ? JSON.parse(text) : null) as T;
}

async function archive(recordIds: string[]): Promise<void> {
  for (const id of recordIds) {
    const r = await client.schema("custom" as never).rpc("record_delete" as never, {
      p_organization_id: ORG,
      p_record_id: id,
    } as never);
    if (r.error) console.warn(`could not archive ${id}: ${r.error.message}`);
  }
}

async function makeTable(name: string, columns: string[]): Promise<{ id: string; fields: Record<string, string> }> {
  const born = await service.createTable({
    tableName: name,
    isPublic: false,
    authenticatedRead: false,
    fields: columns.map((c, i) => ({
      field_name: c.toLowerCase(),
      display_name: c,
      data_type: "string",
      field_order: i + 1,
      is_required: false,
    })),
    organizationId: ORG,
  });
  if (!born.success || !born.tableId) throw new Error(`createTable ${name}: ${born.error}`);
  placeTableInRecordStore(born.tableId, { organizationId: ORG, userId });
  const details = await service.readTableDetails(born.tableId);
  if (!details.success) throw new Error(`readTableDetails ${name}: ${details.error}`);
  const fields: Record<string, string> = {};
  for (const f of details.fields ?? []) {
    const ff = f as unknown as { id: string; field_name: string };
    fields[ff.field_name] = ff.id;
  }
  return { id: born.tableId, fields };
}

interface Run {
  run_id?: string | null;
  status: string;
  status_label: string;
  says?: string | null;
  steps?: Array<{ label: string; status: string; says?: string | null }>;
}
const ENDED = new Set(["completed", "failed", "errored", "cancelled", "interrupted", "awaiting_input", "paused"]);

describeLive("Test with a record: the run reaches an end, and its step writes the record", () => {
  const made: string[] = [];
  let workflowId = "";

  beforeAll(async () => {
    client = createSupabaseClient(URL_, KEY, { auth: { persistSession: false } });
    const signed = await client.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signed.error || !signed.data.user || !signed.data.session) throw new Error(`sign-in failed: ${signed.error?.message}`);
    expect(signed.data.user.email).toBe("admin@admin.com");
    userId = signed.data.user.id;
    token = signed.data.session.access_token;
  });

  afterAll(async () => {
    if (workflowId) {
      await server("POST", `/workflow-builder/workflows/${workflowId}/off`, {}).catch((e) => console.warn(String(e)));
      // A Workflow is not a record: it is archived (reversibly) through its own door.
      await server("DELETE", `/workflows/${workflowId}`).catch((e) => console.warn(String(e)));
    }
    await archive([...made].reverse());
    forgetAllTablePlacements();
  });

  it(
    "Maria Delgado's referral, tested: the run ends within the minute and a Visit exists for her",
    async () => {
      const referrals = await makeTable("Intake — Referrals", ["Title", "Status"]);
      made.push(referrals.id);
      const visits = await makeTable("Intake — Visits", ["Title"]);
      made.push(visits.id);
      expect(referrals.fields.status).toBeTruthy();

      const maria = await service.addTableRow({ tableId: referrals.id, data: { title: "Maria Delgado", status: "Scheduled" } });
      if (!maria.success || !maria.rowId) throw new Error(`addTableRow: ${maria.error}`);
      made.push(maria.rowId);

      const spec = {
        version: 1,
        // "When a Referral's Status changes, only if it is Scheduled". (The "becomes Scheduled"
        // verb asks what the record held BEFORE, which a hand test has no answer for — it stops
        // "Condition undecided"; tracked separately, so this proof uses the plain condition.)
        trigger: { event: "record.updated", table_id: referrals.id, field_ids: [referrals.fields.status], operations: [] },
        condition: { op: "eq", args: [{ field: referrals.fields.status }, { const: "Scheduled" }] },
        actions: [
          { type: "create_record", table_id: visits.id, values: { title: "Visit for {{trigger.record.title}}" } },
          { type: "notify_person", user_id: userId, title: "Referral scheduled", message: "A visit was created for {{trigger.record.title}}" },
        ],
      };
      const created = await server<{ workflow_id: string }>("POST", "/workflow-builder/workflows", {
        name: "Scheduled referral books a visit",
        spec,
        organization_id: ORG,
      });
      workflowId = created.workflow_id;
      const published = await server<{ published_version_id: string }>(
        "POST", `/workflow-builder/workflows/${workflowId}/publish`, {},
      );
      await server("POST", `/workflow-builder/workflows/${workflowId}/on`, {
        published_version_id: published.published_version_id,
      });

      const fired = await server<{ run_id: string }>("POST", `/workflow-builder/workflows/${workflowId}/test`, {
        record_id: maria.rowId,
      });
      // eslint-disable-next-line no-console
      console.log(`[a-test-run-reaches-an-end] workflow ${workflowId} run ${fired.run_id}`);

      const deadline = Date.now() + REACHES_AN_END_WITHIN_MS;
      let run: Run | undefined;
      while (Date.now() < deadline) {
        const { runs } = await server<{ runs: Run[] }>("GET", `/workflow-builder/workflows/${workflowId}/runs`);
        run = runs.find((r) => r.run_id === fired.run_id);
        if (run && ENDED.has(run.status)) break;
        await new Promise((r) => setTimeout(r, 2_000));
      }
      // eslint-disable-next-line no-console
      console.log(`[a-test-run-reaches-an-end] ${JSON.stringify(run)}`);
      expect(run).toBeDefined();
      // Never "Queued" past the minute: either it ended, or it says why it waits.
      expect(ENDED.has(run!.status) || Boolean(run!.says)).toBe(true);
      expect(run!.status).toBe("completed");

      const page = await service.getTablePage({ tableId: visits.id, limit: 50, offset: 0 });
      if (!page.success) throw new Error(page.error);
      const titles = page.data.rows.map((r) => r.data.title);
      made.push(...page.data.rows.map((r) => r.id));
      expect(titles).toContain("Visit for Maria Delgado");
    },
    150_000,
  );
});
