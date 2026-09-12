/**
 * Focused admission test for the repository-to-admin.feature_docs sync command.
 * Run: pnpm test:sync-feature-docs
 */
import { strict as assert } from "node:assert";

import {
  parseArgs,
  syncOneFeatureDoc,
  type FeatureDocsStore,
  type SyncOperation,
} from "./sync-feature-docs";
import type { Database } from "@/types/database.types";

const organizationId = "39c38960-d30c-4840-b0c1-c9960de95582";

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

async function testWriteContract(): Promise<void> {
  const operation: SyncOperation = { organizationId, gitHead: "test" };
  const row = (id: string, path: string, org = organizationId) =>
    ({
      id,
      path,
      organization_id: org,
    }) as Database["admin"]["Tables"]["feature_docs"]["Row"];
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
  assert.equal(
    calls[0],
    `insert:${organizationId}`,
    "insert carries the captured organization",
  );
  await syncOneFeatureDoc(
    store,
    operation,
    "test.md",
    "# title",
    row("u", "test.md"),
  );
  assert.equal(
    calls[1],
    `update:u:${organizationId}:undefined`,
    "update omits organization ownership",
  );
  await assert.rejects(
    () =>
      syncOneFeatureDoc(
        store,
        operation,
        "test.md",
        "# title",
        row("u", "test.md", "00000000-0000-0000-0000-000000000000"),
      ),
    /belongs to a different organization/,
  );
  const zeroStore: FeatureDocsStore = {
    ...store,
    insert: async () => {
      throw new Error(
        "feature-doc insert: expected exactly one affected row, received 0",
      );
    },
  };
  await assert.rejects(
    () => syncOneFeatureDoc(zeroStore, operation, "zero.md", "# title"),
    /expected exactly one affected row/,
  );
  console.log("[PASS] sync-feature-docs write contract");
}

testWriteContract().catch((error) => {
  console.error(error);
  process.exit(1);
});
