#!/usr/bin/env npx tsx
/**
 * check:kind-schema-source — a kind's fields come from its SCHEMA, once.
 *
 * 🚨 THE RULE (Arman, 2026-08-29):
 *
 *   "There should be one source of truth that is processed into everything
 *    else we need. Unless you can convince me of a very, very, very, very
 *    fucking good reason why we should create multiple sources of truth and
 *    risk things diverging from each other, then I'm not gonna be okay with
 *    it."
 *
 * `content_ir.kind_definition.emitted_json_schema` IS a kind's contract.
 * `kind_definition.data` is a flattened copy of it stored alongside, written
 * by an all-or-nothing converter that declines any nested shape. What that
 * cost, measured on the live database 2026-08-29:
 *
 *   - 440 of 502 active kinds had no copy at all, so the streaming parser had
 *     no schema for them. On 2026-08-28 a render-route change began reading
 *     "no schema" as "broken payload", and ~221 kinds with purpose-built
 *     components silently started rendering as key/value dumps.
 *   - Of the 62 kinds that DID carry both, 13 had already drifted: four listed
 *     `__kind` as a data field (it is the discriminator, never a field), and
 *     nine flattened closed enums to bare strings or lost the min/max bounds,
 *     required flags and descriptions their schema states.
 *
 * So the copy is not a cache — a cache cannot disagree with its source. THE
 * DERIVATION IS THE PATH: `kindSchemaFromJsonSchema` (@ai-matrx/content-ir)
 * turns the schema into the field model, and all 502 live kinds convert.
 *
 * WHAT THIS FLAGS: building a field model from the stored copy (a
 * `storageToKindSchema` call) outside the one function allowed to serve the
 * legacy tail. Selecting the column for DISPLAY is fine — the admin Schema tab
 * shows it precisely so a human can see the drift.
 *
 * HOW TO FIX A REAL ONE: derive from `emitted_json_schema` instead. If a kind
 * genuinely has no schema, that is the defect — give it one.
 *
 * IF A CACHE IS EVER ADDED: Arman's terms, verbatim — every failure path a
 * kind component can take must refresh the cache, retry, and LOG that it
 * retried and still failed, so a failure can never again be silently blamed on
 * stale fields. Until someone measures a reason to need one, there is none.
 */

import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

/**
 * The ONE module permitted to consult the stored field list, and only for
 * kinds that have no schema at all — a shrinking legacy tail that screams
 * whenever it is used. Everything else derives.
 */
const BLESSED = new Set([
  "features/content-ir/registry/schema-source-kind-tables.ts",
]);

type Finding = { file: string; line: number; text: string };

const findings: Finding[] = [];

// RUNTIME code only. One-shot planners under `scripts/shape/` are dated
// artifacts of the era this rule ends — `plan-topic-ideas.ts` exists solely
// because the registry once read only the stored copy — and rewriting history
// to satisfy a new rule teaches nothing.
const files = globSync("{app,features,lib,components,hooks,utils}/**/*.{ts,tsx}", {
  cwd: ROOT,
}).filter(
  (f) => !f.includes("__tests__") && !f.includes(".test.") && !BLESSED.has(f),
);

for (const rel of files) {
  const source = readFileSync(join(ROOT, rel), "utf8");
  if (!source.includes("storageToKindSchema")) continue;
  source.split("\n").forEach((text, i) => {
    const trimmed = text.trim();
    if (!trimmed.includes("storageToKindSchema")) return;
    if (trimmed.startsWith("*") || trimmed.startsWith("//")) return;
    findings.push({ file: rel, line: i + 1, text: trimmed });
  });
}

if (findings.length === 0) {
  console.log(
    `${GREEN}✓ check:kind-schema-source — a kind's fields are derived from its schema, in one place${RESET}`,
  );
  process.exit(0);
}

console.error(
  `${RED}✗ check:kind-schema-source — ${findings.length} site(s) build a field model from the STORED copy${RESET}\n`,
);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}`);
  console.error(`    ${f.text}`);
  console.error(
    `    Derive from emitted_json_schema via kindSchemaFromJsonSchema instead.\n`,
  );
}
console.error(
  "The schema is the contract; the stored list is a copy that had already drifted\n" +
    "on 13 of the 62 live kinds carrying both. Read the header of this script.\n",
);
process.exit(1);
