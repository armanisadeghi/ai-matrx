#!/usr/bin/env tsx
/**
 * check-loading-slug-twin.ts — the kind loading-component slug list is ONE list,
 * and the two copies of it must agree.
 *
 * The canonical list is the frontend's
 * `features/content-ir/react/loading/kind-loading-slugs.ts` — it has to stay
 * compiled into the bundle, because that is what lets a kind's skeleton paint
 * with zero latency the instant the kind is identified in a live stream.
 * aidream mirrors it as `KIND_LOADING_SLUGS` in
 * `packages/matrx-ai/matrx_ai/tools/implementations/kind_authoring.py`, which is
 * what makes the `kind_create` tool REFUSE an unknown slug (and, since
 * 2026-08-25, what the `KindCreateArgs.loading_component` Literal — mirrored
 * into the live `tool.definition.parameters` enum — stops the model emitting in
 * the first place).
 *
 * Drift is silent and user-visible: a slug that exists only on the Python side
 * is accepted by the tool, written to `kind_definition.metadata.loading_component`,
 * and then falls back to the `generic` skeleton forever, because the frontend
 * registry has no component for it. A slug that exists only on the TS side is a
 * loader nobody can ever select.
 *
 * Compared as an ORDERED list — the two files are meant to read as the same
 * list, so a reordering is reported too (loudly, but it is the same defect
 * class: someone edited one copy).
 *
 * Modes:
 *   default   — advisory: loud report, exit 0
 *   --strict  — exit 1 on divergence (release-gates strict)
 *
 * The aidream checkout resolves like `check:protocol-sync`: $AIDREAM_DIR, else
 * ../aidream next to this repo. THE STRICTNESS LAW clause 7 — a guard that
 * cannot reach its dependency never degrades to something that reads as a pass:
 * advisory mode warns and skips, --strict exits 2 (UNMEASURED).
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const STRICT = process.argv.includes("--strict");

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const AIDREAM_DIR = process.env.AIDREAM_DIR ?? resolve(ROOT, "..", "aidream");

const TS_FILE = resolve(ROOT, "features/content-ir/react/loading/kind-loading-slugs.ts");
const PY_REL = "packages/matrx-ai/matrx_ai/tools/implementations/kind_authoring.py";
const PY_FILE = join(AIDREAM_DIR, PY_REL);

/** The string members of a `const X = [ … ] as const;` / `X: tuple[…] = ( … )` block. */
function membersOf(source: string, blockRe: RegExp, where: string): string[] {
  const block = blockRe.exec(source);
  if (!block) {
    console.error(
      `\n${RED}${BOLD}[UNMEASURED]${RESET} Could not find the KIND_LOADING_SLUGS declaration in ${where}.\n` +
        `             The list moved or was renamed — this guard compared NOTHING. Fix the\n` +
        `             pattern in scripts/check-loading-slug-twin.ts.\n`,
    );
    process.exit(2);
  }
  const members = [...block[1].matchAll(/"([^"]+)"/gu)].map((m) => m[1]);
  if (members.length === 0) {
    console.error(`\n${RED}${BOLD}[UNMEASURED]${RESET} KIND_LOADING_SLUGS in ${where} parsed to ZERO slugs.\n`);
    process.exit(2);
  }
  return members;
}

if (!existsSync(TS_FILE)) {
  console.error(
    `\n${RED}${BOLD}[UNMEASURED]${RESET} The canonical slug list is missing: ${relative(ROOT, TS_FILE)}\n`,
  );
  process.exit(2);
}

if (!existsSync(PY_FILE)) {
  const line =
    `Loading-slug twin UNMEASURED — no aidream checkout at ${AIDREAM_DIR}\n` +
    `       (set AIDREAM_DIR to point at one). The kind_create slug mirror was NOT\n` +
    `       verified this run.`;
  if (STRICT) {
    console.error(`${RED}${BOLD}[UNMEASURED]${RESET} ${line}`);
    process.exit(2);
  }
  console.log(`${YELLOW}[WARN]${RESET} ${line}`);
  process.exit(0);
}

const tsSlugs = membersOf(
  readFileSync(TS_FILE, "utf8"),
  /export const KIND_LOADING_SLUGS = \[([\s\S]*?)\] as const;/u,
  relative(ROOT, TS_FILE),
);
const pySlugs = membersOf(
  readFileSync(PY_FILE, "utf8"),
  /^KIND_LOADING_SLUGS: tuple\[str, \.\.\.\] = \(([\s\S]*?)^\)$/mu,
  `aidream/${PY_REL}`,
);

const tsSet = new Set(tsSlugs);
const pySet = new Set(pySlugs);
const onlyTs = tsSlugs.filter((slug) => !pySet.has(slug));
const onlyPy = pySlugs.filter((slug) => !tsSet.has(slug));
const reordered = onlyTs.length === 0 && onlyPy.length === 0 && tsSlugs.join(",") !== pySlugs.join(",");

if (onlyTs.length === 0 && onlyPy.length === 0 && !reordered) {
  console.log(
    `${GREEN}[OK]${RESET} check:loading-slug-twin — ${tsSlugs.length} loading slugs, identical in ` +
      `${relative(ROOT, TS_FILE)} and aidream/${PY_REL}.`,
  );
  process.exit(0);
}

console.error("");
console.error(`${RED}${BOLD}══════ LOADING-SLUG DRIFT — the kind loader list disagrees across repos ══════${RESET}`);
for (const slug of onlyTs) {
  console.error(`${RED}  ✗ "${slug}" — frontend only; aidream's kind_create will REFUSE it${RESET}`);
}
for (const slug of onlyPy) {
  console.error(
    `${RED}  ✗ "${slug}" — aidream only; kind_create accepts it and the kind then renders the` +
      ` generic skeleton FOREVER${RESET}`,
  );
}
if (reordered) {
  console.error(`${RED}  ✗ same members, different order — one copy was edited without the other${RESET}`);
  console.error(`${RED}    frontend: ${tsSlugs.join(", ")}${RESET}`);
  console.error(`${RED}    aidream:  ${pySlugs.join(", ")}${RESET}`);
}
console.error("");
console.error(`  The frontend list is canonical (it must stay compiled in — that is what makes`);
console.error(`  the loader paint with zero latency). Fix, in order:`);
console.error(`    1. ${relative(ROOT, TS_FILE)}  — add/remove the slug AND its component`);
console.error(`       in kind-loading-registry.ts (the Record<KindLoadingSlug, …> makes that a`);
console.error(`       compile error, never silent drift).`);
console.error(`    2. tool.definition.parameters for name='kind_create' in the live DB —`);
console.error(`       properties.loading_component.anyOf[0].enum carries the same list.`);
console.error(`    3. aidream/${PY_REL} (the runtime refusal) and`);
console.error(`       aidream/packages/matrx-ai/matrx_ai/tools/_generated_declarations.py`);
console.error(`       (KindCreateArgs.loading_component's Literal — must match the DB enum, or`);
console.error(`       aidream's scripts/validate_tools.py screams).`);
console.error("");
process.exit(STRICT ? 1 : 0);
