#!/usr/bin/env npx tsx
/**
 * check:org-flag-readers — no NEW source reference to the deprecated organization flag.
 *
 * THE RULE (Arman, 2026-09-26; common-docs/policies/access-ladder.md "Organizations are
 * unlimited and equal"): there is no personal/business type of organization and no flag that
 * marks one. The column `iam.organizations.<flag>` (and `context.templates.<flag>`, same word)
 * was deprecated on 2026-09-25 and is being removed reader by reader. Its database twin is the
 * event trigger `no_new_org_flag_reader` (migrations/access_ladder_no_new_reader_of_the_org_flag.sql),
 * which refuses any new function, view, policy or index that names it. This is the source half.
 *
 * WHAT IT COUNTS: every whole-word occurrence of the flag's name in tracked (and untracked,
 * not ignored) source files — .ts/.tsx/.js/.mjs/.cjs/.sql/.py — comments included, because a
 * comment that names the flag is how the next reader gets written. Not counted: migration
 * files (frozen history; a new one that ADDS a reader is refused by the database guard at
 * apply), generated types (they mirror the live column until it is dropped), and this guard.
 *
 * THE BASELINE IS A RATCHET THAT ONLY SHRINKS. `scripts/org-flag-readers-baseline.json` holds
 * the per-file counts of 2026-09-26. A file not in it, or a count above it, is NEW and exits 1.
 * There is no opt-out comment. `--write` ratchets the baseline DOWN to what is still present
 * (never up).
 *
 *   pnpm check:org-flag-readers
 *   pnpm check:org-flag-readers --json
 *   pnpm check:org-flag-readers:write            # ratchet down
 *   pnpm check:org-flag-readers:self-test        # every rule fires
 *   pnpm check:org-flag-readers --plant <file>   # judge an out-of-tree file as if it were in
 *                                                # the tree (falsifiability proof without ever
 *                                                # editing a tracked file)
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_FILE = join(ROOT, "scripts", "org-flag-readers-baseline.json");

/** Assembled so this file never names the flag itself. */
const FLAG = ["is", "personal"].join("_");
const FLAG_RE = new RegExp(`(?<![A-Za-z0-9_])${FLAG}(?![A-Za-z0-9_])`, "g");

const EXTENSIONS = ["*.ts", "*.tsx", "*.js", "*.mjs", "*.cjs", "*.sql", "*.py"];

/** Paths that are not source a person writes a reader in. */
export function isExcluded(file: string): boolean {
  return (
    file === "scripts/check-org-flag-readers.ts" ||
    file.startsWith("migrations/") ||
    file.startsWith("supabase/migrations/") ||
    file === "types/database.types.ts" ||
    file.startsWith("types/python-generated/") ||
    file.includes("node_modules/") ||
    file.startsWith(".next/")
  );
}

/** Whole-word occurrences of the flag in one file's source. Pure. */
export function countFlagUses(source: string): number {
  return source.match(FLAG_RE)?.length ?? 0;
}

type Counts = Record<string, number>;

function scanTree(planted: string[]): Counts {
  const listed = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...EXTENSIONS],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  )
    .split("\n")
    .filter(Boolean);
  const counts: Counts = {};
  for (const file of listed) {
    if (isExcluded(file)) continue;
    const abs = join(ROOT, file);
    if (!existsSync(abs)) continue;
    const n = countFlagUses(readFileSync(abs, "utf8"));
    if (n > 0) counts[file] = n;
  }
  for (const abs of planted) {
    const n = countFlagUses(readFileSync(abs, "utf8"));
    if (n > 0) counts[`planted/${basename(abs)}`] = n;
  }
  return counts;
}

export interface Verdict {
  newSites: { file: string; count: number; baseline: number }[];
  cleared: string[];
}

/** New = a file above its baseline count (absent = 0). Pure. */
export function judge(current: Counts, baseline: Counts): Verdict {
  const newSites = Object.entries(current)
    .filter(([file, count]) => count > (baseline[file] ?? 0))
    .map(([file, count]) => ({ file, count, baseline: baseline[file] ?? 0 }))
    .sort((a, b) => a.file.localeCompare(b.file));
  const cleared = Object.keys(baseline)
    .filter((file) => (current[file] ?? 0) < baseline[file])
    .sort();
  return { newSites, cleared };
}

function readBaseline(): Counts | null {
  if (!existsSync(BASELINE_FILE)) return null;
  return JSON.parse(readFileSync(BASELINE_FILE, "utf8")) as Counts;
}

function writeBaseline(counts: Counts): void {
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
}

function selfTest(): number {
  const w = FLAG;
  const cases: { name: string; source: string; want: number }[] = [
    { name: "supabase select", source: `.select("id, ${w}")`, want: 1 },
    { name: "property access", source: `if (org.${w}) {}`, want: 1 },
    { name: "sql predicate", source: `where o.${w} is true and x.${w}`, want: 2 },
    { name: "comment still counts", source: `// reads ${w}`, want: 1 },
    { name: "python attribute", source: `org["${w}"]`, want: 1 },
    { name: "longer identifier is not the flag", source: `iam.${w}_dependents(); resource_${w}x`, want: 0 },
    { name: "prefixed identifier is not the flag", source: `resource_${w}`, want: 0 },
    { name: "unrelated", source: `const personal = true;`, want: 0 },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = countFlagUses(c.source);
    const ok = got === c.want;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}: got ${got}, want ${c.want}`);
  }
  const exclusions: [string, boolean][] = [
    ["migrations/foo.sql", true],
    ["types/database.types.ts", true],
    ["types/python-generated/api-types.ts", true],
    ["features/organizations/service.ts", false],
    ["scripts/campaign-tests/x.sql", false],
  ];
  for (const [file, want] of exclusions) {
    const ok = isExcluded(file) === want;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  exclusion ${file} -> ${want}`);
  }
  const ratchet = judge({ "a.ts": 2, "b.ts": 1, "c.ts": 1 }, { "a.ts": 2, "b.ts": 2 });
  const ratchetOk =
    ratchet.newSites.length === 1 && ratchet.newSites[0].file === "c.ts" && ratchet.cleared.join() === "b.ts";
  if (!ratchetOk) failed++;
  console.log(`${ratchetOk ? "PASS" : "FAIL"}  ratchet: a new file fails, a lower count is cleared`);
  const grew = judge({ "a.ts": 3 }, { "a.ts": 2 });
  const grewOk = grew.newSites.length === 1;
  if (!grewOk) failed++;
  console.log(`${grewOk ? "PASS" : "FAIL"}  ratchet: a count above baseline fails`);
  console.log(failed === 0 ? "self-test: all rules fire" : `self-test: ${failed} failed`);
  return failed === 0 ? 0 : 1;
}

function main(): number {
  const argv = process.argv.slice(2);
  const args = new Set(argv);
  if (args.has("--self-test")) return selfTest();

  const planted: string[] = [];
  argv.forEach((a, i) => {
    if (a === "--plant" && argv[i + 1]) planted.push(resolve(argv[i + 1]));
  });

  const current = scanTree(planted);
  const baseline = readBaseline();
  if (args.has("--write")) {
    if (planted.length > 0) {
      console.log("Refused: --write never records a planted file.");
      return 1;
    }
    if (!baseline) {
      writeBaseline(current);
      console.log(`Seeded ${BASELINE_FILE} with ${Object.keys(current).length} files.`);
      return 0;
    }
    const ratcheted: Counts = {};
    for (const [file, count] of Object.entries(baseline)) {
      const now = Math.min(count, current[file] ?? 0);
      if (now > 0) ratcheted[file] = now;
    }
    writeBaseline(ratcheted);
    console.log(`Ratcheted baseline down to ${Object.keys(ratcheted).length} files.`);
    return 0;
  }

  const verdict = judge(current, baseline ?? {});
  if (args.has("--json")) {
    console.log(JSON.stringify({ current, ...verdict }, null, 2));
    return verdict.newSites.length > 0 ? 1 : 0;
  }
  const remaining = Object.keys(current).length;
  if (verdict.newSites.length > 0) {
    console.log(
      `FAIL: new reference to the deprecated organization flag. Organizations are unlimited and equal (common-docs/policies/access-ladder.md); ` +
        `for "the organization created at signup" read the person's memberships, for a default organization read iam.default_organization_id(person). Remove the reference.`,
    );
    for (const site of verdict.newSites) {
      console.log(`  NEW  ${site.file}  (${site.count} reference${site.count === 1 ? "" : "s"}, baseline ${site.baseline})`);
    }
    return 1;
  }
  console.log(
    `OK: no new reference to the deprecated organization flag. ${remaining} baseline file${remaining === 1 ? "" : "s"} still to clear.` +
      (verdict.cleared.length > 0
        ? ` ${verdict.cleared.length} cleared since the baseline — run check:org-flag-readers:write to ratchet it down.`
        : ""),
  );
  return 0;
}

exitAfterDrain(main());
