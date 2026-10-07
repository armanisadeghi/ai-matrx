#!/usr/bin/env node
/**
 * THE CHAT PACKAGE BOUNDARY — every tie from `../aidream/apps/shared/chat/src` back into the app is counted,
 * and the count may only go down.
 *
 * Why: `@ai-matrx/chat` was moved out of the app as-is (common-docs
 * projects/chat-package-move, R1/R2). Its remaining reach back into matrx-frontend goes through
 * ONE alias, `@host/*`; the package becomes independent when that count is 0
 * (PACKAGE-INDEPENDENCE.md). Without a ratchet, 30 concurrent writers add new `@host/` imports
 * faster than the slices remove them.
 *
 * What counts as a host tie (TypeScript parser, comments ignored), in every file under
 * ../aidream/apps/shared/chat/src, tests included:
 *   - any module specifier starting `@host/` — static/type/re-export imports, `import()`,
 *     `require()`, and `jest.mock/doMock/requireActual/...` first arguments;
 *   - any specifier starting `@/` (the app alias — a host tie in disguise);
 *   - any relative specifier that resolves outside packages/chat.
 *
 * The allowlist (`scripts/chat-package-boundary.allowlist.json`) is a BUDGET per target
 * specifier: `{ "@host/lib/toast": 117, ... }`. The check fails when
 *   (a) a specifier appears that has no budget (a NEW host target), or
 *   (b) a specifier's count rises above its budget.
 * Renaming or moving a package file keeps the counts, so it passes. Removing ties leaves
 * budget unused; `--write` lowers every budget to the current count and deletes zeroed ones.
 * `--write` NEVER raises a budget or adds a specifier — there is no flag that does. A real new
 * host need goes through the host adapter or a registration (PACKAGE-INDEPENDENCE.md §2),
 * never through this file.
 *
 * Usage:
 *   node scripts/check-chat-package-boundary.mjs            # check (exit 1 on growth)
 *   node scripts/check-chat-package-boundary.mjs --write    # shrink budgets to current
 *   node scripts/check-chat-package-boundary.mjs --json     # machine-readable census
 *   node scripts/check-chat-package-boundary.mjs --self-test
 *   --root <dir> / --allowlist <file> point the check at a copy (proofs).
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(SCRIPT_DIR, "..");
const PKG_REL = "packages/chat";
const SRC_REL = "../aidream/apps/shared/chat/src";
const EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];
const JEST_FNS = /^(mock|doMock|unmock|requireActual|requireMock|createMockFromModule|setMock)$/;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function loadTs(root) {
  for (const base of [root, REPO]) {
    try {
      return createRequire(path.join(base, "package.json"))("typescript");
    } catch {
      /* try the next base */
    }
  }
  throw new Error("typescript is not installed — run `pnpm install` in matrx-frontend.");
}

function listFiles(dir) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (EXTS.some((x) => e.name.endsWith(x))) out.push(p);
    }
  })(dir);
  return out.sort();
}

/** Every host tie in the package under `root`: [{ file, line, spec, kind }]. */
export function censusHostTies(root) {
  const ts = loadTs(root);
  const src = path.join(root, SRC_REL);
  const pkg = path.join(root, PKG_REL);
  if (!fs.existsSync(src)) throw new Error(`no ${SRC_REL} under ${root}`);
  const ties = [];
  for (const abs of listFiles(src)) {
    const rel = path.relative(root, abs).split(path.sep).join("/");
    const text = fs.readFileSync(abs, "utf8");
    const kind = /\.(tsx|jsx)$/.test(abs) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
    const add = (node, spec, how) => {
      let key = null;
      if (spec.startsWith("@host/") || spec.startsWith("@/")) key = spec;
      else if (spec.startsWith(".")) {
        const target = path.resolve(path.dirname(abs), spec);
        if (path.relative(pkg, target).startsWith("..")) {
          key = `relative:${path.relative(root, target).split(path.sep).join("/")}`;
        }
      }
      if (!key) return;
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      ties.push({ file: rel, line, spec: key, kind: how });
    };
    (function visit(n) {
      if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
        add(n, n.moduleSpecifier.text, ts.isImportDeclaration(n) ? "import" : "export");
      } else if (ts.isCallExpression(n) && n.arguments.length && ts.isStringLiteralLike(n.arguments[0])) {
        const ex = n.expression;
        if (ex.kind === ts.SyntaxKind.ImportKeyword) add(n, n.arguments[0].text, "dynamic");
        else if (ts.isIdentifier(ex) && ex.text === "require") add(n, n.arguments[0].text, "require");
        else if (ts.isPropertyAccessExpression(ex) && JEST_FNS.test(ex.name.text)) add(n, n.arguments[0].text, "jest");
      } else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) {
        add(n, n.argument.literal.text, "import-type");
      } else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference) && ts.isStringLiteral(n.moduleReference.expression)) {
        add(n, n.moduleReference.expression.text, "import-equals");
      }
      ts.forEachChild(n, visit);
    })(sf);
  }
  return ties;
}

export function countBySpec(ties) {
  const counts = {};
  for (const t of ties) counts[t.spec] = (counts[t.spec] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

/** Compare a census with a budget. Returns { violations, unused, total, budgetTotal }. */
export function judge(ties, budget) {
  const counts = countBySpec(ties);
  const violations = [];
  for (const [spec, n] of Object.entries(counts)) {
    const allowed = budget[spec] ?? 0;
    if (n > allowed) {
      violations.push({
        spec,
        count: n,
        allowed,
        isNew: !(spec in budget),
        sites: ties.filter((t) => t.spec === spec).map((t) => `${t.file}:${t.line}`),
      });
    }
  }
  const unused = Object.entries(budget)
    .filter(([spec, b]) => (counts[spec] ?? 0) < b)
    .map(([spec, b]) => ({ spec, budget: b, count: counts[spec] ?? 0 }));
  const total = ties.length;
  const budgetTotal = Object.values(budget).reduce((a, b) => a + b, 0);
  return { violations, unused, total, budgetTotal, counts };
}

/** Shrink-only: every budget becomes min(budget, count); zeroed specs are removed. */
export function shrink(budget, counts) {
  const next = {};
  for (const [spec, b] of Object.entries(budget)) {
    const n = Math.min(b, counts[spec] ?? 0);
    if (n > 0) next[spec] = n;
  }
  return next;
}

function readBudget(file) {
  if (!fs.existsSync(file)) throw new Error(`allowlist missing: ${file}`);
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return raw.budget ?? {};
}

function writeBudget(file, budget) {
  const total = Object.values(budget).reduce((a, b) => a + b, 0);
  const body = {
    $note:
      "SHRINK-ONLY budget of host ties per specifier in ../aidream/apps/shared/chat/src. Never raise a number or add a key by hand — route the need through the chat host adapter or a registration (common-docs/projects/chat-package-move/PACKAGE-INDEPENDENCE.md). Lower it with: node scripts/check-chat-package-boundary.mjs --write",
    total,
    budget,
  };
  fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
}

function run(root, allowlistFile, mode) {
  const ties = censusHostTies(root);
  const budget = readBudget(allowlistFile);
  const r = judge(ties, budget);
  if (mode === "json") {
    process.stdout.write(`${JSON.stringify({ total: r.total, budgetTotal: r.budgetTotal, counts: r.counts }, null, 2)}\n`);
    return r.violations.length ? 1 : 0;
  }
  if (mode === "write") {
    if (r.violations.length) {
      console.error("✖ --write refused: the package has host ties above budget; fix them first (it never raises a budget).");
      printViolations(r.violations);
      return 1;
    }
    const next = shrink(budget, r.counts);
    writeBudget(allowlistFile, next);
    const was = r.budgetTotal;
    const now = Object.values(next).reduce((a, b) => a + b, 0);
    console.log(`✔ chat package boundary budget shrunk ${was} → ${now} (${Object.keys(next).length} specifiers).`);
    return 0;
  }
  if (r.violations.length) {
    console.error(`✖ chat package boundary: ${r.violations.length} host tie(s) above the shrink-only budget (total ${r.total}, budget ${r.budgetTotal}).`);
    printViolations(r.violations);
    console.error(
      "\nRemedy: do not import app code from packages/chat. Use the chat host adapter (identity, org, db, notify, diagnostics, prefs, server, navigation) or a host registration (tool renderers, context-item bodies, message widgets, surface manifests, windows) — see common-docs/projects/chat-package-move/PACKAGE-INDEPENDENCE.md. If the code belongs in the package, move it in.",
    );
    return 1;
  }
  const freed = r.budgetTotal - r.total;
  console.log(
    `✔ chat package boundary: ${r.total} host tie(s) across ${Object.keys(r.counts).length} specifier(s), within budget ${r.budgetTotal}.` +
      (freed > 0 ? ` ${freed} unused — run with --write to lock the gain in.` : ""),
  );
  return 0;
}

function printViolations(vs) {
  for (const v of vs) {
    console.error(`  ${v.isNew ? "NEW " : "MORE"} ${v.spec}: ${v.count} > ${v.allowed}`);
    for (const s of v.sites.slice(0, 8)) console.error(`       ${s}`);
    if (v.sites.length > 8) console.error(`       … ${v.sites.length - 8} more`);
  }
}

function selfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "chat-boundary-"));
  const src = path.join(tmp, SRC_REL);
  fs.mkdirSync(path.join(src, "a"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "package.json"), "{}");
  const allow = path.join(tmp, "allow.json");
  const file = path.join(src, "a", "x.ts");
  const results = [];
  const expect = (name, code, want) => results.push({ name, ok: code === want, code, want });
  const quiet = (fn) => {
    const e = console.error, l = console.log;
    console.error = () => {};
    console.log = () => {};
    try { return fn(); } finally { console.error = e; console.log = l; }
  };
  try {
    fs.writeFileSync(file, 'import { toast } from "@host/lib/toast";\nimport x from "./y";\n');
    fs.writeFileSync(path.join(src, "a", "y.ts"), "export default 1;\n");
    writeBudget(allow, { "@host/lib/toast": 1 });
    expect("at budget passes", quiet(() => run(tmp, allow, "check")), 0);
    fs.appendFileSync(file, 'import { supabase } from "@host/utils/supabase/client";\n');
    expect("a new @host target fails", quiet(() => run(tmp, allow, "check")), 1);
    fs.writeFileSync(file, 'import { toast } from "@host/lib/toast";\nexport const t = () => import("@host/lib/toast");\n');
    expect("a count above budget fails (dynamic import counted)", quiet(() => run(tmp, allow, "check")), 1);
    fs.writeFileSync(file, '// import "@host/lib/x" in a comment is ignored\nimport { toast } from "@host/lib/toast";\n');
    expect("comments are ignored", quiet(() => run(tmp, allow, "check")), 0);
    fs.writeFileSync(file, 'import { toast } from "@host/lib/toast";\njest.mock("@host/lib/redux/hooks");\n');
    expect("jest.mock of a new host target fails", quiet(() => run(tmp, allow, "check")), 1);
    fs.writeFileSync(file, 'import { toast } from "@host/lib/toast";\nimport u from "@/lib/utils";\n');
    expect("the @/ alias inside the package fails", quiet(() => run(tmp, allow, "check")), 1);
    fs.writeFileSync(file, 'import { toast } from "@host/lib/toast";\nimport f from "../../../../features/x";\n');
    expect("a relative path escaping the package fails", quiet(() => run(tmp, allow, "check")), 1);
    fs.mkdirSync(path.join(src, "b"), { recursive: true });
    fs.renameSync(file, path.join(src, "b", "moved.ts"));
    fs.writeFileSync(path.join(src, "b", "moved.ts"), 'import { toast } from "@host/lib/toast";\n');
    expect("a renamed file keeps its budget", quiet(() => run(tmp, allow, "check")), 0);
    fs.writeFileSync(path.join(src, "b", "moved.ts"), "export {};\n");
    expect("--write shrinks", quiet(() => run(tmp, allow, "write")), 0);
    expect("--write removed the zeroed budget", Object.keys(readBudget(allow)).length, 0);
    fs.writeFileSync(path.join(src, "b", "moved.ts"), 'import { toast } from "@host/lib/toast";\n');
    expect("after shrink, the old tie is NEW again and fails", quiet(() => run(tmp, allow, "check")), 1);
    expect("--write refuses to raise", quiet(() => run(tmp, allow, "write")), 1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  let bad = 0;
  for (const r of results) {
    console.log(`${r.ok ? "✔" : "✖"} ${r.name}${r.ok ? "" : ` (got ${r.code}, want ${r.want})`}`);
    if (!r.ok) bad++;
  }
  console.log(bad ? `✖ self-test: ${bad} case(s) failed` : `✔ self-test: ${results.length} cases`);
  return bad ? 1 : 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--self-test")) process.exit(selfTest());
  const root = path.resolve(arg("--root") ?? REPO);
  const allowlist = path.resolve(arg("--allowlist") ?? path.join(root, "scripts/chat-package-boundary.allowlist.json"));
  const mode = process.argv.includes("--write") ? "write" : process.argv.includes("--json") ? "json" : "check";
  if (process.argv.includes("--init")) {
    // One-time seed from the current tree. Refuses when an allowlist already exists, so it can
    // never be used to raise a budget later.
    if (fs.existsSync(allowlist)) {
      console.error(`✖ --init refused: ${path.relative(root, allowlist)} exists (budgets only shrink; use --write).`);
      process.exit(1);
    }
    writeBudget(allowlist, countBySpec(censusHostTies(root)));
    console.log(`✔ seeded ${path.relative(root, allowlist)}`);
    process.exit(0);
  }
  process.exit(run(root, allowlist, mode));
}
