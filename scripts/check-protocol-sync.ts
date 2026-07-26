/**
 * check-protocol-sync.ts — the Matrx protocol mirror set must be byte-identical
 * to aidream's copy.
 *
 * MATRX_ENVELOPE.md declares itself and the generated registry "kept
 * byte-identical in aidream and matrx-frontend"; its change log extends the
 * mandate to MATRX_REFERENCES.md. aidream is the canonical side: the registry
 * JSON is emitted by aidream's scripts/generate_envelope_registry.py, and doc
 * edits land in aidream FIRST, then copy here. aidream's
 * validate_envelope_registry.py checks the same pact from its side; this script
 * is the FE half, so drift screams no matter which repo ships first.
 *
 * How it rotted before this existed: the FE registry sat at 11 shapes while
 * aidream grew to 87 (plan_tree, plan_node_patch, context_groom, ~74 reference
 * types missing), and MATRX_REFERENCES.md was a 6KB ancestor of aidream's 18KB
 * current doc — both discovered by hand on 2026-07-25.
 *
 * Deliberately NOT mirrored: MATRX_ACTIONS.md (pointer-only; aidream canonical).
 * matrx_actions_catalog.generated.json JOINED the mirror set 2026-07-26 — the FE
 * derives its action/reference UI from the computed catalog, so both repos carry
 * the same published snapshot (the old hand-authored
 * matrx_action_catalog.generated.json is deleted on both sides).
 *
 * Modes:
 *   default   — advisory: loud report, exit 0
 *   --strict  — exit 1 on divergence (CI / release-gates strict)
 *   --fix     — copy aidream → FE for every diverged file (release.sh uses this;
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
  "docs/protocol/MATRX_ENVELOPE.md",
  "docs/protocol/MATRX_REFERENCES.md",
  "docs/protocol/matrx_envelope_registry.generated.json",
  "docs/protocol/matrx_actions_catalog.generated.json",
];

if (!existsSync(join(AIDREAM_DIR, "docs", "protocol"))) {
  console.log(
    `${YELLOW}[WARN]${RESET} Protocol sync check SKIPPED — no aidream checkout at ${AIDREAM_DIR}\n` +
      `       (set AIDREAM_DIR to point at one). The byte-identical pact with aidream\n` +
      `       was NOT verified this run.`,
  );
  process.exit(0);
}

const diverged: string[] = [];

for (const rel of MIRROR_FILES) {
  const feFile = join(ROOT, rel);
  const canonical = join(AIDREAM_DIR, rel);

  if (!existsSync(canonical)) {
    diverged.push(`${rel} — MISSING in aidream (${canonical}); the canonical side lost a mirrored file?`);
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
  execSync("node scripts/gen-action-nouns.mjs", { stdio: "inherit", cwd: ROOT });
}

if (diverged.length === 0) {
  console.log(`${GREEN}[OK]${RESET} Protocol mirror set is byte-identical to aidream (${MIRROR_FILES.length} files).`);
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
