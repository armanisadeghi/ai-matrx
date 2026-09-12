#!/usr/bin/env node
/**
 * check-package-twins.mjs — a capability collapsed into an `@ai-matrx/*`
 * package must never re-grow a local definition in a consumer repo.
 *
 * THE CLASS. Arman's standing order for the client-package campaign: *"the
 * logic of the packages is NEVER duplicated outside of the package — the logic
 * all needs to live inside the packages."* Every collapse the campaign has run
 * (data, diff, print, agents, realtime, icons, kit) deleted a host twin. The
 * failure mode is not the first twin — it is the SECOND one, written months
 * later by an agent that never saw the package export, which then drifts,
 * accumulates its own bug fixes, and cancels the package's out. The census of
 * what has already been collapsed is
 * `/projects/npm-package-extraction/DUPLICATION-CENSUS.md` (common-docs).
 *
 * THE RULE. `scripts/package-twins.json` names every export that has been
 * collapsed. A top-level `function <name>` / `const <name> =` / `class <name>`
 * in this repo's tracked TypeScript, for any registered name, is a twin and
 * fails this guard — unless that exact file is in the row's `allow` list with a
 * written reason (an allowlist entry means "provably a DIFFERENT capability",
 * never "we know, we will fix it later").
 *
 * Portable by construction: pure Node stdlib, no install, no repo-specific
 * import. Copy it plus its JSON register into matrx-extend / matrx-local /
 * matrx-games unchanged.
 *
 * THE SHAPE LANE (added 2026-09-11). The name register has a hole its own
 * census named: a twin under an UNREGISTERED name is invisible. Byte-size
 * formatting proved it — `formatFileSize` was registered and clean, while 134
 * live byte-size bodies sat in 67 files under `formatBytes`, `fmtBytes`,
 * `humanSize`, `bytesHuman`, `formatSize`, and as bare inline JSX that is not a
 * definition at all. So a second lane matches the SHAPE of the capability
 * rather than its spelling: see `scripts/byte-size-shape.mjs` for the pattern
 * and why a capacity constant (`80 * 1024 * 1024`) can never match it.
 * Shape-lane exemptions live in `shapeAllow` on the row, same rules as `allow`.
 *
 * Modes:
 *   default     — advisory: loud report, exit 0
 *   --strict    — exit 1 on any re-grown twin (the release-gate mode)
 *   --self-test — plant a twin in memory and prove this guard reports it
 *                 (a guard that cannot fail is not a guard) — both lanes
 */

import { byteShapeIn, selfTestByteShape } from "./byte-size-shape.mjs";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STRICT = process.argv.includes("--strict");
const SELF_TEST = process.argv.includes("--self-test");

const register = JSON.parse(
  readFileSync(resolve(ROOT, "scripts/package-twins.json"), "utf8"),
);
const TWINS = register.twins;
const BY_NAME = new Map(TWINS.map((t) => [t.name, t]));

/**
 * Top-level (column-zero) value definitions only. An inner helper inside a
 * function body is indented and is not what this guard is about; a shadowed
 * local name in a closure is not a twin of a package export.
 */
const DEF_RE =
  /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/;

/** Findings for one file's source text. Exported shape: {name, line, text}. */
function twinsIn(file, source) {
  const out = [];
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = DEF_RE.exec(lines[i]);
    if (!m) continue;
    const row = BY_NAME.get(m[1]);
    if (!row) continue;
    if ((row.allow ?? []).some((a) => a.file === file)) continue;
    out.push({ name: m[1], line: i + 1, text: lines[i].trim(), row });
  }
  return out;
}

if (SELF_TEST) {
  const planted = [
    'import { something } from "@/lib/thing";',
    "",
    "/** A re-grown twin of a collapsed package export. */",
    "export function formatRelativeTime(iso: string): string {",
    "  return iso;",
    "}",
    "",
    "function notRegistered(x: number) {",
    "  return x;",
    "}",
  ].join("\n");

  const found = twinsIn("planted.ts", planted);
  if (found.length !== 1 || found[0].name !== "formatRelativeTime") {
    console.error(
      `SELF-TEST FAILED: a re-grown \`formatRelativeTime\` twin was not ` +
        `reported (found ${found.length}).`,
    );
    process.exit(1);
  }
  // The allowlist must be the ONLY way past the guard, and it must be per-file.
  // Planted here rather than read from the register, so this self-test is
  // repo-agnostic: the script and its JSON copy unchanged into every repo, and
  // no repo's real allowlist paths are baked into the proof.
  const row = BY_NAME.get("formatRelativeTime");
  const realAllow = row.allow ?? [];
  row.allow = [{ file: "planted.ts", reason: "self-test only" }];
  const allowed = twinsIn("planted.ts", planted);
  row.allow = realAllow;
  if (allowed.length !== 0) {
    console.error(
      "SELF-TEST FAILED: an allowlisted file still reported its twin.",
    );
    process.exit(1);
  }
  // An indented (inner) definition is not a top-level twin.
  if (twinsIn("planted.ts", "  const formatRelativeTime = (v) => v;").length !== 0) {
    console.error("SELF-TEST FAILED: an inner helper was reported as a twin.");
    process.exit(1);
  }
  // ── the SHAPE lane must also be able to fail ──
  const shape = selfTestByteShape();
  if (!shape.ok) {
    console.error(`SELF-TEST FAILED (shape lane): ${shape.why}.`);
    process.exit(1);
  }
  console.log(
    `check:package-twins self-test PASSED (both lanes can fail) — ` +
      `${TWINS.length} collapsed export(s) registered, plus the byte-size ` +
      `SHAPE rule.`,
  );
  process.exit(0);
}

function trackedFiles() {
  const out = execFileSync("git", ["ls-files", "*.ts", "*.tsx", "*.js", "*.jsx", "*.mjs", "*.cjs"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\n").filter(Boolean);
}

/**
 * The byte-size SHAPE row: which package owns it, and the files whose byte
 * arithmetic is provably NOT a display formatter (a numeric converter feeding a
 * form field, say). `scripts/byte-size-shape.mjs` itself carries the pattern in
 * its own source and must never be scanned.
 */
const BYTE_ROW = BY_NAME.get("formatFileSize");
const BYTE_SHAPE_ALLOW = new Map(
  (BYTE_ROW?.shapeAllow ?? []).map((a) => [a.file, a.reason]),
);

const findings = [];
const shapeFindings = [];
let scanned = 0;
for (const file of trackedFiles()) {
  if (file.startsWith("scripts/package-twins.json")) continue;
  if (file === "scripts/byte-size-shape.mjs") continue;
  if (file === "scripts/check-package-twins.mjs") continue;
  let source;
  try {
    source = readFileSync(resolve(ROOT, file), "utf8");
  } catch {
    continue;
  }
  scanned++;
  for (const f of twinsIn(file, source)) findings.push({ file, ...f });
  if (BYTE_ROW && !BYTE_SHAPE_ALLOW.has(file)) {
    for (const h of byteShapeIn(source)) shapeFindings.push({ file, ...h });
  }
}

if (shapeFindings.length > 0) {
  console.error(
    `check:package-twins [SHAPE]: ${shapeFindings.length} byte-size ` +
      `formatter(s) outside the package — a byte count becoming a unit ` +
      `string is ${BYTE_ROW.package}'s \`formatFileSize\`, whatever the local ` +
      `name is (or even with no name at all, inlined into JSX):\n`,
  );
  for (const f of shapeFindings) {
    console.error(`  ${f.file}:${f.line}  ${f.text}`);
  }
  console.error(
    `\n  fix: import { formatFileSize } from "${BYTE_ROW.package}" and delete ` +
      `the arithmetic — including the " KB"/" MB" literal beside it, because ` +
      `formatFileSize returns the unit. A capacity CONSTANT never matches this ` +
      `rule (it multiplies); if you have a byte division that is genuinely NOT ` +
      `a display formatter, add the file to the row's \`shapeAllow\` list in ` +
      `scripts/package-twins.json WITH a reason.\n`,
  );
}

if (findings.length === 0 && shapeFindings.length === 0) {
  console.log(
    `check:package-twins OK — ${scanned} file(s) scanned, zero local ` +
      `definitions of the ${TWINS.length} collapsed @ai-matrx export(s), and ` +
      `zero byte-size formatter bodies outside the package.`,
  );
  process.exit(0);
}

if (findings.length === 0) process.exit(STRICT ? 1 : 0);

console.error(
  `check:package-twins: ${findings.length} re-grown twin(s) of logic that ` +
    `lives in an @ai-matrx package:\n`,
);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  ${f.text}`);
  console.error(`    owns it: ${f.row.package}  —  ${f.row.why}`);
  console.error(
    `    fix: import { ${f.name} } from "${f.row.package}" and delete this ` +
      `definition. If it is genuinely a DIFFERENT capability, add this file to ` +
      `the row's \`allow\` list in scripts/package-twins.json WITH a reason.\n`,
  );
}
process.exit(STRICT ? 1 : 0);
