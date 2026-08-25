/**
 * check-legacy-shim-containment.ts — the legacy shell shim stays contained.
 *
 * `features/content-ir/directives/legacyShell.ts` is the ONE legacy surface of
 * the Kind Directives campaign (PLAN.md § THE STRICTNESS LAW, clause 4). It
 * translates a stored 4-key ` ```matrx ` fence into the current two-key shell
 * so old conversations keep rendering. It is READ-ONLY and it must stay
 * unreachable from every emission path — the moment a second module imports it,
 * "translate what we stored" quietly becomes "accept the old shape anywhere",
 * and the retired shell is a live protocol again.
 *
 * THE RULE: exactly ONE production importer — `decode.ts`. Tests and this guard
 * may reference it; nothing else may.
 *
 * Mirrors aidream's `tests/test_legacy_shim_containment.py`, which walks every
 * Python file for the same reason.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SHIM = "features/content-ir/directives/legacyShell.ts";
const SHIM_MODULE = "legacyShell";

/** The only production module allowed to import the shim. */
const ALLOWED = new Set(["features/content-ir/directives/decode.ts"]);

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

const IMPORT_RE = new RegExp(
  String.raw`(?:from|import)\s*\(?\s*["'][^"']*${SHIM_MODULE}["']`,
);

const offenders: string[] = [];
for (const file of tracked()) {
  if (file === SHIM) continue;
  if (ALLOWED.has(file)) continue;
  // A test may reference the shim: it is how clauses 1 and 4 are proven.
  if (/(^|\/)__tests__\//.test(file) || /\.test\.tsx?$/.test(file)) continue;
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const [i, line] of text.split("\n").entries()) {
    if (IMPORT_RE.test(line)) offenders.push(`${file}:${i + 1}  ${line.trim()}`);
  }
}

if (offenders.length > 0) {
  console.error(
    `${RED}${BOLD}══════ LEGACY SHELL SHIM ESCAPED ITS CONTAINMENT ══════${RESET}\n\n` +
      `${SHIM} is the ONE legacy surface of the Kind Directives campaign, and it\n` +
      `may only be imported by ${[...ALLOWED].join(", ")}.\n\n` +
      offenders.map((o) => `  ${o}`).join("\n") +
      `\n\nFix: import \`decodeDirective\` from features/content-ir/directives/decode\n` +
      `instead. It already understands stored 4-key fences — that is its entire job —\n` +
      `and it is the only place that is allowed to. If you need to EMIT a directive,\n` +
      `emit the current two-key shell (\`buildKindDirective\`), never the retired one.\n` +
      `Rule: common-docs/projects/kind-directives/PLAN.md § THE STRICTNESS LAW clause 4.`,
  );
  process.exit(1);
}

console.log(
  `${GREEN}[OK]${RESET} Legacy shell shim contained — ${[...ALLOWED].join(", ")} is its only importer.`,
);
