#!/usr/bin/env npx tsx
/**
 * check:kind-marker-law — `__kind` is PART OF THE DATA, everywhere.
 *
 * 🚨 THE RULE (Arman, 2026-08-21):
 *
 *   "The system itself is storing the data without this key and wrapper, which
 *   causes problems during rendering… we need to annihilate any part of the
 *   code that is either stripping away that key or any agent who is being
 *   instructed to exclude that key."
 *
 * THE LAW (KINDS_EVERYWHERE_PLAN §4.2): the discriminator-carrying form IS the
 * representation of a kind instance inside the platform — stored, passed and
 * rendered with its marker, exactly as `"object": "charge"` is part of every
 * Stripe payload. Reduction survives at EXACTLY these doors, and nowhere else:
 *
 *   1. THE AGENT PROMPT — what a model READS is prose, not a payload. (Server
 *      side; this repo has no prompt-serialization door.)
 *   2. EXTERNAL EGRESS — a value leaving for a FOREIGN contract, e.g. a
 *      schema_proposal applied to `agx_agent.output_schema` (a JSON Schema
 *      document, not a kind instance).
 *   3. THE INGESTION SHIM — drop the marker only where a closed pre-kinds model
 *      would fatally reject it. (Server side.)
 *
 * Two things are NOT doors, and both are blessed here explicitly because the
 * difference is the whole point:
 *
 *   • A SYMMETRIC COMPARISON that reduces BOTH sides inside a predicate and
 *     returns only a boolean (`envelopeMatchesParsedSource`). Nothing reduced
 *     ever leaves.
 *   • DISPLAY-ONLY formatting of a value into human prose, where the output is
 *     text a person reads and never re-enters the pipeline
 *     (`stripKindForDisplay` inside `formatInlineValue`, `StructuredValueView`).
 *
 * WHAT THIS FLAGS: a call to a `__kind`-removing helper, or a fresh
 * destructure/filter/delete of the marker key, in a file that is not blessed
 * below. Tests are exempt — a test that pins the law must be able to build both
 * shapes.
 *
 * HOW TO FIX A REAL ONE: don't strip. If a consumer chokes on the marker, teach
 * the consumer to accept-and-ignore it (add it to the mapped/known key set, or
 * declare it on the model) — never delete the identity to suit a reader.
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

/** Scanned roots — product code only. */
const SCAN_DIRS = ["features", "components", "app", "lib", "hooks", "utils", "actions"];

/** Demo routes are sample code, not the platform (same carve-out as check:hardcoded-prompts). */
const EXCLUDE = [/^app\/\(dev\)\//];

/** Helper names that REMOVE the marker. Adding one is not a fix. */
const REDUCERS = [
  "stripKindDeep",
  "stripKindRoot",
  "stripRootKind",
  "stripRootKindShape",
  "stripKindForDisplay",
  "stripKindFromJsonSchema",
];

/** file (repo-relative) → why it is allowed to reduce. */
const BLESSED: Record<string, string> = {
  "features/content-ir/kinds/schema-proposal.ts":
    "door 2 — EXTERNAL EGRESS: the proposal is applied verbatim to agx_agent.output_schema, " +
    "a JSON Schema document, so its own ROOT marker must not be written into it.",
  "features/content-ir/redux/render-block-envelope.ts":
    "not a door — a symmetric COMPARISON: envelopeMatchesParsedSource reduces both sides " +
    "inside the predicate and returns a boolean; no reduced value ever leaves.",
  "features/content-ir/kinds/kind-markdown-utils.ts":
    "not a door — DISPLAY ONLY: stripKindForDisplay formats a nested value into an inline " +
    "code span a human reads. It never feeds storage or a re-render.",
  "components/official/structured-value/StructuredValueView.tsx":
    "not a door — DISPLAY ONLY: the universal document view hides the discriminator from " +
    "the reader; the underlying value is untouched and 'Show the raw data' shows it.",
  "features/content-ir/registry/shape-doctor.ts":
    "not a door — a SCHEMA-side comparison: stripKindFromJsonSchema normalises two SCHEMA " +
    "DOCUMENTS before diffing their substance, never an instance. The recomputed gate must " +
    "stay indifferent to where the identity key travels.",
  "features/content-ir/studio/components/ShapeOwnerEditor.tsx":
    "not an instance — lists a SCHEMA's data properties for the title-key picker; the " +
    "discriminator is identity, never a title field.",
  "features/content-ir/studio/components/ShapeTestTab.tsx":
    "not storage — seeds the FIELD EDITOR, whose fields are the kind's data keys. The form " +
    "re-stamps the marker on emit (KindInputForm), so the round trip is lossless.",
  "features/content-ir/registry/kind-content-block-generator.ts":
    "not a reduction — drop-then-restamp: the root marker is removed only so withRootKind " +
    "immediately re-stamps the AUTHORITATIVE slug for the block being generated.",
  "features/content-ir/studio/instance-service.ts":
    "not a reduction — the WRITE path: withRootKindMarker drops any stale marker only to " +
    "re-stamp the row's real kind as the first key.",
};

/**
 * Structural strippers. A DESTRUCTURE is only a strip when it is the left side
 * of an assignment (`const { [KIND_KEY]: _x, ...rest } = value`) — the SAME
 * tokens inside an object literal (`{ [KIND_KEY]: kind, ...value }`) are the
 * opposite act, a STAMP, and the guard must never confuse the fix for the bug.
 */
const DESTRUCTURE_CONTEXT = /(?:const|let|var)\s*\{|\}\s*=/;
const INLINE_PATTERNS: Array<{ re: RegExp; what: string; needsDestructure?: boolean }> = [
  {
    re: /\[\s*KIND_KEY\s*\]\s*:\s*\w+\s*,\s*\.\.\./,
    what: "destructures KIND_KEY away",
    needsDestructure: true,
  },
  {
    re: /["']?__kind["']?\s*:\s*\w+\s*,\s*\.\.\./,
    what: "destructures `__kind` away",
    needsDestructure: true,
  },
  { re: /delete\s+[\w.[\]"']*\[?["']?__kind/, what: "deletes the `__kind` key" },
  { re: /!==\s*KIND_KEY|key\s*!==\s*["']__kind["']/, what: "filters the marker key out" },
];

function scan(): string[] {
  const files = execSync(
    `git ls-files ${SCAN_DIRS.map((d) => `'${d}'`).join(" ")} | grep -E '\\.(ts|tsx)$'`,
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  )
    .split("\n")
    .filter(Boolean);

  const callRe = new RegExp(`\\b(${REDUCERS.join("|")})\\s*\\(`);
  const violations: string[] = [];

  for (const rel of files) {
    if (rel in BLESSED) continue;
    if (EXCLUDE.some((re) => re.test(rel))) continue;
    if (/__tests__|\.test\.tsx?$|\.spec\.tsx?$|\.dev\.tsx?$/.test(rel)) continue;

    const source = readFileSync(path.join(ROOT, rel), "utf8");
    if (!source.includes("__kind") && !source.includes("KIND_KEY")) continue;

    source.split("\n").forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
      if (!code.trim()) return;

      const call = callRe.exec(code);
      if (call) {
        violations.push(`${rel}:${i + 1}  \`${call[1]}(…)\` — strips \`__kind\` outside a lawful door.`);
        return;
      }
      for (const { re, what, needsDestructure } of INLINE_PATTERNS) {
        if (needsDestructure && !DESTRUCTURE_CONTEXT.test(code)) continue;
        if (re.test(code)) {
          violations.push(`${rel}:${i + 1}  ${what} — \`__kind\` is part of the data.`);
          return;
        }
      }
    });
  }
  return violations;
}

function main(): void {
  if (process.argv.includes("--list")) {
    console.log("Blessed `__kind` reduction sites — the only lawful ones:\n");
    for (const [rel, why] of Object.entries(BLESSED).sort()) {
      console.log(`  ${rel}\n    ${why}\n`);
    }
    return;
  }

  const violations = scan();
  if (violations.length === 0) {
    console.log("✅ `__kind` marker law holds — no stripping outside the lawful doors.");
    return;
  }

  console.error("\n🚨 THE `__kind` MARKER LAW IS BROKEN\n");
  for (const v of violations) console.error(`  ✗ ${v}`);
  console.error(
    "\n`__kind` is part of the data (KINDS_EVERYWHERE_PLAN §4.2). If a consumer chokes on\n" +
      "the marker, teach it to accept-and-ignore (add the key to its mapped/known set, or\n" +
      "declare it on the model) — never delete a payload's identity to suit a reader.\n" +
      "Run `pnpm check:kind-marker-law --list` for the doors that ARE lawful.\n",
  );
  process.exit(1);
}

main();
