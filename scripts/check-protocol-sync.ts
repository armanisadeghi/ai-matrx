/**
 * check-protocol-sync.ts — the Matrx protocol mirror set must be byte-identical
 * to aidream's copy.
 *
 * KIND_DIRECTIVES.md (the ONE protocol doc the 2026-08-23 merge collapsed
 * MATRX_ENVELOPE.md + MATRX_DIRECTIVES.md + MATRX_REFERENCES.md into) and the
 * two generated registries are kept byte-identical in aidream and
 * matrx-frontend. aidream is the canonical side: the registry JSON is emitted
 * by its generate_kind_directive_registry.py, and doc edits land in aidream
 * FIRST, then copy here. aidream's validate_kind_directive_registry.py checks
 * the same pact from its side; this script is the FE half, so drift screams no
 * matter which repo ships first.
 *
 * How it rotted before this existed: the FE registry sat at 11 shapes while
 * aidream grew to 87 (plan_tree, plan_node_patch, context_groom, ~74 reference
 * types missing), and MATRX_REFERENCES.md was a 6KB ancestor of aidream's 18KB
 * current doc — both discovered by hand on 2026-07-25.
 *
 * The catalog IS mirrored now (it was not before): the FE has a real consumer —
 * scripts/gen-directive-nouns.mjs derives catalog-nouns.generated.ts from it,
 * which is what gives every enrolled noun a resolver and a display name.
 *
 * Modes:
 *   default   — advisory: loud report, exit 0
 *   --strict  — exit 1 on divergence (CI / release-gates strict)
 *   --fix     — copy aidream → FE for every comparable diverged file (release.sh uses this;
 *               a diverged FE-side edit is itself the defect — port it to
 *               aidream first, regenerate, then sync)
 *
 * The aidream checkout resolves like release.sh's migration applier: $AIDREAM_DIR,
 * else ../aidream next to this repo. Missing checkout = loud warn + skip (never
 * a hard fail — CI boxes may not have the sibling repo).
 */

import { execSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const STRICT = process.argv.includes("--strict");
const FIX = process.argv.includes("--fix");

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const AIDREAM_DIR = process.env.AIDREAM_DIR ?? resolve(ROOT, "..", "aidream");

const MIRROR_FILES = [
  "docs/protocol/KIND_DIRECTIVES.md",
  "docs/protocol/kind_directive_registry.generated.json",
  "docs/protocol/kind_directives_catalog.generated.json",
];

if (!existsSync(join(AIDREAM_DIR, "docs", "protocol"))) {
  // THE STRICTNESS LAW, clause 7: a guard that cannot reach its dependency
  // FAILS. It never degrades to a warning that reads as a pass. In advisory
  // mode (a dev box with no sibling checkout) an honest skip is still a skip;
  // in --strict / --fix, where somebody is relying on the answer, "I could not
  // look" exits 2 (UNMEASURED) so nothing downstream mistakes it for "clean".
  const line =
    `Protocol mirror UNMEASURED — no aidream checkout at ${AIDREAM_DIR}\n` +
    `       (set AIDREAM_DIR to point at one). The byte-identical pact with aidream\n` +
    `       was NOT verified this run.`;
  if (STRICT || FIX) {
    console.error(`${RED}${BOLD}[UNMEASURED]${RESET} ${line}`);
    process.exit(2);
  }
  console.log(`${YELLOW}[WARN]${RESET} ${line}`);
  process.exit(0);
}

const diverged: string[] = [];
const unavailableCanonical: string[] = [];

for (const rel of MIRROR_FILES) {
  const feFile = join(ROOT, rel);
  const canonical = join(AIDREAM_DIR, rel);

  if (!existsSync(canonical)) {
    // Frontend releases are intentionally independent from aidream's checkout
    // state. A missing canonical artifact cannot be compared or copied, and it
    // must never make --fix impossible. Keep the last committed FE mirror and
    // report the unavailable comparison loudly; byte drift still fails whenever
    // both sides exist.
    unavailableCanonical.push(`${rel} — unavailable in aidream (${canonical}); kept the committed frontend mirror`);
    continue;
  }
  if (!existsSync(feFile)) {
    if (FIX) {
      copyFileSync(canonical, feFile);
      console.log(`${YELLOW}[FIXED]${RESET} ${rel} — was missing here; copied from aidream`);
    } else {
      diverged.push(`${rel} — missing in this repo entirely`);
    }
    continue;
  }

  if (!readFileSync(feFile).equals(readFileSync(canonical))) {
    if (FIX) {
      copyFileSync(canonical, feFile);
      console.log(`${YELLOW}[FIXED]${RESET} ${rel} — diverged; overwritten with aidream's copy`);
    } else {
      const feM = statSync(feFile).mtime.toISOString();
      const aiM = statSync(canonical).mtime.toISOString();
      diverged.push(`${rel} — differs from aidream (FE mtime ${feM}, aidream mtime ${aiM})`);
    }
  }
}

if (FIX) {
  // The slim client noun table derives from the catalog manifest — regenerate it
  // whenever the mirror may have moved so the two can never drift.
  execSync("node scripts/gen-directive-nouns.mjs", { stdio: "inherit", cwd: ROOT });
}

for (const unavailable of unavailableCanonical) {
  console.warn(`${YELLOW}[WARN]${RESET} ${unavailable}`);
}

if (diverged.length === 0) {
  const compared = MIRROR_FILES.length - unavailableCanonical.length;
  // "0 of 4 compared" printed [OK] for weeks after the Kind Directives merge
  // renamed every file on the canonical side: a green tick naming a pact it did
  // not test. A run that compared NOTHING is UNMEASURED, never a pass
  // (THE STRICTNESS LAW clause 7).
  if (compared === 0) {
    console.error(
      `${RED}${BOLD}[UNMEASURED]${RESET} Protocol mirror set compared 0/${MIRROR_FILES.length} files — every canonical\n` +
        `             source is missing from ${AIDREAM_DIR}. Either the checkout is stale or the\n` +
        `             mirror set has been renamed on the aidream side; MIRROR_FILES in this\n` +
        `             script is the list to fix.`,
    );
    process.exit(2);
  }
  console.log(`${GREEN}[OK]${RESET} Protocol mirror set matches every available aidream source (${compared}/${MIRROR_FILES.length} files compared).`);
  process.exit(0);
}

console.error("");
console.error(`${RED}${BOLD}══════ PROTOCOL MIRROR DRIFT — docs/protocol out of sync with aidream ══════${RESET}`);
for (const d of diverged) console.error(`${RED}  ✗ ${d}${RESET}`);
console.error("");
console.error(`  These files are contractually byte-identical across repos (MATRX_ENVELOPE.md header).`);
console.error(`  aidream is canonical. Fix:`);
console.error(`    1. If the FE copy carries an intentional edit, port it to aidream first`);
console.error(`       (registry JSON: edit the registry in code, re-run aidream's`);
console.error(`       scripts/generate_envelope_registry.py — never the JSON by hand).`);
console.error(`    2. pnpm check:protocol-sync:fix   (copies aidream → here)`);
console.error("");
process.exit(STRICT ? 1 : 0);
