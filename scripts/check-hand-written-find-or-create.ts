#!/usr/bin/env tsx
/**
 * check-hand-written-find-or-create — NEVER LIST EVERY TABLE TO FIND ONE.
 *
 * WHAT HAPPENED. Three places (kits installer `findLedger`, content-ir `kind-record-home`, and the
 * decision board's own storage) each wrote "list every table, search the list for my slug, make it
 * if missing" by hand. Two tabs saving first made two tables. The store has the doors for this:
 * `client.tableFind({ slug, keptFor })` finds one table in one request, `ensureTable(client, spec)`
 * finds-or-makes it in one transaction, and `defineTypedTable` + `useTypedTable` carry a page's own table.
 *
 * THE RULE. In non-test source, a `tableList(` call is not followed (within 25 lines) by a
 * `.find(` whose callback names `.slug` or `.name`. Finding by id (`x.id === id`) is fine.
 *
 *   pnpm check:hand-written-find-or-create              fail (exit 1) on any finding
 *   pnpm check:hand-written-find-or-create --root <dir> scan another checkout
 *   pnpm check:hand-written-find-or-create:self-test    plants REDs and GREENs in a temp dir
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { exitAfterDrain } from "./lib/exit-after-drain";

const SOURCE_EXT = /\.(tsx?|mjs|cjs|jsx?)$/;
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", "coverage", ".turbo", ".wt"]);
const WINDOW_LINES = 25;
const CALLBACK_CHARS = 160;

interface Finding { file: string; line: number; text: string }

function isTest(rel: string): boolean {
  if (rel === "scripts/check-hand-written-find-or-create.ts" || rel.startsWith("scripts/campaign-tests/")) return true; // the guard itself; one-off campaign scripts
  return /(^|\/)__tests__\//.test(rel) || /\.(test|spec|live\.test)\.[cm]?[jt]sx?$/.test(rel) || /(^|\/)(e2e|tests?)\//.test(rel);
}

function listFiles(root: string): string[] {
  try {
    const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, maxBuffer: 1 << 28 });
    return out.toString("utf8").split("\0").filter((f) => f && SOURCE_EXT.test(f));
  } catch {
    const acc: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(join(root, dir))) {
        if (SKIP_DIRS.has(name)) continue;
        const rel = dir ? `${dir}/${name}` : name;
        if (statSync(join(root, rel)).isDirectory()) walk(rel);
        else if (SOURCE_EXT.test(name)) acc.push(rel);
      }
    };
    walk("");
    return acc;
  }
}

export function scanText(rel: string, text: string): Finding[] {
  const lines = text.split("\n");
  const found: Finding[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/\btableList\(/.test(lines[i]) || /^\s*(\/\/|\*)/.test(lines[i])) continue;
    const windowText = lines.slice(i, i + WINDOW_LINES).join("\n");
    const re = /\.find\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(windowText))) {
      const callback = windowText.slice(m.index, m.index + CALLBACK_CHARS).split("\n").slice(0, 3).join(" ");
      if (/\.(slug|name)\b/.test(callback)) {
        const line = i + 1 + windowText.slice(0, m.index).split("\n").length - 1;
        found.push({ file: rel, line, text: lines[line - 1].trim() });
        break;
      }
    }
  }
  return found;
}

function scan(root: string): Finding[] {
  const findings: Finding[] = [];
  for (const rel of listFiles(root)) {
    if (isTest(rel)) continue;
    let text: string;
    try { text = readFileSync(join(root, rel), "utf8"); } catch { continue; }
    if (!text.includes("tableList(")) continue;
    findings.push(...scanText(rel, text));
  }
  return findings;
}

function report(findings: Finding[], root: string): number {
  if (findings.length === 0) {
    console.log(`✓ check:hand-written-find-or-create — no source lists every table to find one by slug or name (${root}).`);
    return 0;
  }
  console.log(`✗ check:hand-written-find-or-create — ${findings.length} hand-written find-or-create:\n`);
  for (const f of findings) console.log(`  ${f.file}:${f.line}  ${f.text}`);
  console.log(`\nUse client.tableFind({ slug, keptFor }) to find, ensureTable(client, spec) to find-or-make, or defineTypedTable + useTypedTable (@ai-matrx/records).`);
  return 1;
}

function selfTest(): number {
  const dir = mkdtempSync(join(tmpdir(), "check-find-or-create-"));
  try {
    const put = (rel: string, body: string) => {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), body);
    };
    put("features/a/BySlug.ts", `const t = await client.tableList();\nconst x = t.data.find((r) => r.slug === "a");\n`); // RED
    put("features/a/ByName.ts", `const t = await client.tableList();\nconst x = t.data.find(\n  (r) => r.slug === "a" || r.name === "a",\n);\n`); // RED
    put("features/a/ById.ts", `const t = await client.tableList();\nconst x = t.data.find((r) => r.id === id);\n`); // GREEN
    put("features/a/Plain.ts", `const t = await client.tableList();\nreturn t.data.filter((r) => !r.is_kernel);\n`); // GREEN
    put("features/a/x.test.ts", `const t = await client.tableList();\nt.data.find((r) => r.name === "a");\n`); // GREEN: test
    const got = scan(dir).map((f) => f.file).sort();
    const want = ["features/a/ByName.ts", "features/a/BySlug.ts"];
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log(ok ? `✓ self-test: 2 planted REDs caught, 3 GREENs passed.` : `✗ self-test: wanted ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
    return ok ? 0 : 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main(): number {
  if (process.argv.includes("--self-test")) return selfTest();
  const rootIdx = process.argv.indexOf("--root");
  const root = rootIdx > -1 ? resolve(process.argv[rootIdx + 1]) : process.cwd();
  return report(scan(root), root);
}

exitAfterDrain(main());
