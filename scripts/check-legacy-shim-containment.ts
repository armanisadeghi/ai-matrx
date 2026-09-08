/**
 * check-legacy-shim-containment.ts — the legacy shell shim stays where it was
 * put, and NEVER comes back into this repo.
 *
 * The retired 4-key ` ```matrx ` fence translator is the ONE legacy surface of
 * the Kind Directives campaign (PLAN.md § THE STRICTNESS LAW, clause 4). It is
 * READ-ONLY and it must stay unreachable from every emission path — the moment
 * a module imports it, "translate what we stored" quietly becomes "accept the
 * old shape anywhere", and the retired shell is a live protocol again.
 *
 * WHAT CHANGED ON 2026-09-08. The shim moved INTO `@ai-matrx/content-ir`
 * (0.11.0), where it is package-internal: `decodeDirective` is the only thing
 * that reaches it, the package's own containment test proves that, and this
 * repo deleted its copy along with the rest of the app-local directive tier.
 *
 * So this guard's job changed shape but not purpose. It now asserts the two
 * facts that keep the shim contained FROM THIS SIDE:
 *
 *   1. No local legacy-shell module exists again (a re-created
 *      `legacyShell.ts` / `legacy-shell.ts` under `features/` is the exact
 *      regression — a second copy of the retired protocol).
 *   2. Nothing imports a legacy-shell path at all. The package does not export
 *      a translator, and a deep import into `@ai-matrx/content-ir/dist/...`
 *      to reach one is the same escape by another route.
 *
 * Mirrors aidream's `tests/test_legacy_shim_containment.py`, which walks every
 * Python file for the same reason.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function tracked(): string[] {
  return execFileSync("git", ["ls-files", "*.ts", "*.tsx"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .filter(Boolean);
}

/** A file that IS a local copy of the retired translator. */
const LOCAL_SHIM_RE = /(^|\/)legacy-?[Ss]hell\.tsx?$/;
/** Any import that names a legacy-shell module, package-deep imports included. */
const IMPORT_RE = /(?:from|import)\s*\(?\s*["'][^"']*legacy-?[Ss]hell["']/;

const files = tracked();
const THIS_FILE = "scripts/check-legacy-shim-containment.ts";

const recreated: string[] = [];
const importers: string[] = [];

for (const file of files) {
  if (file === THIS_FILE) continue;
  if (LOCAL_SHIM_RE.test(file)) {
    recreated.push(file);
    continue;
  }
  // A test may reference the shim by name: it is how the clause is proven.
  if (/(^|\/)__tests__\//.test(file) || /\.test\.tsx?$/.test(file)) continue;
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const [i, line] of text.split("\n").entries()) {
    if (IMPORT_RE.test(line)) importers.push(`${file}:${i + 1}  ${line.trim()}`);
  }
}

if (recreated.length > 0 || importers.length > 0) {
  console.error(
    `${RED}${BOLD}══════ LEGACY SHELL SHIM ESCAPED ITS CONTAINMENT ══════${RESET}\n\n` +
      `The retired 4-key fence translator lives INSIDE @ai-matrx/content-ir, reachable\n` +
      `only by its own \`decodeDirective\`. This repo may neither re-create it nor\n` +
      `import one.\n\n` +
      (recreated.length > 0
        ? `A local legacy-shell module was re-created:\n` +
          recreated.map((f) => `  ${f}`).join("\n") +
          `\n\n`
        : "") +
      (importers.length > 0
        ? `Something imports a legacy-shell path:\n` +
          importers.map((o) => `  ${o}`).join("\n") +
          `\n\n`
        : "") +
      `Fix: import \`decodeDirective\` / \`tryDecodeDirective\` from @ai-matrx/content-ir.\n` +
      `It already understands stored 4-key fences — that is its entire job — and it is\n` +
      `the only place that is allowed to. If you need to EMIT a directive, emit the\n` +
      `current two-key shell (\`buildKindDirective\`), never the retired one.\n` +
      `Rule: common-docs/projects/kind-directives/PLAN.md § THE STRICTNESS LAW clause 4.`,
  );
  process.exit(1);
}

console.log(
  `${GREEN}[OK]${RESET} Legacy shell shim contained — no local copy, no importer; ` +
    `it is package-internal to @ai-matrx/content-ir.`,
);
