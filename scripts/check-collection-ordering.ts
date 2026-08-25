/**
 * Ordering drift guard — proves this repo's collection-ordering twin still
 * matches aidream's canonical semantics.
 *
 *   pnpm check:collection-ordering
 *
 * Three implementations of these rules exist (aidream Python = canonical,
 * my-matrx JS = visitor/SSR path, this repo's TS = admin path). They are pinned
 * to each other ONLY by the shared fixture `collection-ordering-rules.json`. If
 * this check fails, fix `features/cms/collections/ordering.ts` — NEVER the
 * fixture, and never by "adjusting" an expectation.
 *
 * A missing or unreadable fixture is a FAILURE, not a skip: an unpinned twin is
 * the dangerous state, and a silent skip is how it would stay unpinned.
 *
 * Same shape and same rules as check-collection-validator.ts — deliberately, so
 * one habit covers both guards.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DEFAULT_ORDER,
  isRealColumn,
  parseOrderSpec,
  resolveOrderSpec,
  type OrderSpec,
} from "../features/cms/collections/ordering";

interface ParseCase {
  name: string;
  spec: unknown;
  expect: OrderSpec | null;
}

interface ResolveCase {
  name: string;
  requested: unknown;
  settings: unknown;
  allowed_fields: string[] | null;
  allow_all_fields: boolean;
  expect: { order: OrderSpec | null; error: string | null };
}

interface ClassificationCase {
  field: string;
  is_real_column: boolean;
}

interface Fixture {
  default_order?: string;
  real_columns?: string[];
  parse_cases?: ParseCase[];
  resolve_cases?: ResolveCase[];
  field_classification_cases?: ClassificationCase[];
}

const repoRoot = join(__dirname, "..");
const fixturePath = join(
  repoRoot,
  "features/cms/collections/collection-ordering-rules.json",
);

let fixture: Fixture;
try {
  fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Fixture;
} catch {
  console.error(`FAIL: fixture not readable at ${fixturePath}`);
  console.error(
    "The ordering twin is UNPINNED without it. Copy it verbatim from " +
      "aidream/aidream/services/cms/collection-ordering-rules.json.",
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

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ── 0. the constants the fixture and the twin must agree on ─────────────────
check(
  "constants",
  "default_order",
  fixture.default_order === DEFAULT_ORDER
    ? []
    : [`fixture says ${fixture.default_order}, twin says ${DEFAULT_ORDER}`],
);
for (const field of fixture.real_columns ?? []) {
  check(
    "constants",
    `real_column:${field}`,
    isRealColumn(field) ? [] : [`${field} is a real column in the fixture but not in the twin`],
  );
}

// ── 1. parse_cases (the `field[:asc|desc]` grammar) ─────────────────────────
for (const c of fixture.parse_cases ?? []) {
  const got = parseOrderSpec(c.spec);
  check(
    "parse",
    c.name,
    same(got, c.expect) ? [] : [`expected ${JSON.stringify(c.expect)}, got ${JSON.stringify(got)}`],
  );
}

// ── 2. resolve_cases (precedence, allowlist, warn-vs-error asymmetry) ───────
// The twin console.warns on an unusable setting — expected, and silenced here
// so a passing run stays readable. Failures still print.
const realWarn = console.warn;
console.warn = () => {};
try {
  for (const c of fixture.resolve_cases ?? []) {
    const got = resolveOrderSpec({
      requested: c.requested,
      settings: c.settings,
      allowedFields: c.allowed_fields,
      allowAllFields: c.allow_all_fields,
    });
    check(
      "resolve",
      c.name,
      same(got, c.expect)
        ? []
        : [`expected ${JSON.stringify(c.expect)}, got ${JSON.stringify(got)}`],
    );
  }
} finally {
  console.warn = realWarn;
}

// ── 3. field_classification_cases (real column vs jsonb path) ───────────────
for (const c of fixture.field_classification_cases ?? []) {
  const got = isRealColumn(c.field);
  check(
    "classification",
    c.field,
    got === c.is_real_column ? [] : [`expected is_real_column=${c.is_real_column}, got ${got}`],
  );
}

// ── 4. fixture freshness vs aidream (loud when it cannot be checked) ────────
const aidreamDir = process.env.AIDREAM_DIR ?? join(repoRoot, "..", "aidream");
const canonicalFixture = join(
  aidreamDir,
  "aidream/services/cms/collection-ordering-rules.json",
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

console.log(`collection-ordering twin: ${total - failures}/${total} fixture cases passed`);
if (failures > 0) {
  console.error(
    `FAIL: ${failures} case(s) diverge from the canonical ordering — ` +
      "fix features/cms/collections/ordering.ts (never the fixture).",
  );
  process.exit(1);
}
