/**
 * Focused admission test for the repository-to-admin.feature_docs sync command.
 * Run: pnpm test:sync-feature-docs
 */
import { strict as assert } from "node:assert";

import { parseArgs } from "./sync-feature-docs";

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
