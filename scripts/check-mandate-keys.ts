#!/usr/bin/env npx tsx
/**
 * check:mandate-keys — no hand-typed mandate keys.
 *
 * 🚨 THE RULE (`@ai-matrx/agents` 0.10.0 CHANGELOG, "Consumer action";
 * features/mandates/FEATURE.md): a TypeScript client never DECLARES a mandate
 * — aidream's `declare_mandate` is the only declaration path — and after 0.10.0
 * it never NAMES one by hand either. `@ai-matrx/agents/mandates` publishes the
 * key set, emitted by THE ONE GENERATOR (`aidream/scripts/mandates_generate.py`
 * stage (h)) from the same in-process `declared_mandates()` the boot sync writes
 * the database from. A hand-typed literal is a mirror of that set: a typo, a
 * rename or a retirement on the server turns into a 404 nobody sees, and the
 * release report cannot resolve this repo's references against the key set it
 * actually shipped. Imported from the vocabulary, the same mistake fails
 * TYPE-CHECK. Sibling guards: check-hardcoded-agents.ts (raw agent UUIDs),
 * check-hardcoded-prompts.ts (prompts in code).
 *
 * WHAT THIS FLAGS: a string literal that looks like a mandate key
 * (`<family>.<name>`) sitting in a MANDATE-KEY POSITION — either
 *   (a) the initializer of an identifier / property / JSX attribute whose name
 *       contains "mandate" (`mandateKey`, `FC_MANDATES`, `p_mandate_key`, …), or
 *   (b) the mandate-key argument of a mandate entry point (`resolveMandate`,
 *       `useMandate`, `useMandateSet`, `launchMandate`, `adminMandateHref`, …).
 * Position, not spelling, is the test: `education.spoken_practice` is BOTH a
 * mandate key and an entitlement meter id (features/entitlements/registry.ts),
 * and only one of those is this guard's business.
 *
 * WHAT IT DELIBERATELY DOES NOT FLAG:
 *   1. `MANDATE_KEYS.x` — that IS the fix, and it is not a string literal.
 *   2. tests, fixtures and mock data. A test invents keys on purpose
 *      (`zzz.scratch_job`, `should.not.be.sent`); binding them to the vocabulary
 *      would make the fixture a second authority. Per the 0.10.0 CHANGELOG,
 *      fixtures are left as-is.
 *   3. generated files (`types/python-generated/**`, `*.generated.ts`) — those
 *      mirror a server contract and have their own generator.
 *   4. an entry in the reason-required allowlist (ALLOWLIST_FILE). This is where
 *      a key that is LIVE in `mandate.definition` but absent from the generated
 *      union lands: a `db_only` row no aidream code declares, an `origin='user'`
 *      mandate somebody created in the console, or a deliberately-unassigned key
 *      whose surface renders an honest refusal until it is created. No generated
 *      union can contain those, so the allowlist NAMES them with the reason —
 *      it never hides them.
 *
 * HOW TO FIX A REAL ONE: import the member —
 *   import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
 *   MANDATE_KEYS.seo__keyword_classifier   // "seo.keyword_classifier"
 * (THE IDENTIFIER RULE: `.` → `__`.) If the key is NOT in the vocabulary, that
 * is the finding, not an inconvenience: check `mandate.definition` for a row. No
 * row means the reference is dead — delete the code path. A row that no aidream
 * code declares means the DECLARATION is the gap; close it in aidream so the
 * generator emits the key, and allowlist here with that reason meanwhile.
 *
 * THERE IS NO BASELINE. The tree was brought to zero when the guard was written
 * (2026-09-10, 200 literals across 76 files), so a violation is always NEW.
 *
 *   pnpm check:mandate-keys
 *   pnpm check:mandate-keys --json
 *   pnpm check:mandate-keys --root <dir>   # scan another checkout (RED/GREEN proof)
 */
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import process from "node:process";
import ts from "typescript";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";

// `process.cwd()`, not `import.meta.url`: the jest self-test imports this
// module, and jest transpiles it to CommonJS where `import.meta` is a syntax
// error. Same posture as scripts/check-generated-type-contracts.ts. Every
// entry point runs it from the repo root (pnpm, run-release-gates.sh, CI).
const DEFAULT_ROOT = process.cwd();
const ALLOWLIST_FILE = join(DEFAULT_ROOT, "scripts", "mandate-keys-allowlist.json");

/** `.` → `__` (THE IDENTIFIER RULE), so a finding can print its own fix. */
const IDENTIFIER_OF = new Map<string, string>(
  (Object.entries(MANDATE_KEYS) as [string, string][]).map(([id, key]) => [key, id]),
);

/** An identifier/property/attribute name that HOLDS a mandate key. */
const HOLDER_NAME_RE = /mandate/i;
/** Entry point → zero-based index of the argument that is a key (or array of keys). */
const POSITIONAL_ENTRY_POINTS: Readonly<Record<string, number>> = {
  resolveMandate: 0,
  resolveMandateServer: 0,
  useMandate: 0,
  useMandateGoal: 0,
  useMandateChain: 0,
  splitMandateKey: 0,
  fetchMandatePins: 0,
  fetchMandateNotesFor: 0,
  adminMandateHref: 0,
  mandateHref: 0,
  launchMandate: 0,
  runMandate: 0,
};
/** Shape of a mandate key: `<family>.<name>` — the canonical grammar. */
const KEY_SHAPE_RE = /^[a-z][a-z0-9_]*\.[a-z0-9_]+(?:\.[a-z0-9_]+)*$/;
/** Tests, fixtures and generated mirrors are out of scope (see the header). */
const SKIP_FILE_RE =
  /(?:^|\/)__tests__\/|(?:^|\/)__mocks__\/|\.test\.tsx?$|\.spec\.tsx?$|mock-data|fixtures?\//;
const SKIP_GENERATED_RE = /^types\/python-generated\/|\.generated\.tsx?$|\.d\.ts$/;

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  white: "\x1b[97m",
};

export interface Site {
  file: string;
  line: number;
  /** The holder name or entry point the literal sits in. */
  via: string;
  key: string;
  /** Is this key a member of the published vocabulary? */
  declared: boolean;
}

interface AllowEntry {
  file: string;
  key: string;
  reason: string;
}

// ── The scan (pure — the jest self-test drives this directly) ───────────────

/**
 * Every mandate-key string literal in a mandate-key position in one file.
 * Pure: no filesystem, no allowlist. `rel` is only used for reporting.
 */
export function scanSource(rel: string, src: string): Site[] {
  if (!HOLDER_NAME_RE.test(src)) return [];
  const sf = ts.createSourceFile(
    rel,
    src,
    ts.ScriptTarget.Latest,
    true,
    rel.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const sites: Site[] = [];

  // Keyed by the literal's own START OFFSET, so two distinct literals on one
  // line stay two sites and one literal reached twice (a nested holder inside
  // an entry-point call) collapses to one.
  const seen = new Set<number>();
  const record = (node: ts.StringLiteralLike, via: string) => {
    const key = node.text;
    if (!KEY_SHAPE_RE.test(key)) return;
    const start = node.getStart(sf);
    if (seen.has(start)) return;
    seen.add(start);
    sites.push({
      file: rel,
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      via,
      key,
      declared: IDENTIFIER_OF.has(key),
    });
  };

  /** Walk the value shapes a key can hide in: literal, array, record, ternary, cast. */
  const collect = (node: ts.Node, via: string): void => {
    if (ts.isStringLiteralLike(node)) return record(node, via);
    if (ts.isArrayLiteralExpression(node)) {
      node.elements.forEach((e) => collect(e, via));
      return;
    }
    if (
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isParenthesizedExpression(node)
    ) {
      return collect(node.expression, via);
    }
    if (ts.isConditionalExpression(node)) {
      collect(node.whenTrue, via);
      collect(node.whenFalse, via);
      return;
    }
    if (ts.isObjectLiteralExpression(node)) {
      // A record whose VALUES are keys (`const FC_MANDATES = { grade: "…" }`).
      node.properties.forEach((p) => {
        if (ts.isPropertyAssignment(p)) collect(p.initializer, via);
      });
    }
  };

  const visit = (n: ts.Node): void => {
    if (
      ts.isPropertyAssignment(n) &&
      (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)) &&
      HOLDER_NAME_RE.test(n.name.text)
    ) {
      collect(n.initializer, `prop ${n.name.text}`);
    } else if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      HOLDER_NAME_RE.test(n.name.text) &&
      n.initializer
    ) {
      collect(n.initializer, `const ${n.name.text}`);
    } else if (
      ts.isJsxAttribute(n) &&
      ts.isIdentifier(n.name) &&
      HOLDER_NAME_RE.test(n.name.text) &&
      n.initializer
    ) {
      const init = ts.isJsxExpression(n.initializer) ? n.initializer.expression : n.initializer;
      if (init) collect(init, `jsx ${n.name.text}`);
    } else if (ts.isCallExpression(n)) {
      const callee = ts.isIdentifier(n.expression)
        ? n.expression.text
        : ts.isPropertyAccessExpression(n.expression)
          ? n.expression.name.text
          : null;
      if (callee && callee in POSITIONAL_ENTRY_POINTS) {
        const arg = n.arguments[POSITIONAL_ENTRY_POINTS[callee]];
        if (arg) collect(arg, `call ${callee}()`);
      }
      if (callee === "useMandateSet" && n.arguments[0]) {
        const arg = n.arguments[0];
        if (ts.isObjectLiteralExpression(arg)) {
          arg.properties.forEach((p) => {
            if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && /keys/i.test(p.name.text)) {
              collect(p.initializer, "call useMandateSet()");
            }
          });
        } else {
          collect(arg, "call useMandateSet()");
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);

  return sites;
}

/** Every tracked .ts/.tsx file in `root` that is in scope for this guard. */
export function inScopeFiles(root: string): string[] {
  return execFileSync("git", ["-C", root, "ls-files", "*.ts", "*.tsx"], {
    maxBuffer: 1 << 28,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter((f) => f && !SKIP_FILE_RE.test(f) && !SKIP_GENERATED_RE.test(f));
}

export function scanRepo(root: string): Site[] {
  const sites: Site[] = [];
  for (const rel of inScopeFiles(root)) {
    let src: string;
    try {
      src = readFileSync(join(root, rel), "utf8");
    } catch {
      continue;
    }
    sites.push(...scanSource(rel, src));
  }
  return sites.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

// ── Allowlist ───────────────────────────────────────────────────────────────

function loadAllowlist(): AllowEntry[] {
  if (!existsSync(ALLOWLIST_FILE)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(ALLOWLIST_FILE, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is AllowEntry =>
        !!e &&
        typeof e === "object" &&
        typeof (e as AllowEntry).file === "string" &&
        typeof (e as AllowEntry).key === "string" &&
        typeof (e as AllowEntry).reason === "string" &&
        (e as AllowEntry).reason.trim().length > 0,
    );
  } catch {
    return [];
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function fixFor(site: Site): string {
  const id = IDENTIFIER_OF.get(site.key);
  return id
    ? `MANDATE_KEYS.${id}`
    : "not in the vocabulary — see the header: check mandate.definition for a row";
}

function main(): void {
  const argv = process.argv.slice(2);
  const asJson = argv.includes("--json");
  const rootArg = argv.indexOf("--root");
  const root = rootArg >= 0 && argv[rootArg + 1] ? resolve(argv[rootArg + 1]) : DEFAULT_ROOT;

  const scanned = inScopeFiles(root).length;
  const sites = scanRepo(root);
  const allow = loadAllowlist();
  const allowed = new Set(allow.map((e) => `${e.file}::${e.key}`));
  const violations = sites.filter((s) => !allowed.has(`${s.file}::${s.key}`));
  const allowlisted = sites.filter((s) => allowed.has(`${s.file}::${s.key}`));
  const matched = new Set(allowlisted.map((s) => `${s.file}::${s.key}`));
  const staleAllow = allow.filter((e) => !matched.has(`${e.file}::${e.key}`));

  if (asJson) {
    console.log(JSON.stringify({ scanned, violations, allowlisted, staleAllow }, null, 2));
    process.exit(violations.length > 0 ? 1 : 0);
  }

  console.log(
    `\n${C.bold}${C.white}HAND-TYPED MANDATE KEYS${C.reset} ${C.dim}(check:mandate-keys)${C.reset}`,
  );
  console.log(
    `${C.dim}The vocabulary is @ai-matrx/agents/mandates — ${IDENTIFIER_OF.size} declared keys. Scanned ${scanned} files.${C.reset}\n`,
  );

  if (violations.length === 0) {
    console.log(
      `${C.green}✓ No hand-typed mandate keys.${C.reset} ${C.dim}(${allowlisted.length} allowlisted with a reason)${C.reset}`,
    );
  } else {
    console.log(
      `${C.red}${C.bold}✗ ${violations.length} hand-typed mandate key literal(s)${C.reset}\n`,
    );
    for (const s of violations) {
      const mark = s.declared ? "" : ` ${C.yellow}[NOT IN THE VOCABULARY]${C.reset}`;
      console.log(`  ${C.cyan}${s.file}:${s.line}${C.reset}  ${C.dim}${s.via}${C.reset}`);
      console.log(`    "${s.key}"${mark}  →  ${C.green}${fixFor(s)}${C.reset}`);
    }
    console.log(
      `\n  ${C.yellow}Fix:${C.reset} import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";`,
    );
    console.log(`  ${C.dim}THE IDENTIFIER RULE: every "." in a key becomes "__".${C.reset}`);
    console.log(
      `  ${C.dim}A key with no vocabulary member and no mandate.definition row is a DEAD reference — delete the code path.${C.reset}`,
    );
    console.log(
      `  ${C.dim}A key that is live but undeclared (db_only / origin='user') goes in scripts/mandate-keys-allowlist.json WITH a reason.${C.reset}`,
    );
  }

  if (staleAllow.length > 0) {
    console.log(
      `\n${C.yellow}${staleAllow.length} stale allowlist entr${staleAllow.length === 1 ? "y" : "ies"}${C.reset} ${C.dim}(nothing matches). Remove by hand.${C.reset}`,
    );
    for (const e of staleAllow) console.log(`  ${C.dim}${e.file} :: ${e.key}${C.reset}`);
  }

  console.log("");
  process.exit(violations.length > 0 ? 1 : 0);
}

if (require.main === module) main();
