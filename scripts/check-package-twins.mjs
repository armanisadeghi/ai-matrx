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
 * …OR in the row's `census` list, which is the OTHER thing (added 2026-09-12).
 * The shape lanes have had `shapeCensus` — loud every run, ratcheted so it can
 * only shrink — since they were built, and the NAME lane had no such list at
 * all: a body that genuinely IS the capability but cannot be collapsed in this
 * session had exactly one place to go, `allow`, which is silent and means
 * something else. That is the abuse an adversarial review caught on the byte
 * shape lane, and the name lane had no honest alternative to offer. It does
 * now: same contract, same ratchet, same rule — `census` is never an exemption,
 * it is a debt that is READ OUT every run and may only get smaller.
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
import {
  formatInputShapeIn,
  selfTestFormatInputShape,
} from "./format-input-shape.mjs";
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
 * THE OWNING PACKAGE'S OWN SOURCE — the one legitimate definition (2026-09-12).
 *
 * WHY THIS EXISTS. Until a third adversarial review, every ROOT this guard ran
 * in was a CONSUMER app, so `git ls-files` never reached `aidream/apps/shared/`
 * — the `@ai-matrx/*` packages themselves, ~937 tracked TS files, and the very
 * place this class was first found duplicated BETWEEN packages. The packages
 * directory is now the seventh root, and in it the register's own statements
 * become checkable: `formatFileSize` really is defined in `kit/src/format.ts`,
 * and every one of the 119 collapsed names really is defined in its package's
 * `src/`. Those definitions are the THING, not twins of it.
 *
 * WHY A MAP IN THE REGISTER RATHER THAN 121 `allow` ENTRIES. An `allow` list is
 * per-file and never ratchets, so 121 hand-written exemptions would rot into a
 * list nobody can audit — and the first thing to rot would be the exemption
 * that is supposed to be narrow. WHY NOT DERIVE THE DIRECTORY FROM THE PACKAGE
 * NAME, either: `@ai-matrx/agents` lives in `matrx-agents/`, so a name-to-path
 * guess is wrong on the first package you try it on, and a guess that is wrong
 * SILENTLY grants an exemption to the wrong directory. So the mapping is DATA:
 * one `ownedBy` block in that root's register, `@ai-matrx/<pkg>` → the path
 * prefix that package's source actually occupies, written once and readable.
 *
 * WHAT IT CANNOT HIDE, which is the whole point: the prefix is the OWNER's, so
 * `media/src/viewers/chrome.tsx` re-growing `formatFileSize` is still a finding
 * — a package duplicating another package is the worst form of this class and
 * the reason this root exists. A consumer repo's register has no `ownedBy` key
 * at all, so nothing about the other six roots changes.
 */
const OWNED_BY = register.ownedBy ?? {};

/** `"@ai-matrx/kit/format"` → the owning package's source prefix, or null. */
function ownerPrefixFor(packageSpecifier) {
  const scoped = /^(@[^/]+\/[^/]+)/.exec(packageSpecifier ?? "");
  if (!scoped) return null;
  return OWNED_BY[scoped[1]] ?? null;
}

/** Is `file` the definition this register row is ABOUT, rather than a twin? */
function isOwningSource(row, file) {
  const prefix = ownerPrefixFor(row?.package);
  return prefix !== null && file.startsWith(prefix);
}

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
  {
    id: "format-input",
    rowName: "formatFileSize",
    module: "scripts/format-input-shape.mjs",
    detect: formatInputShapeIn,
    selfTest: selfTestFormatInputShape,
    what: "a NON-byte quantity entering formatFileSize",
    // THE LANE THE COLLAPSE ITSELF NEEDED. The byte-size lane asks whether a
    // byte count is becoming a unit string; once the arithmetic is collapsed
    // onto the package it is satisfied forever and nothing asks what the
    // number IS. matrx-frontend 738ea2ba55 collapsed five CHARACTER counts
    // onto formatFileSize, and "1.2 MB captured" for 1,258,291 characters
    // passed every lane. Same row, own facts — see `allowKey`.
    allowKey: "inputAllow",
    censusKey: "inputCensus",
    fix:
      "render a COUNT with formatCount from the same module plus the word it " +
      'counts ("1,258,291 chars"), or convert to real bytes with ' +
      'new TextEncoder().encode(s).length / Buffer.byteLength(s, "utf8"). A ' +
      "figure already in KB/MB/GB is multiplied up first. A genuine byte " +
      "length says so in its NAME (byteLength, contentLengthBytes), which is " +
      "worth more than an allowlist entry",
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
    if (isOwningSource(row, file)) continue;
    if ((row.allow ?? []).some((a) => a.file === file)) continue;
    const censused = (row.census ?? []).some((a) => a.file === file);
    out.push({ name: m[1], line: i + 1, text: lines[i].trim(), row, censused });
  }
  return out;
}

/**
 * One shape lane's verdict on one file. Named, rather than inlined in the scan
 * loop, so the self-test can exercise the OWNER leg on a shape lane too: the
 * name lane and the shape lanes must agree about what "this IS the definition"
 * means, and a rule proven in only one of them is proven in neither.
 */
function shapeVerdict(lane, file, source) {
  if (isOwningSource(lane.row, file)) return { kind: "owner", hits: [] };
  if (lane.allow.has(file)) return { kind: "allow", hits: [] };
  const hits = lane.rule.detect(source);
  if (hits.length === 0) return { kind: "clean", hits: [] };
  if (lane.census.has(file)) return { kind: "census", hits };
  return { kind: "finding", hits };
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
  // ── THE NAME CENSUS is LOUD, never silent, and never an `allow` ──
  // A censused file still REPORTS its twin (that is the whole difference from
  // `allow`); it is only spared the failure. If `census` ever starts behaving
  // like `allow`, this goes red.
  {
    const row = BY_NAME.get("formatRelativeTime");
    const realCensus = row.census ?? [];
    row.census = [{ file: "planted.ts", reason: "self-test only" }];
    const censused = twinsIn("planted.ts", planted);
    row.census = realCensus;
    if (censused.length !== 1 || censused[0].censused !== true) {
      console.error(
        "SELF-TEST FAILED: a `census` entry silenced its twin instead of " +
          "reporting it — `census` has become a second `allow`.",
      );
      process.exit(1);
    }
  }
  // ── THE OWNING PACKAGE'S OWN SOURCE is not a twin, and everyone else's is ──
  // Planted in memory like the allowlist leg above, so the proof is
  // repo-agnostic: no real package path is baked into a script that copies
  // byte-for-byte into seven roots.
  {
    const row = BY_NAME.get("formatRelativeTime");
    const realPackage = row.package;
    row.package = "@ai-matrx/selftest";
    OWNED_BY["@ai-matrx/selftest"] = "selftest/src/";
    const lane = {
      rule: { detect: () => [{ line: 1, text: "a planted shape body" }] },
      row,
      allow: new Set(),
      census: new Set(),
    };
    const owned = twinsIn("selftest/src/format.ts", planted);
    const elsewhere = twinsIn("other-package/src/format.ts", planted);
    const shapeOwned = shapeVerdict(lane, "selftest/src/format.ts", "");
    const shapeElsewhere = shapeVerdict(lane, "other-package/src/format.ts", "");
    row.package = realPackage;
    delete OWNED_BY["@ai-matrx/selftest"];

    if (owned.length !== 0) {
      console.error(
        "SELF-TEST FAILED: the owning package's OWN source was reported as a " +
          "twin of itself (name lane).",
      );
      process.exit(1);
    }
    if (elsewhere.length !== 1) {
      console.error(
        "SELF-TEST FAILED: another package re-growing an owned export was NOT " +
          "reported (name lane) — the `ownedBy` prefix is exempting more than " +
          "the owner.",
      );
      process.exit(1);
    }
    if (shapeOwned.kind !== "owner") {
      console.error(
        "SELF-TEST FAILED: a SHAPE lane reported the owning package's own " +
          "source as a body outside the package.",
      );
      process.exit(1);
    }
    if (shapeElsewhere.kind !== "finding") {
      console.error(
        "SELF-TEST FAILED: a SHAPE lane did not report another package " +
          "carrying the capability.",
      );
      process.exit(1);
    }
  }
  // …and an UNMAPPED package gets no exemption. A missing `ownedBy` entry must
  // fail CLOSED, never quietly exempt the directory that happens to share the
  // package's name — that guess is wrong on `@ai-matrx/agents` (it lives in
  // `matrx-agents/`) and a wrong guess grants the exemption to the wrong place.
  if (isOwningSource({ package: "@ai-matrx/unmapped" }, "unmapped/src/x.ts")) {
    console.error(
      "SELF-TEST FAILED: a package with no `ownedBy` entry was granted an " +
        "owner exemption by name.",
    );
    process.exit(1);
  }
  // ── THE NAME CENSUS RATCHET must be able to fail (added 2026-09-12) ──
  // Mutation G8 — `if (!nameCensusHit.has(...))` → `if (false)` — left this
  // self-test PASSED. The ratchet WAS real (a planted stale entry exits 1), but
  // "real at run time" is not "proven", and the next refactor deletes what no
  // fixture defends. Both legs are pinned: an entry nobody hit is stale, and an
  // entry that WAS hit is not.
  {
    const rows = [
      { name: "plantedExport", census: [{ file: "gone.ts", reason: "self-test only" }] },
    ];
    const unhit = staleNameCensus(rows, new Set());
    if (unhit.length !== 1 || !unhit[0].includes("gone.ts")) {
      console.error(
        "SELF-TEST FAILED: a NAME `census` entry whose file no longer defines " +
          "the registered name was NOT reported stale — the ratchet is gone, " +
          "and the census can now only grow.",
      );
      process.exit(1);
    }
    const hit = staleNameCensus(rows, new Set(["plantedExport::gone.ts"]));
    if (hit.length !== 0) {
      console.error(
        "SELF-TEST FAILED: a NAME `census` entry the scan DID hit was reported " +
          "stale — the ratchet now fails every live census entry.",
      );
      process.exit(1);
    }
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
      // PER-LANE FACTS ON A SHARED ROW (2026-09-12). Two lanes now judge the
      // SAME register row from opposite directions — byte-size asks what a
      // local body computes, format-input asks what the call receives — and
      // their allow/census lists cannot be the same list: a file provably not
      // a byte formatter says nothing about the argument it passes, and the
      // census RATCHET below fails any entry its own lane no longer hits. So
      // a rule may name its own keys; default keys keep every existing row
      // and every other repo's register working untouched.
      allow: new Set((row[rule.allowKey ?? "shapeAllow"] ?? []).map((a) => a.file)),
      census: new Set((row[rule.censusKey ?? "shapeCensus"] ?? []).map((a) => a.file)),
      findings: [],
      censusHit: new Set(),
    },
  ];
});

/**
 * The NAME census entries this run did NOT hit — a file that no longer defines
 * the registered name. Left in place, such an entry silently re-opens the hole
 * the day someone re-grows that twin in that same file, so the ratchet fails on
 * it and removing it is part of the collapse.
 *
 * A FUNCTION, NOT AN INLINE LOOP, since 2026-09-12, and that is the whole point
 * of it. A fourth adversarial review mutated the ratchet's condition
 * (`if (!nameCensusHit.has(...))` → `if (false)`) and `--self-test` still
 * printed PASSED: the ratchet was real at run time — a planted stale entry
 * exits 1 — but nothing PROVED it, and an unproven guard is one refactor away
 * from being gone. Inline code cannot be planted against; this can.
 */
export function staleNameCensus(rows, hits) {
  const stale = [];
  for (const row of rows) {
    for (const entry of row.census ?? []) {
      if (!hits.has(`${row.name}::${entry.file}`)) {
        stale.push(`${row.name} → ${entry.file}`);
      }
    }
  }
  return stale;
}

const findings = [];
/** Every `<row>::<file>` pair the NAME census actually covered this run. */
const nameCensusHit = new Set();
const nameCensusFindings = [];
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
  for (const f of twinsIn(file, source)) {
    if (f.censused) {
      nameCensusHit.add(`${f.row.name}::${file}`);
      nameCensusFindings.push({ file, ...f });
      continue;
    }
    findings.push({ file, ...f });
  }
  for (const lane of LANES) {
    const verdict = shapeVerdict(lane, file, source);
    if (verdict.kind === "census") {
      lane.censusHit.add(file);
      continue;
    }
    if (verdict.kind !== "finding") continue;
    for (const h of verdict.hits) lane.findings.push({ file, ...h });
  }
}

/**
 * THE NAME CENSUS, read out loud and RATCHETED — same contract as
 * `shapeCensus`. A census entry whose file no longer defines that name is
 * stale, and left alone it would silently re-open the hole the day someone
 * re-grows the twin in that same file, so removing it is part of the collapse.
 */
let nameCensusFailures = 0;
{
  const stale = staleNameCensus(TWINS, nameCensusHit);
  if (stale.length > 0) {
    nameCensusFailures += stale.length;
    console.error(
      `check:package-twins: ${stale.length} stale \`census\` entr(ies) — these ` +
        `files no longer define the registered name, so the census must shrink ` +
        `by them:\n`,
    );
    for (const s of stale) console.error(`  ${s}`);
    console.error(
      "\n  fix: delete those entries from the row's `census` list in " +
        "scripts/package-twins.json.\n",
    );
  }
  if (nameCensusFindings.length > 0) {
    console.log(
      `check:package-twins CENSUS: ${nameCensusFindings.length} pre-existing ` +
        `definition(s) of a collapsed @ai-matrx export. NOT exempt — collapse ` +
        `pending, and this list may only shrink:`,
    );
    for (const f of nameCensusFindings) {
      const reason =
        (f.row.census ?? []).find((a) => a.file === f.file)?.reason ?? "(no reason recorded)";
      console.log(`  ${f.file}:${f.line}  ${f.name}  —  owns it: ${f.row.package}`);
      console.log(`    blocked on: ${reason}`);
    }
    console.log("");
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
        `\`${rule.censusKey ?? "shapeCensus"}\` entr(ies) on \`${row.name}\` — these files no longer ` +
        `contain ${rule.what}, so the census must shrink by them:\n`,
    );
    for (const f of stale) console.error(`  ${f}`);
    console.error(
      `\n  fix: delete those entries from the \`${row.name}\` row's ` +
        `\`${rule.censusKey ?? "shapeCensus"}\` list in scripts/package-twins.json.\n`,
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
      `row's \`${rule.allowKey ?? "shapeAllow"}\` list in ` +
      `scripts/package-twins.json WITH a reason. ` +
      `"We cannot reach the package from here" is NOT that reason — a body ` +
      `that IS this capability goes in \`${rule.censusKey ?? "shapeCensus"}\`, ` +
      `loud and ratcheted.\n`,
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

const clean =
  findings.length === 0 && shapeFailures === 0 && nameCensusFailures === 0;

if (clean) {
  const censusTotal =
    nameCensusFindings.length +
    LANES.reduce((sum, lane) => sum + lane.censusHit.size, 0);
  console.log(
    `check:package-twins OK — ${scanned} file(s) scanned, zero UN-CENSUSED ` +
      `local definitions of the ${TWINS.length} collapsed @ai-matrx export(s), ` +
      `and zero un-censused bodies across ${LANES.length} SHAPE rule(s)` +
      (censusTotal > 0
        ? `. ${censusTotal} censused item(s) are listed above and are DEBT, not ` +
          `clean — this line is not a claim that nothing is duplicated.`
        : `, and nothing censused.`),
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
          `scripts/package-twins.json WITH a reason. If it IS this capability ` +
          `and you cannot collapse it in this session, it goes in the row's ` +
          `\`census\` list — loud every run and ratcheted — and NEVER in ` +
          `\`allow\`, which means "provably something else".\n`,
      );
    }
  }
  advisoryNote(findings.length + shapeFailures + nameCensusFailures);
}

/**
 * `process.exitCode` rather than `process.exit()`. The advisory line above is
 * the LAST thing written, and an explicit exit can cut a final piped stderr
 * write off before it flushes — which is exactly what happened the first time
 * this note was added, so it printed to a terminal and vanished into a pipe.
 */
process.exitCode = clean ? 0 : STRICT ? 1 : 0;
