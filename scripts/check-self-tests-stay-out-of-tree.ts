#!/usr/bin/env npx tsx
/**
 * check:self-tests-stay-out-of-tree — A SELF-TEST NEVER PLANTS A FIXTURE IN THE LIVE SOURCE TREE.
 *
 * Until 2026-09-26 seven check self-tests wrote their RED fixture straight into lib/, features/,
 * app/, migrations/ or scripts/ and deleted it afterwards (`check-org-refusal-honesty.ts` wrote
 * `lib/organizations/__self_test_planted__.ts`; `db:apply --self-test` six `migrations/zz_*.sql`).
 * `scripts/checks/run.mjs` runs checks six at a time, so while a fixture sat there every OTHER
 * scanner saw it: reported it as a real finding, or crashed with ENOENT when it vanished mid-scan
 * (`check:unwired`, 2026-09-25) — and a concurrent `git add` sweep of this shared checkout could
 * commit it. A self-test plants in memory, or in `mkdtempSync(join(tmpdir(), …))`, and points the
 * check at that root.
 *
 * STATIC (the default, ~seconds): every script under scripts/ plus every file a package.json
 * self-test command names is parsed (TypeScript AST). Inside self-test code — a file named
 * *self-test* / *selftest*, a function named selfTest / self_test / …, or an `if` whose condition
 * reads the `--self-test` flag — every filesystem write (writeFileSync, mkdirSync, copyFileSync,
 * cpSync, renameSync, appendFileSync, symlinkSync, createWriteStream and their async twins) has its
 * target path evaluated symbolically: `ROOT` / `__dirname` / `import.meta` / `process.cwd()` are
 * the checkout, `tmpdir()` / `mkdtemp*()` are private scratch, `join` / `resolve` / `dirname` /
 * template literals / object-literal lookups / `??` fallbacks are followed through the file's own
 * declarations. A target that lands in the checkout and is not gitignored is a finding.
 *
 * DYNAMIC (`--dynamic`, slow, the census): runs every node/tsx/jest self-test command in
 * package.json under `scripts/lib/self-test-tree-trap.cjs` (a `--require` preload that records
 * every write the process and its Node children make) and reports each one that landed in the
 * tracked tree. This is how the seven were found; run it when the static rule is in doubt.
 *
 *   pnpm check:self-tests-stay-out-of-tree              # static; exit 1 on a finding
 *   pnpm check:self-tests-stay-out-of-tree:self-test    # RED on the seven recorded pre-fix files, GREEN on today's
 *   pnpm check:self-tests-stay-out-of-tree --dynamic    # the census (minutes; touches whatever the self-tests touch)
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, posix } from "node:path";
import ts from "typescript";
import { exitAfterDrain } from "./lib/exit-after-drain";
import { REPO_ROOT, repoFiles } from "./lib/repo-files";

const ROOT = REPO_ROOT;

/** Directories under the checkout that are private scratch by design (and gitignored). */
const SCRATCH_TOP = new Set(["tmp", "node_modules", ".next", ".git", ".wt", "coverage", ".turbo"]);

/** callee name → index of the argument that is the WRITE target. */
const WRITERS: Record<string, number> = {
  writeFileSync: 0, writeFile: 0, appendFileSync: 0, appendFile: 0, mkdirSync: 0, mkdir: 0,
  copyFileSync: 1, copyFile: 1, cpSync: 1, cp: 1, renameSync: 1, rename: 1,
  symlinkSync: 1, symlink: 1, createWriteStream: 0,
};

const SELF_TEST_NAME = /self[-_]?test/i;

// ── Symbolic path evaluation ────────────────────────────────────────────────

type Value =
  | { kind: "root"; segs: Array<string | null> } // a path in the checkout; null = unknown segment
  | { kind: "tmp" }
  | { kind: "lit"; value: string }
  | { kind: "unknown" };

const UNKNOWN: Value = { kind: "unknown" };

function appendSegs(segs: Array<string | null>, raw: string): Array<string | null> {
  const out = [...segs];
  for (const part of raw.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length && out[out.length - 1] !== null) out.pop();
      else out.push(null);
    } else out.push(part);
  }
  return out;
}

/**
 * Names resolve through the TypeScript binder (scope-aware: `path` declared in one function is
 * not the `path` of another). An imported name spelled like a root (`ROOT`, `REPO_ROOT`) is the
 * checkout; any other import, a parameter or a destructured binding is unknown.
 */
class FileModel {
  constructor(
    readonly rel: string,
    readonly sf: ts.SourceFile,
    readonly checker: ts.TypeChecker,
  ) {}

  /** The script's own directory as checkout segments. */
  private here(): Value {
    return { kind: "root", segs: appendSegs([], posix.dirname(this.rel)) };
  }

  evaluate(expr: ts.Expression, depth = 0): Value {
    if (depth > 12) return UNKNOWN;
    const e = (x: ts.Expression) => this.evaluate(x, depth + 1);
    if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isNonNullExpression(expr) || ts.isSatisfiesExpression(expr)) {
      return e(expr.expression);
    }
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return { kind: "lit", value: expr.text };
    if (ts.isIdentifier(expr)) {
      if (expr.text === "__dirname") return this.here();
      const symbol = this.checker.getSymbolAtLocation(expr);
      const decl = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
      if (!decl) return UNKNOWN;
      if (ts.isVariableDeclaration(decl)) return decl.initializer && ts.isIdentifier(decl.name) ? e(decl.initializer) : UNKNOWN;
      if ((ts.isImportSpecifier(decl) || ts.isImportClause(decl)) && /^(?:REPO_)?ROOT$/.test(expr.text)) {
        return { kind: "root", segs: [] };
      }
      return UNKNOWN;
    }
    if (ts.isPropertyAccessExpression(expr)) {
      const text = expr.getText();
      if (text === "import.meta.dirname") return this.here();
      if (text === "import.meta.url") return this.here();
      if (text === "import.meta.filename") return this.here();
      // An object-literal constant's member: any member that is a checkout path counts.
      return e(expr.expression);
    }
    if (ts.isElementAccessExpression(expr)) {
      const target = e(expr.expression);
      return target;
    }
    if (ts.isObjectLiteralExpression(expr) || ts.isArrayLiteralExpression(expr)) {
      const members = ts.isObjectLiteralExpression(expr)
        ? expr.properties.flatMap((p) => (ts.isPropertyAssignment(p) ? [p.initializer] : []))
        : expr.elements.filter((x): x is ts.Expression => !ts.isOmittedExpression(x));
      return pickStrongest(members.map(e));
    }
    if (ts.isBinaryExpression(expr)) {
      const op = expr.operatorToken.kind;
      if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) {
        return pickStrongest([e(expr.left), e(expr.right)]);
      }
      if (op === ts.SyntaxKind.PlusToken) {
        const l = e(expr.left);
        const r = e(expr.right);
        if (l.kind === "root") return { kind: "root", segs: r.kind === "lit" ? appendSegs(l.segs, r.value) : [...l.segs, null] };
        if (l.kind === "tmp") return l;
        return UNKNOWN;
      }
      return UNKNOWN;
    }
    if (ts.isConditionalExpression(expr)) return pickStrongest([e(expr.whenTrue), e(expr.whenFalse)]);
    if (ts.isTemplateExpression(expr)) {
      if (expr.head.text !== "") return UNKNOWN;
      const first = e(expr.templateSpans[0].expression);
      if (first.kind === "tmp") return first;
      if (first.kind !== "root") return UNKNOWN;
      let segs = first.segs;
      expr.templateSpans.forEach((span, i) => {
        if (i > 0) segs = [...segs, null];
        segs = appendSegs(segs, span.literal.text);
      });
      return { kind: "root", segs };
    }
    if (ts.isCallExpression(expr)) {
      const callee = expr.expression.getText();
      const name = callee.split(".").pop() ?? "";
      if (/^(tmpdir|mkdtempSync|mkdtemp)$/.test(name)) return { kind: "tmp" };
      if (callee === "process.cwd") return { kind: "root", segs: [] };
      if (name === "fileURLToPath" || name === "String" || name === "normalize") {
        return expr.arguments[0] ? e(expr.arguments[0]) : UNKNOWN;
      }
      if (name === "dirname") {
        const inner = expr.arguments[0] ? e(expr.arguments[0]) : UNKNOWN;
        if (inner.kind !== "root") return inner;
        // dirname(import.meta.url) — `here` already IS the directory.
        const argText = expr.arguments[0]?.getText() ?? "";
        if (/import\.meta\.(url|filename)/.test(argText)) return inner;
        return { kind: "root", segs: inner.segs.slice(0, -1) };
      }
      if (name === "join" || name === "resolve") {
        const args = expr.arguments.map(e);
        if (args.some((a) => a.kind === "tmp")) return { kind: "tmp" };
        const [first, ...rest] = args;
        if (!first || first.kind !== "root") return UNKNOWN;
        let segs = first.segs;
        for (const a of rest) {
          if (a.kind === "lit") segs = appendSegs(segs, a.value);
          else if (a.kind === "root") segs = a.segs; // resolve() restarts at an absolute arg
          else segs = [...segs, null];
        }
        return { kind: "root", segs };
      }
      return UNKNOWN;
    }
    return UNKNOWN;
  }
}

function pickStrongest(values: Value[]): Value {
  return values.find((v) => v.kind === "root") ?? values.find((v) => v.kind === "tmp") ?? values.find((v) => v.kind === "lit") ?? UNKNOWN;
}

// ── Self-test scope ─────────────────────────────────────────────────────────

function nameOf(node: ts.Node): string | null {
  if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name) return node.name.getText();
  if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && node.parent) {
    const p = node.parent;
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
    if (ts.isPropertyAssignment(p)) return p.name.getText();
  }
  return null;
}

/** `if (argv.includes("--self-test"))`, `if (check || selfTest)` — never `if (!selfTest)`. */
function isSelfTestCondition(cond: ts.Expression, sf: ts.SourceFile): boolean {
  if (ts.isParenthesizedExpression(cond)) return isSelfTestCondition(cond.expression, sf);
  if (ts.isPrefixUnaryExpression(cond) && cond.operator === ts.SyntaxKind.ExclamationToken) return false;
  if (ts.isBinaryExpression(cond)) {
    const op = cond.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken) {
      return isSelfTestCondition(cond.left, sf) || isSelfTestCondition(cond.right, sf);
    }
  }
  return SELF_TEST_NAME.test(cond.getText(sf));
}

export interface Finding {
  file: string;
  line: number;
  call: string;
  target: string;
}

/** One binder over every file: parse + bind only, no lib, no module resolution. */
export function scanSources(entries: Array<{ rel: string; source: string }>, ignored: (rel: string) => boolean): Finding[] {
  const files = new Map<string, ts.SourceFile>();
  for (const { rel, source } of entries) {
    const kind = /\.[cm]?jsx?$/.test(rel) ? ts.ScriptKind.JS : rel.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    // A virtual .ts name keeps the program from refusing .mjs/.cjs roots; the kind carries the dialect.
    files.set(`/v/${rel}.ts`, ts.createSourceFile(`/v/${rel}.ts`, source, ts.ScriptTarget.Latest, true, kind));
  }
  const options: ts.CompilerOptions = { noResolve: true, noLib: true, allowJs: true, types: [], target: ts.ScriptTarget.Latest };
  const host: ts.CompilerHost = {
    getSourceFile: (name) => files.get(name),
    getDefaultLibFileName: () => "/v/lib.d.ts",
    writeFile: () => undefined,
    getCurrentDirectory: () => "/v",
    getCanonicalFileName: (f) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (f) => files.has(f),
    readFile: () => undefined,
  };
  const program = ts.createProgram([...files.keys()], options, host);
  const checker = program.getTypeChecker();
  const findings: Finding[] = [];
  for (const { rel } of entries) {
    const sf = program.getSourceFile(`/v/${rel}.ts`);
    if (sf) findings.push(...scanFile(rel, sf, checker, ignored));
  }
  return findings;
}

export function scanSource(rel: string, source: string, ignored: (rel: string) => boolean): Finding[] {
  return scanSources([{ rel, source }], ignored);
}

function scanFile(rel: string, sf: ts.SourceFile, checker: ts.TypeChecker, ignored: (rel: string) => boolean): Finding[] {
  const model = new FileModel(rel, sf, checker);
  const wholeFile = SELF_TEST_NAME.test(basename(rel));
  const findings: Finding[] = [];

  const visit = (node: ts.Node, inSelfTest: boolean) => {
    let inside = inSelfTest;
    const n = nameOf(node);
    if (n && SELF_TEST_NAME.test(n)) inside = true;
    if (ts.isIfStatement(node) && isSelfTestCondition(node.expression, sf)) {
      visit(node.expression, inside);
      visit(node.thenStatement, true);
      if (node.elseStatement) visit(node.elseStatement, inside);
      return;
    }
    if (inside && ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf);
      const fn = callee.split(".").pop() ?? "";
      const argIndex = WRITERS[fn];
      const bareOrFs = callee === fn || /^(fs|fsp|fs\.promises|promises|node_fs|nodeFs)\.\w+$/.test(callee);
      if (argIndex !== undefined && bareOrFs && node.arguments[argIndex]) {
        const v = model.evaluate(node.arguments[argIndex]);
        if (v.kind === "root") {
          const top = v.segs[0];
          const shown = v.segs.map((s) => s ?? "<?>").join("/") || ".";
          const scratch = top != null && SCRATCH_TOP.has(top);
          const known = v.segs.every((s) => s !== null);
          if (!scratch && !(known && ignored(shown))) {
            findings.push({
              file: rel,
              line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
              call: fn,
              target: shown,
            });
          }
        }
      }
    }
    ts.forEachChild(node, (child) => visit(child, inside));
  };
  visit(sf, wholeFile);
  return findings;
}

// ── The files to read ──────────────────────────────────────────────────────

const SCRIPT_FILE = /\.(?:m|c)?[jt]sx?$/;

function packageSelfTestAtoms(): string[] {
  const scripts = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
  const atoms = new Set<string>();
  const seen = new Set<string>();
  const expand = (value: string) => {
    for (const atom of value.split(/\s*(?:&&|\|\||;)\s*/).map((s) => s.trim()).filter(Boolean)) {
      const m = /^pnpm(?: run)? ([\w:.-]+)(.*)$/.exec(atom);
      if (m && scripts[m[1]]) {
        if (!seen.has(m[1])) {
          seen.add(m[1]);
          expand(scripts[m[1]] + m[2]);
        }
      } else atoms.add(atom);
    }
  };
  for (const [name, value] of Object.entries(scripts)) {
    if (SELF_TEST_NAME.test(name) || SELF_TEST_NAME.test(value)) expand(value);
  }
  return [...atoms].filter((a) => SELF_TEST_NAME.test(a));
}

function filesToRead(): string[] {
  const files = new Set(repoFiles(ROOT, { under: ["scripts"], match: SCRIPT_FILE }));
  for (const atom of packageSelfTestAtoms()) {
    for (const token of atom.split(/\s+/)) if (SCRIPT_FILE.test(token) && !token.startsWith("-")) files.add(token);
  }
  // This guard carries the shapes it looks for in its own self-test strings.
  files.delete("scripts/check-self-tests-stay-out-of-tree.ts");
  return [...files].sort();
}

function gitIgnored(root: string): (rel: string) => boolean {
  const cache = new Map<string, boolean>();
  return (rel) => {
    const hit = cache.get(rel);
    if (hit !== undefined) return hit;
    const r = spawnSync("git", ["check-ignore", "-q", "--no-index", rel], { cwd: root });
    const ignored = r.status === 0;
    cache.set(rel, ignored);
    return ignored;
  };
}

function scanTree(): Finding[] {
  const ignored = gitIgnored(ROOT);
  const entries: Array<{ rel: string; source: string }> = [];
  for (const rel of filesToRead()) {
    try {
      entries.push({ rel, source: readFileSync(join(ROOT, rel), "utf8") });
    } catch {
      continue; // deleted between listing and read
    }
  }
  return scanSources(entries, ignored);
}

function report(findings: Finding[]): void {
  console.error(`\n🚨 ${findings.length} self-test write(s) land in the live source tree\n`);
  for (const f of findings) console.error(`  ✗ ${f.file}:${f.line}  ${f.call}(${f.target})`);
  console.error(
    "\nA fixture in the checkout is seen by every check scripts/checks/run.mjs runs in parallel —\n" +
      "a fake finding, or ENOENT when it vanishes mid-scan — and a concurrent sweep can commit it.\n" +
      "Plant it in memory (give the scan an `extra` / overlay input) or in\n" +
      "mkdtempSync(join(tmpdir(), \"<check>-selftest-\")) and pass that directory as the scan's root.\n",
  );
}

// ── Self-test ───────────────────────────────────────────────────────────────

/**
 * The seven files as they were BEFORE 2026-09-26, read from git history: each must go RED.
 * Today's versions of the same files must go GREEN. A guard that has never flagged the
 * shapes it was written for proves nothing.
 */
const RECORDED: Array<{ rel: string; before: string }> = [
  { rel: "scripts/check-org-refusal-honesty.ts", before: "16aebe6662^" },
  { rel: "scripts/check-org-three-states.ts", before: "16aebe6662^" },
  { rel: "scripts/check-no-default-organization.ts", before: "16aebe6662^" },
  { rel: "scripts/check-no-default-organization-sql.ts", before: "16aebe6662^" },
  { rel: "scripts/check-agent-list-reads.ts", before: "16aebe6662^" },
  { rel: "scripts/check-docs-twins.mjs", before: "16aebe6662^" },
  { rel: "scripts/apply-migration.ts", before: "261e1f45d1^" },
];

function selfTest(): number {
  let failed = 0;
  const say = (ok: boolean, msg: string) => {
    if (!ok) failed += 1;
    console.log(`[self-test] ${ok ? "ok  " : "FAIL"} ${msg}`);
  };
  const ignored = gitIgnored(ROOT);

  for (const { rel, before } of RECORDED) {
    const old = spawnSync("git", ["show", `${before}:${rel}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (old.status !== 0) {
      say(false, `${rel}: could not read the recorded pre-fix copy at ${before} — ${old.stderr.trim()}`);
      continue;
    }
    const red = scanSource(rel, old.stdout, ignored);
    say(red.length > 0, `RED   ${rel}@${before} (planted into the tree) → ${red.length} finding(s): ${red.slice(0, 2).map((f) => f.target).join(", ")}`);
    const green = scanSource(rel, readFileSync(join(ROOT, rel), "utf8"), ignored);
    say(green.length === 0, `GREEN ${rel} today → ${green.length} finding(s)${green.length ? ": " + green.map((f) => `${f.line} ${f.target}`).join(", ") : ""}`);
  }

  // Synthetic shapes: what must stay GREEN, and the forms the recorded files do not cover.
  const synth = (name: string, src: string, expectRed: boolean) => {
    const found = scanSource(`scripts/${name}`, src, ignored);
    say((found.length > 0) === expectRed, `${expectRed ? "RED  " : "GREEN"} synthetic ${name} → ${found.length} finding(s)`);
  };
  const head = `import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";\nimport { join, resolve } from "node:path";\nimport { tmpdir } from "node:os";\nconst ROOT = resolve(__dirname, "..");\n`;
  synth("tmp-plant.ts", `${head}function selfTest() { const box = mkdtempSync(join(tmpdir(), "x-")); writeFileSync(join(box, "lib/a.ts"), "x"); }\n`, false);
  synth("scratch-plant.ts", `${head}function selfTest() { mkdirSync(join(ROOT, "tmp", "x"), { recursive: true }); }\n`, false);
  synth("main-path-write.ts", `${head}function main() { writeFileSync(join(ROOT, "scripts", "baseline.json"), "{}"); }\n`, false);
  synth("negated-flag.ts", `${head}if (!process.argv.includes("--self-test")) writeFileSync(join(ROOT, "gen.ts"), "x");\n`, false);
  synth("flag-block.mjs", `${head}if (process.argv.includes("--self-test")) { writeFileSync(join(ROOT, "features", "p.ts"), "x"); }\n`, true);
  synth("template.ts", `${head}const selfTest = () => writeFileSync(\`\${ROOT}/app/p.tsx\`, "x");\n`, true);
  synth("env-fallback.ts", `${head}const DIR = process.env.X ?? join(ROOT, "migrations");\nfunction self_test() { writeFileSync(join(DIR, "zz.sql"), "x"); }\n`, true);
  synth("object-map.ts", `${head}const PLANTS = { 1: join(ROOT, "lib", "a.ts") };\nfunction selfTest() { writeFileSync(PLANTS[1], "x"); }\n`, true);
  synth("whole-file.self-test.ts", `${head}writeFileSync(join(ROOT, "lib", "a.ts"), "x");\n`, true);

  // The trap itself (the --dynamic census) must record a write into "the tree" and ignore
  // scratch. Its tree here is a private temp dir standing in for the checkout — so the proof
  // never writes into the real one.
  const box = mkdtempSync(join(tmpdir(), "self-tests-stay-out-selftest-"));
  const logBox = mkdtempSync(join(tmpdir(), "self-tests-stay-out-log-"));
  try {
    const log = join(logBox, "trap.jsonl");
    writeFileSync(log, "");
    const probe =
      `const fs=require("node:fs");const p=require("node:path");const b=${JSON.stringify(box)};` +
      `fs.mkdirSync(p.join(b,"lib"),{recursive:true});fs.writeFileSync(p.join(b,"lib","planted.ts"),"x");` +
      `fs.mkdirSync(p.join(b,"tmp"),{recursive:true});fs.writeFileSync(p.join(b,"tmp","scratch.txt"),"x");` +
      `fs.promises.appendFile(p.join(b,"lib","async.ts"),"x");`;
    spawnSync(process.execPath, ["-e", probe], {
      cwd: box,
      env: {
        ...process.env,
        NODE_OPTIONS: `--require ${join(ROOT, "scripts/lib/self-test-tree-trap.cjs")}`,
        SELF_TEST_TREE_TRAP_ROOT: box,
        SELF_TEST_TREE_TRAP_LOG: log,
      },
      encoding: "utf8",
    });
    const paths = readFileSync(log, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => (JSON.parse(l) as { path: string }).path);
    say(
      paths.includes("lib/planted.ts") && paths.includes("lib/async.ts") && !paths.some((x) => x.startsWith("tmp")),
      `trap: writes into the tree are recorded (sync + promises), scratch is not → [${paths.join(", ")}]`,
    );
  } finally {
    rmSync(box, { recursive: true, force: true });
    rmSync(logBox, { recursive: true, force: true });
  }

  if (failed) {
    console.error(`\n🚨 check:self-tests-stay-out-of-tree --self-test FAILED (${failed})`);
    return 1;
  }
  console.log("[self-test] PASS — the guard flags every recorded tree-planting self-test and passes their fixes.");
  return 0;
}

// ── Dynamic census ──────────────────────────────────────────────────────────

async function dynamic(): Promise<number> {
  const atoms = packageSelfTestAtoms().filter((a) => /^(node|tsx|jest|npx tsx)\b/.test(a));
  const box = mkdtempSync(join(tmpdir(), "self-tests-stay-out-census-"));
  const ignored = gitIgnored(ROOT);
  const offenders: Array<{ atom: string; paths: string[] }> = [];
  let next = 0;
  const one = (atom: string, i: number) =>
    new Promise<void>((done) => {
      const log = join(box, `${i}.jsonl`);
      writeFileSync(log, "");
      const child = spawn("sh", ["-c", atom], {
        cwd: ROOT,
        stdio: "ignore",
        env: {
          ...process.env,
          PATH: `${join(ROOT, "node_modules/.bin")}:${process.env.PATH ?? ""}`,
          NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require ${join(ROOT, "scripts/lib/self-test-tree-trap.cjs")}`,
          SELF_TEST_TREE_TRAP_ROOT: ROOT,
          SELF_TEST_TREE_TRAP_LOG: log,
        },
      });
      const timer = setTimeout(() => child.kill("SIGKILL"), 600_000);
      child.on("close", () => {
        clearTimeout(timer);
        const paths = [
          ...new Set(
            readFileSync(log, "utf8")
              .split("\n")
              .filter(Boolean)
              .map((l) => (JSON.parse(l) as { path: string }).path)
              .filter((p) => !ignored(p)),
          ),
        ];
        if (paths.length) offenders.push({ atom, paths });
        console.log(`${paths.length ? "✗" : "·"} ${atom}${paths.length ? `  → ${paths.slice(0, 4).join(", ")}` : ""}`);
        done();
      });
    });
  const worker = async () => {
    while (next < atoms.length) {
      const i = next++;
      await one(atoms[i], i);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  rmSync(box, { recursive: true, force: true });
  if (offenders.length) {
    console.error(`\n🚨 ${offenders.length} self-test command(s) wrote into the tracked tree:`);
    for (const o of offenders) console.error(`  ✗ ${o.atom}\n      ${o.paths.join("\n      ")}`);
    return 1;
  }
  console.log(`\nself-tests-stay-out-of-tree --dynamic: ${atoms.length} self-test command(s), none wrote into the tracked tree.`);
  return 0;
}

async function main(): Promise<number> {
  if (process.argv.includes("--self-test")) return selfTest();
  if (process.argv.includes("--dynamic")) return dynamic();
  const findings = scanTree();
  if (findings.length) {
    report(findings);
    return 1;
  }
  console.log(`check:self-tests-stay-out-of-tree OK — ${filesToRead().length} script(s) read, no self-test plants into the live source tree.`);
  return 0;
}

main().then(
  (code) => exitAfterDrain(code),
  (err: unknown) => {
    console.error(`check:self-tests-stay-out-of-tree crashed: ${err instanceof Error ? err.stack : String(err)}`);
    exitAfterDrain(2);
  },
);
