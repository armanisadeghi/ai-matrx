/**
 * @jest-environment node
 *
 * LIVE. Runs the `kind:"table"` branch of `applyListChange`/`readListTarget`
 * against the real main database, signed in as `admin@admin.com` — the one
 * identity this repo's policy names for UI/API/MCP testing, never a real
 * person's account.
 *
 * WHY THIS IS SAFE TO RUN AGAINST MAIN (there is no rehearsal copy any more,
 * owner ruling 2026-09-18): admin's own personal organization
 * (`884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f`, "admin's Workspace") carries a
 * standing `platform.knob_override` row turning `custom.code_paths_enabled`
 * on for that (user, organization) pair only — the platform default stays
 * false for everyone else. This suite declares its OWN throwaway Table
 * (never an existing one), writes and rewrites exactly one row in it, and
 * soft-deletes the Table's kernel record in `afterAll`: `custom.record_delete`
 * is REC-23 — soft and reversible within retention — so nothing here is a
 * hard, permanent change to the database.
 *
 * Needs `AI_ADMIN_USERNAME` / `AI_ADMIN_PASSWORD` (this repo's `.env.local`)
 * to sign in for real. Without them the suite is SKIPPED, loudly, with the
 * reason printed — never a silent green.
 */
import path from "node:path";
import dotenv from "dotenv";

// `override: true` — `jest.setup.ts` seeds a fake localhost URL/key so tests
// that transitively import `utils/supabase/client.ts` don't throw at module
// load, and it runs (as a `setupFiles` entry) BEFORE this file does. Without
// `override`, dotenv refuses to replace an already-set var, so this suite
// would silently sign in against `localhost:54321` and fail with a bare
// `ECONNREFUSED` that says nothing about a live database.
dotenv.config({ path: path.resolve(__dirname, "../../../.env.local"), override: true });

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { createRecordsClient } from "@ai-matrx/records/core";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";
import { setStoreSingleton } from "@/lib/redux/store-singleton";
import type { ListChangeTarget } from "@/features/content-ir/kinds/list-change-proposal";

const ADMIN_EMAIL = process.env.AI_ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.AI_ADMIN_PASSWORD;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** admin's Workspace — the personal org carrying the standing switch override. */
const ADMIN_PERSONAL_ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";

const canRun = Boolean(
  ADMIN_EMAIL && ADMIN_PASSWORD && SUPABASE_URL?.startsWith("http") && SUPABASE_KEY,
);

// `applyListChange.ts` builds its own browser client via `createClient()` from
// `@/utils/supabase/client`, which needs a real DOM/cookie jar this jsdom-less
// `node` test environment does not have. This test carries the one signed-in
// client it made itself and hands it back through the same import specifier —
// the store's real doors are still what gets called, nothing here is mocked.
// `jest.doMock` (not the hoisted `jest.mock`) so it can register the module
// AFTER `authedClient` is actually assigned, inside `beforeAll`, right before
// `applyListChange` itself is (dynamically) required.
let authedClient: SupabaseClient;

const describeLive = canRun ? describe : describe.skip;

if (!canRun) {
  // eslint-disable-next-line no-console
  console.warn(
    "applyListChange table-branch live test SKIPPED — set AI_ADMIN_USERNAME, " +
      "AI_ADMIN_PASSWORD, NEXT_PUBLIC_SUPABASE_URL and " +
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (this repo's .env.local has all four) " +
      "to run it for real against the main database.",
  );
}

describeLive('applyListChange — kind:"table", live main database', () => {
  let tableId: string;
  let homeRecordId: string;
  let userId: string;
  let readListTarget: typeof import("../applyListChange").readListTarget;
  let applyListChange: typeof import("../applyListChange").applyListChange;

  beforeAll(async () => {
    authedClient = createSupabaseClient(SUPABASE_URL as string, SUPABASE_KEY as string);
    const signedIn = await authedClient.auth.signInWithPassword({
      email: ADMIN_EMAIL as string,
      password: ADMIN_PASSWORD as string,
    });
    if (signedIn.error || !signedIn.data.user) {
      throw new Error(
        `Could not sign in as admin@admin.com for the live records test: ${signedIn.error?.message}`,
      );
    }
    userId = signedIn.data.user.id;

    // A plain module reads the active org/user the same way a component
    // would — via the redux store singleton — because it is not a hook.
    setStoreSingleton({
      getState: () => ({
        appContext: { organization_id: ADMIN_PERSONAL_ORG },
        userAuth: { id: userId },
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    // Setup, not the port under test: declare a throwaway Table (and its one
    // Field) directly through the store's own doors.
    const setupClient = createRecordsClient({
      dataSource: recordsDataSource(authedClient),
      actor: personActor(userId),
      organizationId: ADMIN_PERSONAL_ORG,
    });
    // REC-1: a Table's `parent_id` is a HOME RECORD, not the kernel Table
    // itself — an actual record inside the person kernel, one write away.
    const personKernel = await setupClient.personKernelId();
    if (!personKernel.ok) throw new Error(`personKernelId refused: ${personKernel.error.message}`);
    const home = await setupClient.recordWrite({
      table_id: personKernel.data,
      data: { name: "applyListChange live-test home" },
    });
    if (!home.ok) throw new Error(`writing the throwaway home record refused: ${home.error.message}`);
    homeRecordId = home.data;

    const declared = await setupClient.tableDeclare({
      spec: {
        name: "applyListChange live-test probe",
        slug: `applylistchange_probe_${Date.now()}`,
        type: "entity",
        label_singular: "Probe",
        label_plural: "Probes",
        display: "list",
        weight: "light",
        ordered: false,
        row_order: "manual",
        title_field: "title",
        retention_days: 365,
        agent_writable: true,
        default_sort: [{ field: "title", direction: "asc" }],
        fields: [{ name: "title" }],
      },
      homeId: home.data,
    });
    if (!declared.ok) throw new Error(`tableDeclare refused: ${declared.error.message}`);
    tableId = declared.data;

    const fieldKernel = await setupClient.fieldKernelId();
    if (!fieldKernel.ok) throw new Error(`fieldKernelId refused: ${fieldKernel.error.message}`);
    const field = await setupClient.recordWrite({
      table_id: fieldKernel.data,
      data: {
        key: "title",
        label: "Title",
        type: "text",
        multi: false,
        dated: false,
        rules: [],
        source: "manual",
        sensitivity: "public",
        context_policy: "include",
        depends_on: [],
        applies_to_types: [],
        entity_definition_id: tableId,
      },
    });
    if (!field.ok) throw new Error(`declaring the "title" field refused: ${field.error.message}`);

    // `lib/supabase/authRetry.ts` (imported transitively via scopesService)
    // reads the pre-built `supabase` singleton, not just `createClient` — both
    // exports have to resolve to the one signed-in admin client.
    jest.doMock("@/utils/supabase/client", () => ({
      createClient: () => authedClient,
      supabase: authedClient,
    }));
    ({ readListTarget, applyListChange } = await import("../applyListChange"));
  }, 30_000);

  afterAll(async () => {
    if (!tableId || !authedClient) return;
    // Cleanup, not a rollback: `custom.record_delete` is soft (REC-23), so
    // this leaves both rows reversible-within-retention rather than gone.
    const cleanupClient = createRecordsClient({
      dataSource: recordsDataSource(authedClient),
      actor: personActor(userId),
      organizationId: ADMIN_PERSONAL_ORG,
    });
    await cleanupClient.recordDelete({ record_id: tableId });
    if (homeRecordId) await cleanupClient.recordDelete({ record_id: homeRecordId });
  });

  it("adds, reads, updates and removes a row through the live record store", async () => {
    const target: Extract<ListChangeTarget, { kind: "table" }> = {
      kind: "table",
      tableId,
      homeRecordId,
      label: "Probe list",
    };

    const added = await applyListChange(target, {
      id: "p1",
      action: "add",
      title: "Add the probe row",
      reason: "applyListChange live test",
      values: { title: "Row one" },
    });
    expect(added.status).toBe("applied");
    if (added.status !== "applied") throw new Error(`add refused: ${JSON.stringify(added)}`);
    const rowId = added.rowId;
    expect(rowId).toBeTruthy();

    const afterAdd = await readListTarget(target);
    if (afterAdd.status !== "read") throw new Error(`read refused: ${afterAdd.detail}`);
    expect(
      afterAdd.snapshot.rows.some((r) => r.id === rowId && r.values.title === "Row one"),
    ).toBe(true);

    const updated = await applyListChange(target, {
      id: "p2",
      action: "update",
      title: "Rename the probe row",
      reason: "applyListChange live test",
      rowId: rowId as string,
      patch: { title: "Row one, renamed" },
    });
    expect(updated.status).toBe("applied");

    const afterUpdate = await readListTarget(target);
    if (afterUpdate.status !== "read") throw new Error(`read refused: ${afterUpdate.detail}`);
    expect(afterUpdate.snapshot.rows.find((r) => r.id === rowId)?.values.title).toBe(
      "Row one, renamed",
    );

    const removed = await applyListChange(target, {
      id: "p3",
      action: "remove",
      title: "Remove the probe row",
      reason: "applyListChange live test",
      rowId: rowId as string,
    });
    expect(removed.status).toBe("applied");

    const afterRemove = await readListTarget(target);
    if (afterRemove.status !== "read") throw new Error(`read refused: ${afterRemove.detail}`);
    expect(afterRemove.snapshot.rows.some((r) => r.id === rowId)).toBe(false);
  }, 30_000);
});
