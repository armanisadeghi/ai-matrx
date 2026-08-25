/**
 * sync-directive-grammar.ts — the Kind Directives grammar may not drift.
 *
 * The grammar (`RESERVED_PREFIX`, the version, the CLOSED class vocabulary,
 * `CAPABILITY_BY_CLASS`, `IN_CONTENT_CLASSES`) is declared ONCE, in aidream's
 * `packages/matrx-graph/matrx_graph/content_ir/directives.py`. The client
 * mirrors it in `features/content-ir/directives/grammar.ts` because the client
 * has to parse a slug to route a directive. Two declarations of one grammar is
 * exactly the split THE Kind Directives merge exists to close, so this script
 * makes the second one derived rather than hand-kept:
 *
 *   pnpm sync:directive-grammar          extract from aidream → the mirror JSON
 *   pnpm check:directive-grammar         verify the mirror JSON still matches aidream
 *
 * The committed artifact is `docs/protocol/kind_directive_grammar.generated.json`.
 * `directive-grammar-parity.test.ts` asserts the TS constants against THAT file
 * offline, so the parity claim is measurable in CI (which has no aidream
 * checkout); this script is the other half — the artifact vs its real source.
 *
 * THE STRICTNESS LAW, clause 7: a guard that cannot reach its dependency EXITS
 * NON-ZERO (2 = UNMEASURED). It never degrades to a warning that reads as a
 * pass. Without an aidream checkout, `--check` reports UNMEASURED and fails.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const CHECK = process.argv.includes("--check");
const AIDREAM_DIR = process.env.AIDREAM_DIR ?? resolve(ROOT, "..", "aidream");
const SOURCE_REL =
  "packages/matrx-graph/matrx_graph/content_ir/directives.py";
const MIRROR_REL = "docs/protocol/kind_directive_grammar.generated.json";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function die(message: string, code: number): never {
  console.error(`${RED}${BOLD}[FAIL]${RESET} ${message}`);
  process.exit(code);
}

interface Grammar {
  source: string;
  reserved_prefix: string;
  directive_version: number;
  classes: string[];
  capability_by_class: Record<string, string>;
  in_content_classes: string[];
}

function extract(py: string): Grammar {
  const prefix = /^RESERVED_PREFIX = "([^"]+)"/m.exec(py);
  if (!prefix) die(`${SOURCE_REL}: could not read RESERVED_PREFIX.`, 1);

  const version = /^DIRECTIVE_VERSION = (\d+)/m.exec(py);
  if (!version) die(`${SOURCE_REL}: could not read DIRECTIVE_VERSION.`, 1);

  const classesBlock = /^CLASSES: tuple\[str, \.\.\.\] = \(([\s\S]*?)\)/m.exec(py);
  if (!classesBlock) die(`${SOURCE_REL}: could not read CLASSES.`, 1);
  const classes = [...classesBlock[1]!.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]!);

  const capBlock =
    /^CAPABILITY_BY_CLASS: dict\[str, str\] = \{([\s\S]*?)^\}/m.exec(py);
  if (!capBlock) die(`${SOURCE_REL}: could not read CAPABILITY_BY_CLASS.`, 1);
  const capability_by_class: Record<string, string> = {};
  for (const m of capBlock[1]!.matchAll(/"([a-z_]+)":\s*"([a-z_]+)"/g)) {
    capability_by_class[m[1]!] = m[2]!;
  }

  const inContentBlock =
    /^IN_CONTENT_CLASSES: frozenset\[str\] = frozenset\(\{([\s\S]*?)\}\)/m.exec(py);
  if (!inContentBlock) die(`${SOURCE_REL}: could not read IN_CONTENT_CLASSES.`, 1);
  const in_content_classes = [
    ...inContentBlock[1]!.matchAll(/"([a-z_]+)"/g),
  ].map((m) => m[1]!);

  if (classes.length === 0 || Object.keys(capability_by_class).length === 0) {
    die(`${SOURCE_REL}: extracted an EMPTY grammar — the source shape changed.`, 1);
  }

  return {
    source: `aidream ${SOURCE_REL}`,
    reserved_prefix: prefix[1]!,
    directive_version: Number.parseInt(version[1]!, 10),
    classes,
    capability_by_class,
    in_content_classes: [...in_content_classes].sort(),
  };
}

const sourcePath = join(AIDREAM_DIR, SOURCE_REL);
if (!existsSync(sourcePath)) {
  die(
    `UNMEASURED — the Kind Directives grammar parity was NOT verified.\n` +
      `       No aidream checkout at ${AIDREAM_DIR} (set AIDREAM_DIR).\n` +
      `       A guard that cannot reach its source fails; it never degrades to a\n` +
      `       warning that reads as a pass (THE STRICTNESS LAW, clause 7).`,
    2,
  );
}

const grammar = extract(readFileSync(sourcePath, "utf8"));
const serialized = `${JSON.stringify(grammar, null, 2)}\n`;
const mirrorPath = join(ROOT, MIRROR_REL);

if (!CHECK) {
  writeFileSync(mirrorPath, serialized);
  console.log(`${GREEN}[OK]${RESET} ${MIRROR_REL} regenerated from ${sourcePath}`);
  process.exit(0);
}

if (!existsSync(mirrorPath)) {
  die(`${MIRROR_REL} is missing. Run: pnpm sync:directive-grammar`, 1);
}
const committed = readFileSync(mirrorPath, "utf8");
if (committed !== serialized) {
  console.error(
    `${RED}${BOLD}══════ KIND DIRECTIVES GRAMMAR DRIFT ══════${RESET}\n` +
      `${MIRROR_REL} no longer matches ${sourcePath}.\n\n` +
      `committed:\n${committed}\nlive aidream source:\n${serialized}\n` +
      `Fix: aidream owns the grammar. Land the change there, then run\n` +
      `  pnpm sync:directive-grammar\n` +
      `and update features/content-ir/directives/grammar.ts to match.`,
  );
  process.exit(1);
}
console.log(
  `${GREEN}[OK]${RESET} Kind Directives grammar mirror matches aidream (${grammar.classes.length} classes).`,
);
