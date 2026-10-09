/**
 * check-no-default-organization — ONE ACTIVE ORGANIZATION, CHOSEN ONLY BY THE LOAD LADDER.
 *
 * THE RULING (Arman, 2026-10-07; STATE rules 11–14)
 * -------------------------------------------------
 * The client picks the active organization ONCE, at load: last active -> start-up
 * organization -> first organization. There is no "default organization" any more.
 * The two account columns the ladder reads — `last_active_organization_id` and
 * `startup_organization_id` — and the two RPCs that write them
 * (`users.set_last_active_organization`, `users.set_startup_organization`) belong
 * to ONE module, `lib/organizations/accountOrganizationChoices.ts`. Nothing else
 * may read them or call the RPCs: a second reader is a second place that chooses
 * an organization for the person.
 *
 * THE TWO RULES (code AND repo SQL; migrations and generated types are exempt)
 * ----------------------------------------------------------------------------
 *  1. ONE READER. A code mention (comments stripped) of the two columns or the two
 *     RPCs outside `accountOrganizationChoices.ts` fails. Tests are not scanned.
 *  2. THE WORDS ARE RETIRED. "default organization", `defaultOrganizationId`,
 *     `default_organization_id`, `selectDefaultOrganizationId` and the dropped SQL
 *     function `_default_organization_is_a_membership` appear nowhere — comments
 *     included. A record's own organization is `initialOrganizationId`, the setting
 *     is the "start-up organization". (This guard's own name is not a mention.)
 *
 * A genuine historic exception goes in ALLOW_RULE_2 below WITH A REASON.
 *
 * Run:  pnpm check:no-default-organization
 *       pnpm check:no-default-organization:self-test   (proves each rule FAILS on a plant)
 * Exit 1 on any violation; exit 2 on unexpected errors.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(__dirname, "..");

/** The ONE module allowed to read the columns and call the RPCs. */
const THE_READER = "lib/organizations/accountOrganizationChoices.ts";

/** This guard itself names the retired words (its own pattern lists). */
const SELF = "scripts/check-no-default-organization.ts";
const SCAN_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|sql|sh)$/;
const SKIP_PATH =
  /^(migrations|supabase\/migrations|node_modules|\.next|docs)\/|(^|\/)(__tests__|node_modules)\/|\.(test|spec)\.|\.generated\.|(^|\/)database\.types\.ts$|^types\/database\.types\.ts$/;

/** Rule 1 — what only the reader may name (code, comments stripped). */
const READER_ONLY = [
  /\blast_active_organization_id\b/,
  /\bstartup_organization_id\b/,
  /\bset_last_active_organization\b/,
  /\bset_startup_organization\b/,
];

/** Rule 2 — the retired words (anywhere in the file, comments included). */
const RETIRED_WORDS = [
  /\bdefault[ _-]organi[sz]ation\b/i,
  /\bdefaultOrganizationId\b/,
  /\bdefault_organization_id\b/,
  /\bselectDefaultOrganizationId\b/,
  /\b_default_organization_is_a_membership\b/,
];

/** This guard's own name (and its package script) is not a mention of the retired word. */
const GUARD_NAME = /check[-:]no-default-organization/g;

/** Historic suites that ASSERT the dropped objects are gone, so they must name them. */
const ALLOW_RULE_2: Record<string, string> = {
  "scripts/campaign-tests/dorg4_acting_organization_green.sql": "asserts the dropped function is absent",
  "scripts/campaign-tests/dorg4_acting_organization_red.sql": "asserts the dropped function is absent",
  "scripts/campaign-tests/w1_org_c7_is_personal_deprecation.sql": "asserts the deprecation row for the old column",
  "scripts/campaign-tests/signupdoor_green.sql": "asserts the old creation declaration is gone",
  "scripts/retired-words-baseline.json": "the retired-words ratchet lists the migrations that name them",
  "scripts/lexicon-baseline.json": "the lexicon ratchet records the retired phrase",
  "scripts/checks/row-classes.json": "census of guard rows",
  "scripts/ground-standing-trigger-census.json": "census of trigger bodies",
  "scripts/campaign-tests/datahome2_the_data_home_honors_its_organization.sql": "asserts a retired knob key is gone",
};

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1")
    .replace(/^\s*--[^\n]*/gm, "")
    .replace(/^\s*#[^\n]*/gm, "");
}

export interface Finding {
  rule: 1 | 2;
  file: string;
  line: number;
  text: string;
}

export function scanFile(file: string, text: string): Finding[] {
  if (file === SELF || !SCAN_EXT.test(file) || SKIP_PATH.test(file)) return [];
  const findings: Finding[] = [];
  const lines = text.split("\n");
  if (file !== THE_READER) {
    const code = stripComments(text).split("\n");
    code.forEach((line, i) => {
      if (READER_ONLY.some((re) => re.test(line))) {
        findings.push({ rule: 1, file, line: i + 1, text: lines[i]!.trim().slice(0, 140) });
      }
    });
  }
  if (!(file in ALLOW_RULE_2)) {
    lines.forEach((raw, i) => {
      const line = raw.replace(GUARD_NAME, "");
      if (RETIRED_WORDS.some((re) => re.test(line))) {
        findings.push({ rule: 2, file, line: i + 1, text: raw.trim().slice(0, 140) });
      }
    });
  }
  return findings;
}

function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter(Boolean);
}

function selfTest(): number {
  const cases: Array<{ name: string; file: string; text: string; expectRule: 1 | 2 | null }> = [
    { name: "a second reader of the columns", file: "features/x/Reader.ts", text: 'select("last_active_organization_id")', expectRule: 1 },
    { name: "a second caller of an RPC", file: "lib/y.ts", text: 'supabase.rpc("set_startup_organization", {})', expectRule: 1 },
    { name: "the retired phrase in a comment", file: "features/z.ts", text: "// the default organization wins", expectRule: 2 },
    { name: "the retired prop", file: "features/z.tsx", text: "const defaultOrganizationId = 1;", expectRule: 2 },
    { name: "the dropped SQL column", file: "scripts/night/x.sh", text: "select default_organization_id from t", expectRule: 2 },
    { name: "the reader itself is clean", file: THE_READER, text: 'select("last_active_organization_id")', expectRule: null },
    { name: "a comment naming the column is not a reader", file: "features/w.ts", text: "// startup_organization_id is the setting", expectRule: null },
    { name: "the guard's own name is not a mention", file: "features/v.ts", text: "// see scripts/check-no-default-organization.ts", expectRule: null },
    { name: "a migration is exempt", file: "migrations/a.sql", text: "alter table t drop column default_organization_id", expectRule: null },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = scanFile(c.file, c.text);
    const ok = c.expectRule === null ? got.length === 0 : got.some((f) => f.rule === c.expectRule);
    if (!ok) {
      failed++;
      console.error(`SELF-TEST FAILED: ${c.name} (expected ${c.expectRule === null ? "clean" : `rule ${c.expectRule}`}, got ${JSON.stringify(got)})`);
    }
  }
  console.log(failed === 0 ? `check-no-default-organization self-test: ${cases.length} cases ok (each rule fails on its plant)` : `${failed} self-test case(s) failed`);
  return failed === 0 ? 0 : 1;
}

function main(): number {
  if (process.argv.includes("--self-test")) return selfTest();
  const findings: Finding[] = [];
  for (const file of trackedFiles()) {
    if (!SCAN_EXT.test(file) || SKIP_PATH.test(file)) continue;
    let text: string;
    try {
      text = readFileSync(resolve(ROOT, file), "utf8");
    } catch {
      continue;
    }
    findings.push(...scanFile(file, text));
  }
  if (findings.length === 0) {
    console.log("check-no-default-organization: ok — one reader of the account columns, no retired words");
    return 0;
  }
  for (const f of findings) {
    console.error(`rule ${f.rule}  ${f.file}:${f.line}  ${f.text}`);
  }
  console.error(`\ncheck-no-default-organization: ${findings.length} finding(s). Rule 1: only ${THE_READER} reads the columns / calls the RPCs. Rule 2: the retired words appear nowhere.`);
  return 1;
}

try {
  void exitAfterDrain(main());
} catch (error) {
  console.error(error);
  void exitAfterDrain(2);
}
