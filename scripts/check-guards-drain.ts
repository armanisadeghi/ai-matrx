#!/usr/bin/env npx tsx
/**
 * check:guards-drain — a guard may never truncate its own output. (DD-232)
 *
 * THE CLASS
 * ---------
 * `process.exit(code)` tears the process down with whatever is still sitting in
 * the stdout pipe buffer, and stdout to a PIPE is asynchronous in Node. A pipe is
 * how the release-gates script, CI, a log collector and every `| tee`, `| grep`
 * and `| tail` read a guard. So a guard that exits that way can print its findings
 * and have most of them never arrive — while still exiting with the right code, so
 * nothing looks wrong. Three measurements on this repository:
 *
 *   B-110  `check:anon-write-surface | grep FAIL` → ONE line; to a file → THREE.
 *   B-120  `check:staff-door | sed` → 10 residue rows; to a file → all of them.
 *   B-122  a 4,000-finding guard shape → 4,000 lines to a file, 810 through a pipe
 *          whose reader was busy for one second. Exit code still 1.
 *
 * It is silent until a guard's findings list grows past the 64 KB pipe buffer or
 * the reader stalls — and then it eats exactly the output that mattered. Three
 * separate lanes rediscovered it and wrote three separate local remedies. This
 * guard makes the remedy singular and the class un-regrowable.
 *
 * THE RULE, enforced here
 * -----------------------
 *   1. No `scripts/check-*.ts` calls `process.exit(` directly. It exits through
 *      `exitAfterDrain` from `scripts/lib/exit-after-drain.ts`.
 *   2. A file that calls `exitAfterDrain` imports it from that ONE module — never
 *      a local copy, and never a re-grown local drain helper.
 *
 * `pnpm check:guards-drain --self-test` proves this guard can fail: it plants
 * each violation in throwaway copies OUTSIDE the repository and requires the
 * scanner to find exactly them, then requires zero on the real `scripts/`.
 */

import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { exitAfterDrain } from "./lib/exit-after-drain";

const C = {
  r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m", b: "\x1b[1m", d: "\x1b[2m", x: "\x1b[0m",
};

const HELPER_MODULE = "./lib/exit-after-drain";
const BANNED = "process.exit(";

export type Finding = { file: string; line: number; rule: string; text: string };

/**
 * Strip block comments, line comments and string/template literals so that a
 * `process.exit(` written INSIDE a comment or a quoted pattern (this file quotes
 * it several times) is never mistaken for a call.
 */
export function codeOnly(source: string): string[] {
  const out: string[] = [];
  let inBlock = false;
  for (const raw of source.split("\n")) {
    let line = raw;
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end === -1) { out.push(""); continue; }
      line = line.slice(end + 2);
      inBlock = false;
    }
    // block comments opened on this line
    for (;;) {
      const start = line.indexOf("/*");
      if (start === -1) break;
      const end = line.indexOf("*/", start + 2);
      if (end === -1) { line = line.slice(0, start); inBlock = true; break; }
      line = line.slice(0, start) + " " + line.slice(end + 2);
    }
    // string and template literals, then line comments
    line = line.replace(/"(?:\\.|[^"\\])*"/g, '""')
               .replace(/'(?:\\.|[^'\\])*'/g, "''")
               .replace(/`(?:\\.|[^`\\])*`/g, "``")
               .replace(/\/\/.*$/, "");
    out.push(line);
  }
  return out;
}

export function scan(dir: string): Finding[] {
  const findings: Finding[] = [];
  const files = readdirSync(dir).filter((f) => /^check-.*\.ts$/.test(f)).sort();
  for (const file of files) {
    const source = readFileSync(join(dir, file), "utf8");
    const lines = codeOnly(source);
    let usesHelper = false;
    lines.forEach((line, i) => {
      if (line.includes("exitAfterDrain")) usesHelper = true;
      if (line.includes(BANNED)) {
        findings.push({
          file, line: i + 1, rule: "bare-process-exit",
          text: source.split("\n")[i].trim(),
        });
      }
      if (/(function|const)\s+\w*(exitAfterFlush|drainAndExit|flushThenExit)\b/.test(line)) {
        findings.push({
          file, line: i + 1, rule: "local-drain-copy",
          text: source.split("\n")[i].trim(),
        });
      }
    });
    const imports = lines.some(
      (l) => l.includes("exitAfterDrain") && l.includes("import") ,
    ) || source.includes(`from "${HELPER_MODULE}"`);
    if (usesHelper && !imports) {
      findings.push({
        file, line: 0, rule: "helper-not-imported",
        text: `calls exitAfterDrain but never imports it from "${HELPER_MODULE}"`,
      });
    }
  }
  return findings;
}

const REMEDY: Record<string, string> = {
  "bare-process-exit":
    `replace it with exitAfterDrain(<same code>) and import { exitAfterDrain } from "${HELPER_MODULE}". ` +
    `process.exit() abandons whatever is still in the stdout pipe buffer, so this guard can hide its own findings from a pipe.`,
  "local-drain-copy":
    `delete the local drain helper and exit through exitAfterDrain from "${HELPER_MODULE}". ` +
    `Three lanes wrote three different local copies before DD-232; there is exactly one now.`,
  "helper-not-imported":
    `add: import { exitAfterDrain } from "${HELPER_MODULE}";`,
};

export function report(findings: Finding[], scanned: number): number {
  if (findings.length === 0) {
    console.log(
      `${C.g}[ OK ]${C.x} Every guard drains before it exits. ` +
        `${C.d}${scanned} scripts/check-*.ts, 0 bare process.exit(, 0 local drain copies, one helper (${HELPER_MODULE}). (DD-232)${C.x}`,
    );
    return 0;
  }
  console.log(
    `${C.r}[FAIL]${C.x} ${C.b}${findings.length}${C.x} guard(s) can truncate their own output. (DD-232)\n`,
  );
  for (const f of findings) {
    const where = f.line > 0 ? `scripts/${f.file}:${f.line}` : `scripts/${f.file}`;
    console.log(`  ${C.r}✗${C.x} ${C.b}${where}${C.x}  ${C.y}${f.rule}${C.x}`);
    console.log(`      ${f.text}`);
    console.log(`      ${C.d}${REMEDY[f.rule]}${C.x}`);
  }
  console.log(
    `\n  ${C.d}Why this is fatal: stdout to a pipe is asynchronous in Node, and a pipe is how the\n` +
      `  release gates, CI and every | tee / | grep read a guard. A guard that prints 4,000 findings\n` +
      `  and delivers 810 of them — measured, B-122 — is the silent failure it exists to prevent.${C.x}`,
  );
  return 1;
}

// ---------------------------------------------------------------------------
// THE SELF-TEST — a guard nobody has seen fail is not a guard.
// Every RED is planted in a throwaway directory in the OS temp dir. The real
// working tree is never weakened: a peer sweeper commits whatever is on disk.
// ---------------------------------------------------------------------------
function selfTest(scriptsDir: string): number {
  const box = mkdtempSync(join(tmpdir(), "check-guards-drain-selftest-"));
  let reds = 0;
  try {
    mkdirSync(join(box, "lib"), { recursive: true });
    const planted: Array<[string, string, string]> = [
      [
        "check-planted-bare-exit.ts",
        `import { exitAfterDrain } from "${HELPER_MODULE}";\nfunction main(): number { console.log("x"); return 1; }\nprocess.exit(main());\n`,
        "bare-process-exit",
      ],
      [
        "check-planted-local-copy.ts",
        `import { exitAfterDrain } from "${HELPER_MODULE}";\nasync function exitAfterFlush(code: number) { exitAfterDrain(code); }\nexitAfterFlush(0);\n`,
        "local-drain-copy",
      ],
      [
        "check-planted-no-import.ts",
        `function main(): number { return 0; }\nexitAfterDrain(main());\n`,
        "helper-not-imported",
      ],
      [
        "check-planted-clean.ts",
        `import { exitAfterDrain } from "${HELPER_MODULE}";\n` +
          `// a comment mentioning process.exit( must NOT count\n` +
          `const pattern = "process.exit(";\nvoid pattern;\nexitAfterDrain(0);\n`,
        "",
      ],
    ];
    for (const [name, body] of planted) writeFileSync(join(box, name), body);

    const found = scan(box);
    for (const [name, , rule] of planted) {
      const hit = found.filter((f) => f.file === name);
      if (rule === "") {
        if (hit.length !== 0) {
          console.error(`${C.r}FAIL${C.x} the self-test flagged a CLEAN file (${name}): ${hit.map((h) => h.rule).join(", ")}. A false positive is a defect.`);
          return 1;
        }
        console.log(`${C.g}GREEN${C.x} ${name}: a quoted/commented "process.exit(" is correctly NOT a finding.`);
        continue;
      }
      if (!hit.some((f) => f.rule === rule)) {
        console.error(`${C.r}FAIL${C.x} the self-test planted ${rule} in ${name} and this guard did not see it. THE GUARD IS BLIND.`);
        return 1;
      }
      reds++;
      console.log(`${C.r}RED${C.x} proven: ${name} → ${rule}.`);
    }

    const real = scan(scriptsDir);
    if (real.length !== 0) {
      console.error(`${C.r}FAIL${C.x} the real scripts/ directory has ${real.length} finding(s); the self-test cannot claim GREEN.`);
      report(real, readdirSync(scriptsDir).filter((f) => /^check-.*\.ts$/.test(f)).length);
      return 1;
    }
    console.log(
      `${C.g}GREEN${C.x} teardown verified: ${reds} RED proof(s) in ${box}, real scripts/ clean, working tree never touched.`,
    );
    return 0;
  } finally {
    rmSync(box, { recursive: true, force: true });
  }
}

function main(): number {
  const scriptsDir = resolve(import.meta.dirname ?? __dirname);
  if (process.argv.includes("--self-test")) return selfTest(scriptsDir);
  const findings = scan(scriptsDir);
  const scanned = readdirSync(scriptsDir).filter((f) => /^check-.*\.ts$/.test(f)).length;
  return report(findings, scanned);
}

exitAfterDrain(main());
