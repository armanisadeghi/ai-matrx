#!/usr/bin/env npx tsx
/**
 * check:reserved-icons — a RESERVED icon used anywhere but its one home.
 *
 * THE RULE (Arman, 2026-09-26; CLAUDE.md § UI / UX standards): lucide
 * `BrainCircuit` is the Intelligence icon and means nothing else. Code that
 * shows Intelligence or Mandates imports `INTELLIGENCE_ICON` (or spells the
 * name through `INTELLIGENCE_ICON_NAME`) from `components/icons/domain-icons.ts`
 * — the only file allowed to import `BrainCircuit` itself. An icon that also
 * decorates generic "AI" buttons teaches a person nothing.
 *
 * WHAT THIS FLAGS, per file (comments excluded):
 *   - a lucide-react import specifier `BrainCircuit` / `BrainCircuitIcon` /
 *     `LucideBrainCircuit` (aliases included), or a deep import of
 *     `lucide-react/.../brain-circuit`;
 *   - a member access `.BrainCircuit` (`icons.BrainCircuit`, `Lucide.BrainCircuit`);
 *   - a string literal "BrainCircuit" / "brain-circuit" — an icon-name lookup
 *     (shell nav `iconName`, dynamic icon registries).
 *
 * THE BASELINE IS A RATCHET. `scripts/reserved-icons-baseline.json` holds the
 * per-file counts that existed when the reservation was made (the census the
 * replacement pass works through). A file not in the baseline, or a count above
 * its baseline, is NEW and exits 1. `--write` ratchets the baseline DOWN to what
 * is still present (never up); with no baseline file it seeds one.
 *
 *   pnpm check:reserved-icons
 *   pnpm check:reserved-icons --json
 *   pnpm check:reserved-icons --write       # ratchet down / seed
 *   pnpm check:reserved-icons --self-test   # every rule fires on a planted line
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_FILE = join(ROOT, "scripts", "reserved-icons-baseline.json");

/** The one file allowed to name the reserved icon. */
const HOME = "components/icons/domain-icons.ts";
/** Files that talk ABOUT the icon (this guard, its baseline). */
const SKIP = new Set([HOME, "scripts/check-reserved-icons.ts"]);

const IMPORT_RE = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']lucide-react(?:\/[^"']*)?["']/g;
const SPECIFIER_RE = /\b(?:BrainCircuit|BrainCircuitIcon|LucideBrainCircuit)\b/g;
const DEEP_IMPORT_RE = /["']lucide-react\/[^"']*brain-circuit[^"']*["']/g;
const MEMBER_RE = /\.(?:BrainCircuit|BrainCircuitIcon|LucideBrainCircuit)\b/g;
const STRING_RE = /["'`](?:BrainCircuit|brain-circuit)["'`]/g;

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

function countMatches(source: string, re: RegExp): number {
  return source.match(re)?.length ?? 0;
}

/** How many reserved-icon uses one file's source holds. Pure. */
export function countReservedUses(source: string): number {
  const code = stripComments(source);
  let count = 0;
  for (const match of code.matchAll(IMPORT_RE)) {
    count += countMatches(match[1] ?? "", SPECIFIER_RE);
  }
  count += countMatches(code, DEEP_IMPORT_RE);
  count += countMatches(code, MEMBER_RE);
  count += countMatches(code, STRING_RE);
  return count;
}

type Counts = Record<string, number>;

function scanTree(): Counts {
  const listed = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", "*.ts", "*.tsx"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  )
    .split("\n")
    .filter(Boolean);
  const counts: Counts = {};
  for (const file of listed) {
    if (SKIP.has(file) || file.includes("node_modules/") || file.startsWith(".next/")) continue;
    const abs = join(ROOT, file);
    if (!existsSync(abs)) continue;
    const n = countReservedUses(readFileSync(abs, "utf8"));
    if (n > 0) counts[file] = n;
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
  const cases: { name: string; source: string; want: number }[] = [
    { name: "named import", source: `import { BrainCircuit } from "lucide-react";`, want: 1 },
    { name: "aliased import", source: `import { X, BrainCircuit as Brain } from 'lucide-react';`, want: 1 },
    { name: "Icon-suffixed import", source: `import { BrainCircuitIcon } from "lucide-react";`, want: 1 },
    { name: "deep import", source: `import B from "lucide-react/dist/esm/icons/brain-circuit";`, want: 1 },
    { name: "member access", source: `const I = Lucide.BrainCircuit;`, want: 1 },
    { name: "icon-name string", source: `{ iconName: "BrainCircuit" }`, want: 1 },
    { name: "kebab icon-name string", source: `<Icon name='brain-circuit' />`, want: 1 },
    { name: "the constant", source: `import { INTELLIGENCE_ICON } from "@/components/icons/domain-icons";`, want: 0 },
    { name: "line comment", source: `// BrainCircuit is reserved: "BrainCircuit"`, want: 0 },
    { name: "block comment", source: `/* import { BrainCircuit } from "lucide-react" */`, want: 0 },
    { name: "other package", source: `import { BrainCircuit } from "./local";`, want: 0 },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = countReservedUses(c.source);
    const ok = got === c.want;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}: got ${got}, want ${c.want}`);
  }
  const ratchet = judge({ "a.tsx": 2, "b.tsx": 1, "c.tsx": 1 }, { "a.tsx": 2, "b.tsx": 2 });
  const ratchetOk =
    ratchet.newSites.length === 1 &&
    ratchet.newSites[0].file === "c.tsx" &&
    ratchet.cleared.join() === "b.tsx";
  if (!ratchetOk) failed++;
  console.log(`${ratchetOk ? "PASS" : "FAIL"}  ratchet: a new file fails, a lower count is cleared`);
  const grew = judge({ "a.tsx": 3 }, { "a.tsx": 2 });
  const grewOk = grew.newSites.length === 1;
  if (!grewOk) failed++;
  console.log(`${grewOk ? "PASS" : "FAIL"}  ratchet: a count above baseline fails`);
  console.log(failed === 0 ? "self-test: all rules fire" : `self-test: ${failed} failed`);
  return failed === 0 ? 0 : 1;
}

function main(): number {
  const args = new Set(process.argv.slice(2));
  if (args.has("--self-test")) return selfTest();

  const current = scanTree();
  const baseline = readBaseline();
  if (args.has("--write")) {
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
    console.log(`Ratcheted baseline to ${Object.keys(ratcheted).length} files.`);
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
      `FAIL: BrainCircuit is reserved for Intelligence. Import INTELLIGENCE_ICON from "@/components/icons/domain-icons" for Intelligence/Mandates; pick another icon for anything else.`,
    );
    for (const site of verdict.newSites) {
      console.log(`  NEW  ${site.file}  (${site.count} use${site.count === 1 ? "" : "s"}, baseline ${site.baseline})`);
    }
    return 1;
  }
  console.log(
    `OK: no new BrainCircuit use. ${remaining} baseline file${remaining === 1 ? "" : "s"} still to clear.` +
      (verdict.cleared.length > 0
        ? ` ${verdict.cleared.length} cleared since the baseline — run --write to ratchet it down.`
        : ""),
  );
  return 0;
}

exitAfterDrain(main());
