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
 * THE SHAPE LANES (added 2026-09-11). The name register has a hole its own
 * census named: a twin under an UNREGISTERED name is invisible. Byte-size
 * formatting proved it — `formatFileSize` was registered and clean, while 134
 * live byte-size bodies sat in 67 files under `formatBytes`, `fmtBytes`,
 * `humanSize`, `bytesHuman`, `formatSize`, and as bare inline JSX that is not a
 * definition at all. Durations proved it a second time the same day — all four
 * `formatDuration*` exports registered and clean, while aidream's dashboard
 * carried seven `fmtMs` / `fmtMsSummary` bodies. So a second KIND of lane
 * matches the SHAPE of a capability rather than its spelling. Each lane is a
 * module beside this one (`scripts/byte-size-shape.mjs`,
 * `scripts/duration-shape.mjs`) carrying the pattern, the reason a lookalike
 * (`80 * 1024 * 1024`, `TIMEOUT_MS = 30 * 1000`) can never match it, and a
 * self-test that plants a body. Adding a shape rule is one entry in
 * `SHAPE_RULES` below plus its module — never a new lane of copied code.
 *
 * TWO LISTS, TWO MEANINGS, on the shape rule's register row:
 *   `shapeAllow`  — provably NOT this capability (byte arithmetic feeding a
 *                   form field, say). Silent. Same rule as `allow`: never
 *                   "we know, we will fix it later".
 *   `shapeCensus` — pre-existing bodies that ARE this capability and have not
 *                   been collapsed yet. NOT an exemption: reported loudly every
 *                   run, and RATCHETED — a census entry whose file no longer
 *                   has a finding FAILS, so the list can only shrink. Same
 *                   contract as `scripts/client-hard-delete-allowlist.json`.
 *
 * Modes:
 *   default     — advisory: loud report, exit 0
 *   --strict    — exit 1 on any re-grown twin (the release-gate mode)
 *   --self-test — plant a twin in memory and prove this guard reports it
 *                 (a guard that cannot fail is not a guard) — every lane
 */

import { byteShapeIn, selfTestByteShape } from "./byte-size-shape.mjs";
import { durationShapeIn, selfTestDurationShape } from "./duration-shape.mjs";
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
 * THE SHAPE RULES. One row each: the register row that owns the capability,
 * the detector, its self-test, and the sentence the report prints. The
 * detector modules are never scanned — each one carries the pattern it hunts
 * in its own source and would report itself forever.
 */
const SHAPE_RULES = [
  {
    id: "byte-size",
    rowName: "formatFileSize",
    module: "scripts/byte-size-shape.mjs",
    detect: byteShapeIn,
    selfTest: selfTestByteShape,
    what: "a byte count becoming a unit string",
    fix:
      "delete the arithmetic — including the \" KB\"/\" MB\" literal beside " +
      "it, because formatFileSize returns the unit. A capacity CONSTANT never " +
      "matches this rule (it multiplies)",
  },
  {
    id: "duration",
    rowName: "formatDurationMs",
    module: "scripts/duration-shape.mjs",
    detect: durationShapeIn,
    selfTest: selfTestDurationShape,
    what: "a millisecond count becoming a unit string",
    fix:
      "delete the arithmetic and pick the voice the site rendered — " +
      '`style: "clock"` (9:04), `"compact"` (5.2s, 5m 30s) or `"coarse"` ' +
      "(45 min). THE UNIT LAW: the unit is in the NAME — formatDurationMs / " +
      "formatDurationSeconds / formatDurationMinutes, never a bare number. A " +
      "relative \"3m ago\" is formatRelativeTime, not a duration. Plain time " +
      "arithmetic (a timeout budget, an API field) never matches this rule",
  },
];
const SHAPE_MODULES = new Set(SHAPE_RULES.map((r) => r.module));

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
  // ── every SHAPE lane must also be able to fail ──
  for (const rule of SHAPE_RULES) {
    const shape = rule.selfTest();
    if (!shape.ok) {
      console.error(`SELF-TEST FAILED (${rule.id} shape lane): ${shape.why}.`);
      process.exit(1);
    }
  }
  console.log(
    `check:package-twins self-test PASSED (every lane can fail) — ` +
      `${TWINS.length} collapsed export(s) registered, plus ` +
      `${SHAPE_RULES.length} SHAPE rule(s): ` +
      `${SHAPE_RULES.map((r) => r.id).join(", ")}.`,
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
 * Each live shape lane, resolved against the register: the row that owns the
 * capability, the files provably NOT it (`shapeAllow`, silent) and the
 * pre-existing bodies awaiting collapse (`shapeCensus`, loud and ratcheted).
 */
const LANES = SHAPE_RULES.flatMap((rule) => {
  const row = BY_NAME.get(rule.rowName);
  if (!row) return [];
  return [
    {
      rule,
      row,
      allow: new Set((row.shapeAllow ?? []).map((a) => a.file)),
      census: new Set((row.shapeCensus ?? []).map((a) => a.file)),
      findings: [],
      censusHit: new Set(),
    },
  ];
});

const findings = [];
let scanned = 0;
for (const file of trackedFiles()) {
  if (file.startsWith("scripts/package-twins.json")) continue;
  if (file === "scripts/check-package-twins.mjs") continue;
  if (SHAPE_MODULES.has(file)) continue;
  let source;
  try {
    source = readFileSync(resolve(ROOT, file), "utf8");
  } catch {
    continue;
  }
  scanned++;
  for (const f of twinsIn(file, source)) findings.push({ file, ...f });
  for (const lane of LANES) {
    if (lane.allow.has(file)) continue;
    const hits = lane.rule.detect(source);
    if (hits.length === 0) continue;
    if (lane.census.has(file)) {
      lane.censusHit.add(file);
      continue;
    }
    for (const h of hits) lane.findings.push({ file, ...h });
  }
}

let shapeFailures = 0;
for (const lane of LANES) {
  const { rule, row } = lane;
  // THE RATCHET: a census entry that no longer has a finding is stale. Left
  // alone it would silently re-open the hole the day someone re-grows a body
  // in that same file, so removing it is part of the collapse.
  const stale = [...lane.census].filter((f) => !lane.censusHit.has(f));
  if (stale.length > 0) {
    shapeFailures += stale.length;
    console.error(
      `check:package-twins [SHAPE/${rule.id}]: ${stale.length} stale ` +
        `\`shapeCensus\` entr(ies) on \`${row.name}\` — these files no longer ` +
        `contain ${rule.what}, so the census must shrink by them:\n`,
    );
    for (const f of stale) console.error(`  ${f}`);
    console.error(
      `\n  fix: delete those entries from the \`${row.name}\` row's ` +
        `\`shapeCensus\` list in scripts/package-twins.json.\n`,
    );
  }

  if (lane.censusHit.size > 0) {
    console.log(
      `check:package-twins [SHAPE/${rule.id}] CENSUS: ${lane.censusHit.size} ` +
        `pre-existing file(s) still carry ${rule.what} and belong to ` +
        `${row.package}'s \`${row.name}\`. Not exempt — collapse pending. ` +
        `This list may only shrink.`,
    );
  }

  if (lane.findings.length === 0) continue;
  shapeFailures += lane.findings.length;
  console.error(
    `check:package-twins [SHAPE/${rule.id}]: ${lane.findings.length} ` +
      `body/bodies outside the package — ${rule.what} is ${row.package}'s ` +
      `\`${row.name}\`, whatever the local name is (or even with no name at ` +
      `all, inlined into JSX):\n`,
  );
  for (const f of lane.findings) {
    console.error(`  ${f.file}:${f.line}  ${f.text}`);
  }
  console.error(
    `\n  fix: import from "${row.package}" and ${rule.fix}. If a hit is ` +
      `genuinely NOT this capability, add the file to the \`${row.name}\` ` +
      `row's \`shapeAllow\` list in scripts/package-twins.json WITH a reason.\n`,
  );
}

/**
 * THE TWO MODES ARE DELIBERATE, and this line exists so exit 0 can never be
 * mistaken for "clean". The default run is a CENSUS that informs without
 * blocking: it prints every finding loudly and exits 0, so a developer whose
 * change has nothing to do with byte sizes is never stopped by a pre-existing
 * body someone else left. `--strict` is the blocking run, and it is what the
 * release gates call (`check:package-twins:strict`). An independent review in
 * 2026-09-11 asked whether the split was an accident; it is not — but it was
 * silent about itself, which is how a loud report gets read as a pass.
 */
function advisoryNote(count) {
  if (STRICT) return;
  console.error(
    `check:package-twins: ADVISORY mode — ${count} finding(s) above and ` +
      `exiting 0 anyway. Exit 0 here does NOT mean clean. The blocking run is ` +
      `\`pnpm check:package-twins:strict\`, which the release gates call.\n`,
  );
}

const clean = findings.length === 0 && shapeFailures === 0;

if (clean) {
  console.log(
    `check:package-twins OK — ${scanned} file(s) scanned, zero local ` +
      `definitions of the ${TWINS.length} collapsed @ai-matrx export(s), and ` +
      `zero un-censused bodies across ${LANES.length} SHAPE rule(s).`,
  );
} else {
  if (findings.length > 0) {
    console.error(
      `check:package-twins: ${findings.length} re-grown twin(s) of logic that ` +
        `lives in an @ai-matrx package:\n`,
    );
    for (const f of findings) {
      console.error(`  ${f.file}:${f.line}  ${f.text}`);
      console.error(`    owns it: ${f.row.package}  —  ${f.row.why}`);
      console.error(
        `    fix: import { ${f.name} } from "${f.row.package}" and delete ` +
          `this definition. If it is genuinely a DIFFERENT capability, add ` +
          `this file to the row's \`allow\` list in ` +
          `scripts/package-twins.json WITH a reason.\n`,
      );
    }
  }
  advisoryNote(findings.length + shapeFailures);
}

/**
 * `process.exitCode` rather than `process.exit()`. The advisory line above is
 * the LAST thing written, and an explicit exit can cut a final piped stderr
 * write off before it flushes — which is exactly what happened the first time
 * this note was added, so it printed to a terminal and vanished into a pipe.
 */
process.exitCode = clean ? 0 : STRICT ? 1 : 0;
