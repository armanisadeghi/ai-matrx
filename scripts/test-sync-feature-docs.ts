/**
 * Focused admission and write-contract tests for the repository-to-admin.feature_docs sync command.
 * Run: pnpm test:sync-feature-docs
 */
import { strict as assert } from "node:assert";

import {
  createFeatureDocsStore,
  parseArgs,
  refreshFeatureDocSyncMetadata,
  syncOneFeatureDoc,
  type FeatureDocsStore,
  type SyncOperation,
} from "./sync-feature-docs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

const organizationId = "39c38960-d30c-4840-b0c1-c9960de95582";
const otherOrganizationId = "00000000-0000-0000-0000-000000000000";
type ReturnedRow = Pick<
  Database["admin"]["Tables"]["feature_docs"]["Row"],
  "id" | "path" | "organization_id"
>;
type BoundaryResult = {
  data: ReturnedRow[] | null;
  error: { message: string } | null;
};

const row = (id: string, path: string, org = organizationId) =>
  ({
    id,
    path,
    organization_id: org,
  }) as Database["admin"]["Tables"]["feature_docs"]["Row"];

/** An awaitable chain returning the same { data, error } shape as PostgREST. */
function boundaryClient(result: BoundaryResult): SupabaseClient<Database> {
  const query = {
    insert: () => query,
    update: () => query,
    delete: () => query,
    select: () => query,
    eq: () => query,
    order: () => query,
    range: () => query,
    then: <TResult1 = BoundaryResult, TResult2 = never>(
      onfulfilled?:
        ((value: BoundaryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?:
        ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(result).then(onfulfilled, onrejected),
  };
  return {
    schema: () => ({ from: () => query }),
  } as unknown as SupabaseClient<Database>;
}

function testAdmission(): void {
  assert.throws(
    () => parseArgs([]),
    /Supply exactly one --organization-id <UUID>/,
    "a missing organization must fail before client or filesystem work",
  );
  assert.throws(
    () => parseArgs(["--organization-id", "not-a-uuid"]),
    /selected organization ID is invalid/,
    "a malformed organization must fail before client or filesystem work",
  );
  assert.throws(
    () =>
      parseArgs([
        "--organization-id",
        organizationId,
        "--organization-id",
        organizationId,
      ]),
    /Supply exactly one --organization-id <UUID>/,
    "the operation must have one immutable organization identity",
  );
  assert.deepEqual(
    parseArgs([
      "--organization-id",
      ` ${organizationId.toUpperCase()} `,
      "--push",
      "--confirm-delete",
    ]),
    { organizationId, mode: "push", confirmDelete: true },
    "an admitted command must retain the exact supplied organization",
  );
  assert.throws(
    () => parseArgs(["--organization-id", organizationId, "--push", "--pull"]),
    /Use only one of --push or --pull/,
    "contradictory modes must fail before client creation",
  );
  console.log("[PASS] sync-feature-docs organization admission");
}

async function testStoreBoundary(): Promise<void> {
  const exact = row("exact", "docs/FEATURE.md");
  const insertValue = {
    organization_id: organizationId,
    path: exact.path,
    content: "# title",
  } as Database["admin"]["Tables"]["feature_docs"]["Insert"];
  const positive = createFeatureDocsStore(
    boundaryClient({ data: [exact], error: null }),
  );
  assert.equal((await positive.insert(insertValue)).id, exact.id);
  assert.equal(
    (await positive.update(exact.id, organizationId, { title: "new" })).id,
    exact.id,
  );
  assert.equal(
    (await positive.softDelete(exact.id, organizationId, exact.path)).id,
    exact.id,
  );
  assert.equal(
    (await positive.delete(exact.id, organizationId, exact.path)).id,
    exact.id,
  );

  const zero = createFeatureDocsStore(
    boundaryClient({ data: [], error: null }),
  );
  await assert.rejects(() => zero.insert(insertValue), /received 0/);
  await assert.rejects(
    () => zero.update(exact.id, organizationId, { title: "new" }),
    /received 0/,
  );
  await assert.rejects(
    () => zero.softDelete(exact.id, organizationId, exact.path),
    /received 0/,
  );
  await assert.rejects(
    () => zero.delete(exact.id, organizationId, exact.path),
    /received 0/,
  );

  const dbError = createFeatureDocsStore(
    boundaryClient({ data: null, error: { message: "probe" } }),
  );
  await assert.rejects(() => dbError.insert(insertValue), /insert: probe/);
  await assert.rejects(
    () => dbError.update(exact.id, organizationId, { title: "new" }),
    /update: probe/,
  );
  await assert.rejects(
    () => dbError.softDelete(exact.id, organizationId, exact.path),
    /soft-delete: probe/,
  );
  await assert.rejects(
    () => dbError.delete(exact.id, organizationId, exact.path),
    /delete: probe/,
  );
  console.log("[PASS] sync-feature-docs Supabase write boundary");
}

async function testProductionWriteContract(): Promise<void> {
  const operation: SyncOperation = { organizationId, gitHead: "test" };
  const calls: string[] = [];
  const store: FeatureDocsStore = {
    list: async () => [],
    insert: async (value) => {
      calls.push(`insert:${value.organization_id}`);
      return row("i", value.path);
    },
    update: async (id, org, value) => {
      calls.push(`update:${id}:${org}:${String(value.organization_id)}`);
      return row(id, "test.md", org);
    },
    softDelete: async () => row("x", "x"),
    delete: async () => row("x", "x"),
  };
  await syncOneFeatureDoc(store, operation, "test.md", "# title");
  assert.equal(calls[0], `insert:${organizationId}`);
  await syncOneFeatureDoc(
    store,
    operation,
    "test.md",
    "# title",
    row("u", "test.md"),
  );
  assert.equal(calls[1], `update:u:${organizationId}:undefined`);
  await assert.rejects(
    () =>
      syncOneFeatureDoc(
        store,
        operation,
        "test.md",
        "# title",
        row("u", "test.md", otherOrganizationId),
      ),
    /belongs to a different organization/,
    "a conflicting row is preserved instead of being retargeted",
  );

  const mismatchedIdentity: FeatureDocsStore = {
    ...store,
    insert: async () => row("different", "different.md"),
  };
  await assert.rejects(
    () =>
      syncOneFeatureDoc(mismatchedIdentity, operation, "test.md", "# title"),
    /insert returned a different row/,
  );
  const mismatchedUpdate: FeatureDocsStore = {
    ...store,
    update: async () => row("different", "different.md"),
  };
  await assert.rejects(
    () =>
      syncOneFeatureDoc(
        mismatchedUpdate,
        operation,
        "test.md",
        "# title",
        row("u", "test.md"),
      ),
    /update returned a different row/,
  );

  let insertCalls = 0;
  const noIoStore: FeatureDocsStore = {
    ...store,
    insert: async () => {
      insertCalls++;
      return row("never", "never");
    },
  };
  await assert.rejects(
    () =>
      syncOneFeatureDoc(
        noIoStore,
        { organizationId: "", gitHead: "test" },
        "missing.md",
        "# title",
      ),
    /Select an organization/,
  );
  await assert.rejects(
    () =>
      syncOneFeatureDoc(
        noIoStore,
        { organizationId: "not-a-uuid", gitHead: "test" },
        "malformed.md",
        "# title",
      ),
    /selected organization ID is invalid/,
  );
  assert.equal(
    insertCalls,
    0,
    "missing and malformed organizations perform zero IO",
  );

  let releaseInsert: (() => void) | undefined;
  let capturedOrganizationId: string | null = null;
  const pendingInsert = new Promise<void>((resolve) => {
    releaseInsert = resolve;
  });
  const mutationStore: FeatureDocsStore = {
    ...store,
    insert: async (value) => {
      capturedOrganizationId = value.organization_id ?? null;
      await pendingInsert;
      return row(
        "mutated",
        value.path,
        value.organization_id ?? organizationId,
      );
    },
  };
  const mutableOperation: SyncOperation = { organizationId, gitHead: "test" };
  const pending = syncOneFeatureDoc(
    mutationStore,
    mutableOperation,
    "mutation.md",
    "# title",
  );
  mutableOperation.organizationId = otherOrganizationId;
  releaseInsert?.();
  await pending;
  assert.equal(
    capturedOrganizationId,
    organizationId,
    "the admitted organization remains immutable while a write is pending",
  );

  const metaError = createFeatureDocsStore(
    boundaryClient({ data: null, error: { message: "probe" } }),
  );
  await assert.rejects(
    () =>
      refreshFeatureDocSyncMetadata(
        metaError,
        operation,
        { ...row("meta", "meta.md"), content: "# title", content_hash: null },
        operation.gitHead,
      ),
    /feature-doc update: probe/,
    "metadata refresh propagates the real boundary error",
  );
  console.log("[PASS] sync-feature-docs production write contract");
}

async function main(): Promise<void> {
  testAdmission();
  await testStoreBoundary();
  await testProductionWriteContract();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
