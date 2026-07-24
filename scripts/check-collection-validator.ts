/**
 * CW3 drift guard — proves matrx-frontend's collection-item validator twin
 * still matches aidream's canonical semantics.
 *
 *   pnpm check:collection-validator
 *
 * Three implementations of these rules exist (aidream Python = canonical,
 * my-matrx JS = visitor path, this repo's TS = admin path). They are pinned to
 * each other ONLY by the shared fixture `collection-validation-rules.json`. If
 * this check fails, fix `features/cms/collections/validateItem.ts` — NEVER the
 * fixture, and never by "adjusting" an expectation.
 *
 * A missing or unreadable fixture is a FAILURE, not a skip: an unpinned twin is
 * the dangerous state, and a silent skip is how it would stay unpinned.
 *
 * The fixture must also stay byte-identical to aidream's copy. When a
 * co-located aidream checkout is present (or AIDREAM_DIR is set) this script
 * compares checksums and screams on drift; without one it says so out loud
 * rather than quietly claiming the copy is current.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  validateItem,
  utf8ByteLength,
  itemByteSize,
} from "../features/cms/collections/validateItem";
import type { CollectionValidationMode } from "../features/cms/types";

interface ValidateCase {
  name: string;
  field_schema: unknown;
  data: Record<string, unknown>;
  validation_mode: CollectionValidationMode;
  expect: {
    ok?: boolean;
    rejected_fields?: string[];
    warning_fields?: string[];
    rejected_issues?: [string, string][];
    warning_issues?: [string, string][];
  };
}

interface ByteCase {
  name: string;
  text?: string;
  data?: unknown;
  expect_bytes: number;
}

interface Fixture {
  validate_cases?: ValidateCase[];
  utf8_byte_length_cases?: ByteCase[];
  item_byte_size_cases?: ByteCase[];
}

const strict = process.argv.includes("--strict");
const repoRoot = join(__dirname, "..");
const fixturePath = join(
  repoRoot,
  "features/cms/collections/collection-validation-rules.json",
);

let fixture: Fixture;
try {
  fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Fixture;
} catch {
  console.error(`FAIL: fixture not readable at ${fixturePath}`);
  console.error(
    "The validator twin is UNPINNED without it. Copy it verbatim from " +
      "aidream/aidream/services/cms/collection-validation-rules.json.",
  );
  process.exit(1);
}

let total = 0;
let failures = 0;

function check(group: string, name: string, problems: string[]): void {
  total++;
  if (problems.length > 0) {
    failures++;
    console.error(`  ✗ [${group}] ${name}`);
    for (const p of problems) console.error(`      ${p}`);
  }
}

function sortedDedupedKeys(list: { key: string }[]): string[] {
  return [...new Set(list.map((entry) => entry.key))].sort();
}

// The complete issue-code vocabulary (ruling (i)) — identical in all three
// implementations, documented in my-matrx's DATA_API.md as a public wire
// contract. A code outside this set is a divergence even when field lists match.
const ISSUE_CODES = new Set([
  "required_missing",
  "unknown_key",
  "type_mismatch",
  "max_length",
  "out_of_range",
  "invalid_option",
]);

function comparePairs(a: [string, string], b: [string, string]): number {
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
  return 0;
}

/**
 * Sorted [key, code] pairs — NOT deduped, so issue MULTIPLICITY is pinned too
 * (ruling (j)). Element-wise comparison, matching Python's list ordering; a
 * default `.sort()` would compare the joined "key,code" string instead.
 */
function sortedIssuePairs(list: { key: string; code: string }[]): [string, string][] {
  return list.map((entry): [string, string] => [entry.key, entry.code]).sort(comparePairs);
}

/**
 * A MISSING expectation is a FAILURE, never a skip — silently tolerating one is
 * exactly how the fixture stayed blind to the code vocabulary for months.
 */
function checkIssues(
  problems: string[],
  label: string,
  got: [string, string][],
  want: [string, string][] | undefined,
): void {
  if (want === undefined) {
    problems.push(`${label}: fixture case has no ${label} — re-copy the canonical fixture`);
    return;
  }
  const wantSorted = want.map((p): [string, string] => [p[0], p[1]]).sort(comparePairs);
  if (JSON.stringify(got) !== JSON.stringify(wantSorted)) {
    problems.push(`${label}: expected ${JSON.stringify(wantSorted)}, got ${JSON.stringify(got)}`);
  }
  for (const [, code] of got) {
    if (!ISSUE_CODES.has(code)) problems.push(`${label}: undeclared issue code "${code}"`);
  }
}

// ── 1. validate_cases ────────────────────────────────────────────────────────
for (const c of fixture.validate_cases ?? []) {
  const result = validateItem(c.field_schema, c.data, c.validation_mode);
  const problems: string[] = [];
  if (c.expect.ok !== undefined && result.ok !== c.expect.ok) {
    problems.push(`ok: expected ${c.expect.ok}, got ${result.ok}`);
  }
  if (c.expect.rejected_fields !== undefined) {
    const got = sortedDedupedKeys(result.errors);
    const want = [...c.expect.rejected_fields].sort();
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      problems.push(`rejected_fields: expected [${want}], got [${got}]`);
    }
  }
  if (c.expect.warning_fields !== undefined) {
    const got = sortedDedupedKeys(result.warnings);
    const want = [...c.expect.warning_fields].sort();
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      problems.push(`warning_fields: expected [${want}], got [${got}]`);
    }
  }
  // (key, code) pairs — the only assertion that can SEE a code-vocabulary or
  // multiplicity divergence between the three twins. Field lists cannot.
  checkIssues(problems, "rejected_issues", sortedIssuePairs(result.errors), c.expect.rejected_issues);
  checkIssues(problems, "warning_issues", sortedIssuePairs(result.warnings), c.expect.warning_issues);
  check("validate", c.name, problems);
}

// ── 2. utf8_byte_length_cases (the route's string byte counter) ──────────────
for (const c of fixture.utf8_byte_length_cases ?? []) {
  const got = utf8ByteLength(c.text ?? "");
  check(
    "utf8_bytes",
    c.name,
    got === c.expect_bytes ? [] : [`expected ${c.expect_bytes} bytes, got ${got}`],
  );
}

// ── 3. item_byte_size_cases (the route's item size authority) ────────────────
for (const c of fixture.item_byte_size_cases ?? []) {
  const got = itemByteSize(c.data);
  check(
    "item_bytes",
    c.name,
    got === c.expect_bytes ? [] : [`expected ${c.expect_bytes} bytes, got ${got}`],
  );
}

// ── 4. fixture freshness vs aidream (loud when it cannot be checked) ─────────
const aidreamDir = process.env.AIDREAM_DIR ?? join(repoRoot, "..", "aidream");
const canonicalFixture = join(
  aidreamDir,
  "aidream/services/cms/collection-validation-rules.json",
);
function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
if (existsSync(canonicalFixture)) {
  if (sha256(canonicalFixture) !== sha256(fixturePath)) {
    failures++;
    total++;
    console.error("  ✗ [fixture] local copy has DRIFTED from aidream's canonical fixture");
    console.error(`      cp ${canonicalFixture} ${fixturePath}`);
    console.error("      then re-run this check — the twin may need updating too.");
  }
} else {
  console.warn(
    `NOTE: no aidream checkout at ${aidreamDir} — fixture freshness NOT verified ` +
      "(set AIDREAM_DIR to check it).",
  );
}

if (total === 0) {
  console.error("FAIL: fixture parsed but contained zero cases — inspect its shape.");
  process.exit(1);
}

console.log(`collection-validator twin: ${total - failures}/${total} fixture cases passed`);
if (failures > 0) {
  console.error(
    `FAIL: ${failures} case(s) diverge from the canonical validator — ` +
      "fix features/cms/collections/validateItem.ts (never the fixture).",
  );
  process.exit(strict ? 1 : 1);
}
