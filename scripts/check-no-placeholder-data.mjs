#!/usr/bin/env node
/**
 * check-no-placeholder-data.mjs — THE OWNER'S NO-FAKE-TEST-DATA LAW, ENFORCED.
 *
 * The law, 2026-09-21: every piece of data this platform seeds, tests with,
 * demos or photographs comes from a REAL USE CASE a real business or a real
 * person would have. No "Acme", no "foo", no "test table", no "Job 001", no
 * lorem ipsum, no ".example" mailboxes. A screenshot of "Job 001 / Ada / 42"
 * tells the owner nothing about whether the product works.
 *
 * THE PATTERNS ARE NOT DEFINED HERE. They live once, in
 * `@ai-matrx/records/use-cases`, shared with that library's own validator and
 * with aidream's twin of this guard, so all three can never disagree about what
 * junk means. This is the twin of `aidream/scripts/check_no_placeholder_data.mjs`.
 *
 * WHAT IT SCANS. By default only the data that reaches a SCREEN — demo
 * harnesses, seeds, screenshot scripts, campaign-test fixtures and the
 * Try-everything route's sample rows. Product code is never scanned: a bar chart
 * and a dashboard widget are vocabulary, not junk, and a guard that reddens on
 * `toolbar` is a guard people switch off within a day. `--wide` adds every other
 * test file; that is the backlog census, not the gate.
 *
 * THE ESCAPE HATCH. A line carrying `matrx-real-data:allow <reason>` is exempt.
 * The reason is required and it is in the diff.
 *
 *   pnpm check:no-placeholder-data              # the guard
 *   pnpm check:no-placeholder-data -- --wide    # every test file (backlog census)
 *   pnpm check:no-placeholder-data:self-test    # prove it can fail
 *   pnpm check:fixture-account-doors            # ONLY how scripts/tests make PEOPLE; exit 0 = clean (--root <dir> scans another tree)
 */
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));

/**
 * The patterns come from the package, and NOTHING here falls back to a private
 * copy: a guard quietly enforcing a stale list is worse than one that says it is
 * not running. If the installed `@ai-matrx/records` predates the `./use-cases`
 * subpath, this announces that plainly, with the remedy, and stands down rather
 * than turning red on a tree nobody can fix from here.
 * (Changed 2026-09-30: it no longer exits 0. A guard that cannot run FAILS, with the remedy; exit 0 read as a pass.)
 */
let findPlaceholders;
let describePlaceholder;
let findAccountDoorViolations;
try {
  ({ findPlaceholders, describePlaceholder, findAccountDoorViolations } = await import("@ai-matrx/records/use-cases"));
} catch (packageError) {
  // ONE documented escape, and it announces itself every time it is used:
  // MATRX_RECORDS_USE_CASES points at the library's source in a sibling aidream
  // checkout. It exists so this guard can be PROVEN — self-test and census —
  // before @ai-matrx/records has been released with the ./use-cases subpath. It
  // is never used by CI, which has no such checkout, and the moment the release
  // lands the import above succeeds and this branch stops being reached.
  const override = process.env.MATRX_RECORDS_USE_CASES;
  if (override) {
    console.error(
      `check-no-placeholder-data: reading the banned patterns from ${override} via MATRX_RECORDS_USE_CASES, not from the installed package.`,
    );
    ({ findPlaceholders, describePlaceholder, findAccountDoorViolations } = await import(override));
  }
}

if (!findPlaceholders) {
  let installed = "not installed";
  try {
    installed = JSON.parse(
      readFileSync(join(REPO, "node_modules/@ai-matrx/records/package.json"), "utf8"),
    ).version;
  } catch {
    /* leave it as "not installed" */
  }
  console.error(
    "check-no-placeholder-data: FAILING ON PURPOSE — the guard cannot run, and a guard that cannot run is never a pass.\n" +
      `  The banned patterns live in @ai-matrx/records/use-cases, and the installed records is ${installed}, which does not carry that subpath.\n` +
      "  REMEDY: install a released @ai-matrx/records that ships ./use-cases (pnpm up @ai-matrx/records@latest), or for a local proof\n" +
      "  point MATRX_RECORDS_USE_CASES at apps/shared/records/src/use-cases/placeholders.ts in the aidream checkout.",
  );
  process.exit(1);
}

if (!findAccountDoorViolations && process.env.MATRX_RECORDS_USE_CASES) {
  // The installed package predates the account-door rules; the documented local-proof override carries them.
  console.error(
    `check-no-placeholder-data: reading the banned patterns from ${process.env.MATRX_RECORDS_USE_CASES} via MATRX_RECORDS_USE_CASES, not from the installed package (which predates the account-door rules).`,
  );
  ({ findPlaceholders, describePlaceholder, findAccountDoorViolations } = await import(process.env.MATRX_RECORDS_USE_CASES));
}

if (!findAccountDoorViolations) {
  console.error(
    "check-no-placeholder-data: FAILING ON PURPOSE — the installed @ai-matrx/records predates the account-door rules\n" +
      "  (findAccountDoorViolations: runtime junk names, reserved-TLD mailboxes, raw auth.users creation), so the guard\n" +
      "  cannot tell whether a script makes an untagged test account. REMEDY: pnpm up @ai-matrx/records@latest once the\n" +
      "  release that adds them is published; for a local proof set MATRX_RECORDS_USE_CASES to the aidream checkout's\n" +
      "  apps/shared/records/src/use-cases/placeholders.ts.",
  );
  process.exit(1);
}

/** WHERE DATA THE OWNER ACTUALLY SEES LIVES — the blocking scope. */
const SCAN = [
  /(^|\/)demos?\//,
  /(^|\/)seeds?\//,
  /(^|\/)campaign-tests\//,
  /(^|\/)try-everything\//,
  /(^|\/)[^/]*seed[^/]*\.(sql|ts|tsx|mjs|js)$/i,
  /(^|\/)[^/]*screenshot[^/]*\.(ts|tsx|mjs|js|cjs)$/i,
  /(^|\/)[^/]*demo[^/]*\.(ts|tsx|mjs|js|json)$/i,
  /(^|\/)render-[^/]*\.(cjs|mjs|js|ts)$/i,
];

/** Everywhere else test data lives. Scanned only under --wide. */
const SCAN_WIDE = [
  ...SCAN,
  /(^|\/)__tests__\//,
  /(^|\/)__fixtures__\//,
  /(^|\/)fixtures?\//,
  /(^|\/)mocks?\//,
  /(^|\/)tests?\//,
  /(^|\/)e2e\//,
  /\.test\.[cm]?[jt]sx?$/,
  /\.spec\.[cm]?[jt]sx?$/,
  /(^|\/)[^/]*fixture[^/]*\.(json|sql|ts|tsx|mjs|js)$/i,
];

const WIDE = process.argv.includes("--wide");
/** `--account-doors`: ONLY the three account-door rules (how a script or test makes a person). */
const DOORS_ONLY = process.argv.includes("--account-doors");
const ROOT_FLAG = process.argv.indexOf("--root");
const ROOT = ROOT_FLAG >= 0 ? process.argv[ROOT_FLAG + 1] : REPO;
const SCANNING = DOORS_ONLY ? [] : WIDE ? SCAN_WIDE : SCAN;

/**
 * THE ACCOUNT DOORS' SCOPE (junk-data-cleanup, 2026-09-30). How a script or test makes a PERSON is a
 * different class from the screen data above: the junk accounts in the live database were all made by
 * scripts and tests nobody scanned (scripts/hr, scripts/access-matrix, one-off proofs, walks). Only the
 * three account-door rules (runtime-built junk names, reserved-TLD mailboxes, raw auth-user creation)
 * run here, never the screen patterns. Product code is never in scope: the portal invite route creates
 * a real client's account on purpose.
 */
const ACCOUNT_DOOR_SCOPE = [
  /(^|\/)scripts\//,
  /(^|\/)tests?\//,
  /(^|\/)__tests__\//,
  /(^|\/)e2e\//,
  /\.(?:test|spec)\.[cm]?[jt]sx?$/,
  /(^|\/)test_[^/]+\.py$/,
  /[^/]+_test\.py$/,
];
const ACCOUNT_DOOR_TEXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|sql)$/;
/** The factory and the guards themselves discuss the junk they refuse. */
const ACCOUNT_DOOR_EXEMPT_FILES = [
  /(^|\/)persona\.(py|mjs)$/,
  /(^|\/)persona\.test\.mjs$/,
  /(^|\/)check[-_]no[-_]placeholder[-_]data\.mjs$/,
];

const SKIP_DIRECTORY = new Set([
  "node_modules",
  "dist",
  "build",
  ".next",
  ".git",
  ".wt",
  ".turbo",
  ".vercel",
  "coverage",
  "__pycache__",
]);

/** A named build output (`dist-demo`, `dist-storybook`): generated bundle text, never authored data, and usually git-ignored. */
const BUILD_OUTPUT_DIRECTORY = /^dist-[\w.-]+$/;

const TEXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|sql|json|md|yaml|yml|csv)$/;

/** Not test data at all, with the reason each one is out of scope. */
const NOT_OUR_BUSINESS = [
  // APPLIED MIGRATIONS ARE HISTORY. A migration records what was run against the
  // database; editing one makes the file disagree with the row it produced. Junk
  // inside an applied migration is fixed forward, with a new migration.
  /(^|\/)migrations\/.*\.sql$/,
];

/** A line that is only a comment is PROSE, not data. */
const COMMENT_ONLY = /^\s*(?:\/\/|#|--|\*|\/\*)/;

/**
 * Keys whose value is an EMPTY FIELD'S HINT, not a value. A placeholder exists
 * to show the shape of what to type; "user@example.com" is the correct thing to
 * put there and a realistic address is the wrong thing, because it reads as a
 * value already entered.
 */
const UI_HINT_KEY =
  /["']?(?:placeholder|placeholder_example|placeholderText|placeholder_text|example|example_value|hint|format_example|mask|pattern_example)["']?\s*[:=]/i;

/** Patterns that, IN SOURCE, only mean junk when the token is a VALUE. */
const ONLY_AS_A_VALUE = new Set(["sequential-names"]);

/**
 * Is the match the WHOLE of a quoted value on this line — allowing only a short
 * word or two in front of it? That is what separates generated filler ("Bulk job
 * 000089", whose fifty siblings step by exactly 90) from vocabulary
 * (`toContain("row 3:")`, an importer naming the CSV line that failed).
 */
function isWholeQuotedValue(line, match) {
  for (const quote of ['"', "'", "`"]) {
    const parts = line.split(quote);
    for (let i = 1; i < parts.length; i += 2) {
      const span = parts[i];
      if (!span.endsWith(match)) continue;
      const prefix = span.slice(0, span.length - match.length);
      if (/^[A-Za-z]{0,12}[ ]?[A-Za-z]{0,12}[ ]?$/.test(prefix)) return true;
    }
  }
  return false;
}

function walk(directory, found = [], root = REPO) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORY.has(entry.name) || BUILD_OUTPUT_DIRECTORY.test(entry.name)) continue;
      // Root-level scratch trees (git-ignored): other agents' copies of this repo, never our source.
      if (directory === root && (entry.name === "work" || entry.name === "tmp")) continue;
      walk(full, found, root);
      continue;
    }
    if (!entry.isFile() || !TEXT.test(entry.name)) continue;
    const rel = relative(root, full).split(sep).join("/");
    if (NOT_OUR_BUSINESS.some((p) => p.test(rel))) continue;
    const screen = SCANNING.some((p) => p.test(rel));
    const doors =
      ACCOUNT_DOOR_TEXT.test(entry.name) &&
      ACCOUNT_DOOR_SCOPE.some((p) => p.test(rel)) &&
      !ACCOUNT_DOOR_EXEMPT_FILES.some((p) => p.test(rel));
    if (!screen && !doors) continue;
    found.push({ full, rel, screen, doors });
  }
  return found;
}

function scanFile(file) {
  let text;
  try {
    text = readFileSync(file.full, "utf8");
  } catch {
    return [];
  }
  if (text.includes(" ")) return [];
  const hits = [];
  if (file.doors) {
    for (const hit of findAccountDoorViolations(text)) hits.push({ file: file.rel, ...hit });
  }
  if (file.screen === false) return hits;
  text.split("\n").forEach((line, index) => {
    if (COMMENT_ONLY.test(line)) return;
    if (UI_HINT_KEY.test(line)) return;
    for (const hit of findPlaceholders(line)) {
      if (ONLY_AS_A_VALUE.has(hit.patternId) && !isWholeQuotedValue(line, hit.match)) continue;
      hits.push({ file: file.rel, line: index + 1, ...hit });
    }
  });
  return hits;
}


// ── --live: THE SAME LAW, ASKED OF THE ROWS ON THE SCREEN ────────────────────
//
// WHY THIS HALF HAD TO EXIST (lane ORG-CLEANUP-2, 2026-09-23). The scan above reads
// SOURCE. It cannot see a row a suite wrote at 3 a.m. against the live database, and that
// is where the law was actually being broken: 35 throwaway organizations were archived on
// 2026-09-22 and 48 MORE were on the owner's organization picker the next morning, named
// "ZZZ APPROVAL-FIX throwaway 6d9b1708 — safe to delete" and "Throwaway Dash 3fee58c2".
// A guard that reads only files says "clean" the whole time that is happening.
//
// So: sign in as admin@admin.com through the ordinary authenticated client — the same seat
// and the same door the picker uses, never the service role — read every LIVE organization
// and ask the SAME `findPlaceholders` of its name and its slug. An archived organization is
// not on the screen and is not scanned; putting one away is the sanctioned fix, and the
// hard delete never is (Arman, 2026-09-20: archive, never delete).
//
// `iam.placeholder_in_a_name(name, slug)` on the platform database carries the same list
// and refuses these at the organization door, so nothing new can arrive. This check is what
// says whether anything is there ALREADY, including a row written before the door existed.
async function liveSeat() {
  const { createClient } = await import("@supabase/supabase-js");
  const { readFileSync: read } = await import("node:fs");
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of read(join(REPO, file), "utf8").split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* the variable may come from the environment instead */
    }
  }
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } },
  );
  const { data, error } = await sb.auth.signInWithPassword({
    email: process.env.AI_ADMIN_USERNAME,
    password: process.env.AI_ADMIN_PASSWORD,
  });
  if (error) throw new Error(`the admin seat could not sign in: ${error.message}`);
  return { sb, email: data.user.email };
}

/** Every LIVE organization whose name or slug carries junk, read from the admin seat. */
async function liveOffenders(sb) {
  const { data, error } = await sb
    .schema("iam")
    .from("organizations")
    .select("id, name, slug")
    .is("archived_at", null);
  if (error) throw new Error(`could not read the live organizations: ${error.message}`);
  const out = [];
  for (const org of data) {
    const hits = [
      ...findPlaceholders(org.name ?? ""),
      ...findPlaceholders(org.slug ?? ""),
    ];
    if (hits.length > 0) out.push({ org, hits });
  }
  return { scanned: data.length, offenders: out };
}

function reportLive({ scanned, offenders }) {
  if (offenders.length === 0) {
    console.log(
      `check-no-placeholder-data --live: clean — ${scanned} live organizations on the picker and not one carries a placeholder name.`,
    );
    return 0;
  }
  console.error(
    `check-no-placeholder-data --live: ${offenders.length} of ${scanned} LIVE organizations carry a placeholder name.\n` +
      "These are on the owner's organization picker right now.\n" +
      "The law (2026-09-21): an organization carries the use case's own business name; 'test fixture' is a\n" +
      "CLASSIFICATION and lives in settings.test_fixture, which is how cleanup finds it.\n" +
      "REMEDY: node scripts/campaign-tests/orgcleanup_archive.mjs sweep — it re-runs the evidence test\n" +
      "(test seats only) and archives, never deletes. Anything with a real person in it is printed for Arman.\n",
  );
  for (const { org, hits } of offenders) {
    const kinds = [...new Set(hits.map((h) => h.patternId))].sort().join(", ");
    console.error(`  ${org.id}  ${org.name}  [${kinds}]`);
  }
  return 1;
}

if (process.argv.includes("--live")) {
  const { sb, email } = await liveSeat();
  console.log(`check-no-placeholder-data --live: seat ${email}`);
  process.exit(reportLive(await liveOffenders(sb)));
}

// ── --live-self-test: the live half, shown RED and then GREEN, on real rows ──
//
// A guard nobody has watched fail is not a guard, and a live guard cannot be proven by a
// planted file. So this proves it on the live database the way the defect actually
// happened: it RESTORES one organization that a sweep already archived for carrying a junk
// name, shows the check go RED on it, puts it back, and shows it go GREEN. Nothing is
// created and nothing is deleted — the only row touched is one already classified
// `test_fixture`, and it ends exactly as it started.
if (process.argv.includes("--live-self-test")) {
  const { sb, email } = await liveSeat();
  console.log(`check-no-placeholder-data --live-self-test: seat ${email}`);

  const { data: archived, error: readErr } = await sb
    .schema("iam")
    .from("organizations")
    .select("id, name, slug, settings")
    .not("archived_at", "is", null)
    .limit(500);
  if (readErr) throw new Error(`could not read the archived organizations: ${readErr.message}`);
  const victim = archived.find(
    (o) =>
      (o.settings ?? {}).test_fixture &&
      [...findPlaceholders(o.name ?? ""), ...findPlaceholders(o.slug ?? "")].length > 0,
  );
  if (!victim) {
    console.error(
      "check-no-placeholder-data --live-self-test: STANDING DOWN, and this is not a pass.\n" +
        "  It proves the live guard by restoring an ALREADY-ARCHIVED junk-named test fixture and putting it\n" +
        "  back, and there is no such row to borrow. It never creates one: the organization door now refuses\n" +
        "  a junk name outright (iam.placeholder_in_a_name), which is the point.",
    );
    process.exit(1);
  }

  const restore = async () =>
    (await sb.schema("iam").rpc("organization_restore", { p_org: victim.id, p_confirm_name: victim.name }));
  const archive = async () =>
    (await sb.schema("iam").rpc("organization_archive", {
      p_org: victim.id,
      p_confirm_name: victim.name,
      p_reason: "check:no-placeholder-data --live-self-test put this back where it was.",
    }));

  let red = null;
  let green = null;
  try {
    const { error } = await restore();
    if (error) throw new Error(`could not restore ${victim.id} for the RED leg: ${error.message}`);
    red = await liveOffenders(sb);
  } finally {
    const { error } = await archive();
    if (error) throw new Error(`COULD NOT PUT ${victim.id} BACK: ${error.message}`);
    green = await liveOffenders(sb);
  }

  const sawIt = red && red.offenders.some((o) => o.org.id === victim.id);
  const ok = sawIt && green.offenders.length === 0;
  console.log(
    ok
      ? `check-no-placeholder-data --live-self-test: PASS — RED with "${victim.name}" back on the picker (${red.offenders.length} offender(s) of ${red.scanned}), GREEN with it archived again (0 of ${green.scanned}).`
      : `check-no-placeholder-data --live-self-test: FAIL — RED leg ${sawIt ? "saw" : "DID NOT SEE"} ${victim.id}; GREEN leg reported ${green.offenders.length} offender(s).`,
  );
  process.exit(ok ? 0 : 1);
}

// ── the self-test: a guard that has never been seen to fail is not a guard ───
if (process.argv.includes("--self-test")) {
  const directory = mkdtempSync(join(tmpdir(), "placeholder-guard-selftest-"));
  const planted = join(directory, "seed-data.ts");
  writeFileSync(
    planted,
    [
      "export const rows = [",
      '  { client: "Acme Corp" },',
      '  { job: "Job 001" },',
      '  { email: "someone@example.com" },',
      '  { client: "Acme" }, // matrx-real-data:allow proves-the-pragma-works',
      "];",
    ].join("\n"),
  );
  const hits = scanFile({ full: planted, rel: "seed-data.ts" });
  const ids = [...new Set(hits.map((h) => h.patternId))].sort();
  const expected = ["acme", "example-domain", "sequential-names"];
  const screenOk = expected.every((id) => ids.includes(id)) && hits.length === 3;

  // THE ACCOUNT DOORS: a scratch copy of a repo with a script and a test that make people the forbidden
  // ways. The walk must reach them (scripts/, tests/), each rule must fire, and the pragma must exempt
  // exactly its own line. Built from fragments so this file never carries the junk itself.
  const scratch = mkdtempSync(join(tmpdir(), "account-door-selftest-"));
  mkdirSync(join(scratch, "scripts", "hr"), { recursive: true });
  mkdirSync(join(scratch, "tests"), { recursive: true });
  const at = "@";
  writeFileSync(
    join(scratch, "scripts", "hr", "make_accounts.mjs"),
    [
      "const email = `zzz.${tag}.${n}" + at + "fixtures.aimatrx.com`;",
      'await fetch(base + "/auth/v1/admin/users", { method: "POST", body });',
      'const other = "someone' + at + 'example.invalid"; await sb.auth.signUp({ email: other });',
      "const exempt = `probe-${x}" + at + "probe.invalid`; // matrx-fixture:rollback-only proves the pragma works",
    ].join("\n"),
  );
  writeFileSync(
    join(scratch, "tests", "make_a_user.test.ts"),
    'await pg.query("insert into auth.users (id) values ($1)", [uid]);\n',
  );
  const doorHits = walk(scratch, [], scratch).flatMap(scanFile);
  const doorIds = [...new Set(doorHits.map((h) => h.patternId))].sort();
  const doorExpected = ["raw-auth-user-creation", "reserved-tld-mailbox", "runtime-junk-name"];
  const doorsOk =
    doorExpected.every((id) => doorIds.includes(id)) &&
    doorHits.every((h) => h.line !== 4) &&
    doorHits.some((h) => h.file === "tests/make_a_user.test.ts");
  const ok = screenOk && doorsOk;
  console.log(
    ok
      ? `check-no-placeholder-data --self-test: PASS — the guard caught ${hits.length} planted placeholder defects (${ids.join(", ")}), ${doorHits.length} planted account-door defects (${doorIds.join(", ")}) and honoured the exemptions.`
      : `check-no-placeholder-data --self-test: FAIL — screen rules ${screenOk ? "ok" : `expected 3 hits across ${expected.join(", ")}, got ${hits.length} across ${ids.join(", ") || "nothing"}`}; account doors ${doorsOk ? "ok" : `expected ${doorExpected.join(", ")} (and none on the pragma line), got ${doorIds.join(", ") || "nothing"}`}.`,
  );
  process.exit(ok ? 0 : 1);
}

const hits = walk(ROOT, [], ROOT).flatMap(scanFile);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(hits, null, 2));
  process.exit(hits.length === 0 ? 0 : 1);
}

if (hits.length === 0) {
  console.log(
    "check-no-placeholder-data: clean — every demo, seed, fixture and screenshot script in this repo draws its data from a real use case.",
  );
  process.exit(0);
}

const byFile = new Map();
for (const hit of hits) {
  if (!byFile.has(hit.file)) byFile.set(hit.file, []);
  byFile.get(hit.file).push(hit);
}

const census = process.argv.includes("--census");
console.error(
  `check-no-placeholder-data: ${hits.length} piece(s) of placeholder data across ${byFile.size} file(s).\n` +
    "The law (2026-09-21): test data comes from a REAL USE CASE a real business would have.\n" +
    "Draw it from @ai-matrx/records/use-cases — its README says how to add a use case.\n",
);
for (const [file, fileHits] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const kinds = [...new Set(fileHits.map((h) => h.patternId))].sort().join(", ");
  console.error(`${file} — ${fileHits.length} hit(s): ${kinds}`);
  if (!census) {
    for (const hit of fileHits.slice(0, 5)) {
      console.error(`  ${hit.line}: ${describePlaceholder(hit)}`);
    }
    if (fileHits.length > 5) console.error(`  … and ${fileHits.length - 5} more in this file.`);
  }
}
process.exit(1);
