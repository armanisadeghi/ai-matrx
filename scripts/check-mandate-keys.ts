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
 * WHAT THIS FLAGS — TWO RULES, ONE GUARD:
 *
 * RULE 1 — A HAND-TYPED KEY LITERAL: a string literal that looks like a mandate
 * key (`<family>.<name>`) sitting in a MANDATE-KEY POSITION — either
 *   (a) the initializer of an identifier / property / JSX attribute whose name
 *       contains "mandate" (`mandateKey`, `FC_MANDATES`, `p_mandate_key`, …), or
 *   (b) the mandate-key argument of a mandate entry point (`resolveMandate`,
 *       `useMandate`, `useMandateSet`, `launchMandate`, `adminMandateHref`, …).
 * Position, not spelling, is the test: `education.spoken_practice` is BOTH a
 * mandate key and an entitlement meter id (features/entitlements/registry.ts),
 * and only one of those is this guard's business. The two TYPED DOORS
 * (`dbAuthoredMandateKey`, `storedMandateKey` in features/mandates/mandate-key.ts)
 * are walked THROUGH, not around: a literal inside one is still reported, so the
 * allowlist keeps naming it with a reason. A typed door that hid its argument
 * would be a laundering hole, not a fix.
 *
 * RULE 2 — A `string`-TYPED CARRIER (V-L6a, 2026-09-17). Rule 1 alone was proven
 * insufficient: the verdict found the whole carrier chain (`useMandate`,
 * `useAgentLauncher`'s `launchMandate`, the ambient ladder) declaring
 * `mandateKey: string`, so adopting the vocabulary bought NO compile-time
 * protection — a key threaded through a `string` parameter, a typo'd entry in a
 * `Record<string, string>` ladder, or a value assembled at run time all
 * type-checked cleanly and failed as a 404 nobody sees. So a carrier that
 * declares its key `string` is itself a finding: any parameter, property or
 * signature member named `mandateKey` / `mandateKeys` (camelCase — the key THIS
 * repo chose) whose type is `string`, `string | null`, `string[]`,
 * `readonly string[]` or the like must be `MandateKey`, `DynamicMandateKey` or
 * `AnyMandateKey` instead.
 *   - A snake_case `mandate_key` is NOT flagged: that spelling mirrors a
 *     database column, where the row — not the code — is the authority, and the
 *     typed boundary for it is `storedMandateKey()`.
 *   - A narrowing door (`isMandateKey`, `assertMandateKey`, `splitMandateKey`)
 *     is NOT flagged: taking an unknown `string` in order to ANSWER whether it
 *     is a key is the opposite of a carrier that assumes one.
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
 * HOW TO FIX A RULE-2 FINDING: type the key —
 *   import type { MandateKey } from "@ai-matrx/agents/mandates";
 *   // or AnyMandateKey when a DB-authored app.* / shortcut.* key is legitimate
 * and type the SOURCE of the key rather than widening the carrier back. A value
 * that genuinely arrives as an unknown string (a URL segment, a stored
 * preference) is narrowed at its own boundary with `isMandateKey` /
 * `assertMandateKey`, or typed with `storedMandateKey()` when the row is the
 * authority.
 *
 * HOW TO FIX A RULE-1 FINDING: import the member —
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
import { exitAfterDrain } from "./lib/exit-after-drain";

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
/**
 * THE TYPED DOORS (features/mandates/mandate-key.ts). A literal inside one is
 * still a literal: the scan walks THROUGH the call so the allowlist keeps
 * naming it with a reason, instead of the door becoming a way to launder a
 * hand-typed key past this guard.
 */
const TYPED_DOORS: ReadonlySet<string> = new Set([
  "dbAuthoredMandateKey",
  "storedMandateKey",
]);

/**
 * RULE 2 — THE ENFORCED CARRIERS. A key reaches resolution or execution ONLY
 * through one of these, so this is the set where a `string` parameter actually
 * costs the compile-time guard (V-L6a). Every other member named `mandateKey`
 * is reported as a CENSUS line, never as a failure — see `--census` and the
 * header — because an admin console row, a draft the user is still typing and a
 * `[mandateKey]` route segment are all legitimately unknown strings.
 */
const ENFORCED_CARRIERS: ReadonlySet<string> = new Set([
  "useMandate",
  "useMandateSet",
  "useMandateChain",
  "useMandateGoal",
  "resolveMandate",
  "resolveMandateServer",
  "launchMandate",
  "runMandate",
  "mandateStart",
  "mandateExecutePath",
  "AmbientAssistantMandateChain",
  "SurfaceMandateRef",
]);

/**
 * RULE 2 — a name that means "a key THIS repo chose", so its type must be
 * `MandateKey`. camelCase only: snake_case `mandate_key` mirrors a DB column
 * whose authority is the row (see the header).
 */
const CARRIER_MEMBER_RE = /^(?:.*[a-z0-9])?[Mm]andateKeys?$/;
/**
 * A door whose JOB is to take an unknown string and answer/parse it. Taking
 * `string` here is correct — it is the opposite of a carrier assuming a key.
 */
const NARROWING_OWNER_RE = /^(?:is|assert|parse|split|coerce|normalize)/;

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
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      TYPED_DOORS.has(node.expression.text) &&
      node.arguments[0]
    ) {
      // `dbAuthoredMandateKey("mandate.goal_writer")` — the literal is still
      // the literal; the allowlist, not the door, is what excuses it.
      return collect(node.arguments[0], via);
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

// ── RULE 2: a carrier that declares its key `string` ────────────────────────
//
// The type-level half of the guard. Rule 1 proves no key was hand-TYPED; this
// proves the compiler is actually holding the keys that were imported (V-L6a).

export interface CarrierSite {
  file: string;
  line: number;
  /** The parameter / property that should be `MandateKey`. */
  member: string;
  /** Where it sits — the function, method or interface that declares it. */
  owner: string;
  /** The offending type, as written. */
  declared: string;
  /**
   * Is this one of the resolution/execution carriers the guard FAILS on? The
   * rest are the census (see ENFORCED_CARRIERS).
   */
  enforced: boolean;
}

/**
 * Is this type annotation a `string` in mandate-key clothing? `string`,
 * `string | null`, `string[]`, `readonly string[]`, `Array<string>` and any
 * union that still admits a bare `string` all answer yes — `MandateKey | ""`
 * and `AnyMandateKey | null` answer no, because neither admits an arbitrary
 * string.
 */
function isStringTyped(t: ts.TypeNode | undefined): boolean {
  if (!t) return false;
  if (t.kind === ts.SyntaxKind.StringKeyword) return true;
  if (ts.isParenthesizedTypeNode(t)) return isStringTyped(t.type);
  if (ts.isUnionTypeNode(t)) return t.types.some((m) => isStringTyped(m));
  if (ts.isArrayTypeNode(t)) return isStringTyped(t.elementType);
  if (ts.isTypeOperatorNode(t)) return isStringTyped(t.type);
  if (ts.isTypeReferenceNode(t) && t.typeArguments?.length) {
    const name = ts.isIdentifier(t.typeName) ? t.typeName.text : t.typeName.right.text;
    // Array<string>, ReadonlyArray<string>, Readonly<string[]>, Record<string, string>
    if (/^(?:Array|ReadonlyArray|Readonly|Record)$/.test(name)) {
      const last = t.typeArguments[t.typeArguments.length - 1];
      return isStringTyped(last);
    }
  }
  return false;
}

/** The nearest named thing a parameter belongs to, for the report. */
function ownerNameOf(node: ts.Node): string {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (
      (ts.isFunctionDeclaration(n) ||
        ts.isMethodDeclaration(n) ||
        ts.isMethodSignature(n)) &&
      n.name &&
      ts.isIdentifier(n.name)
    ) {
      return n.name.text;
    }
    if (
      (ts.isVariableDeclaration(n) ||
        ts.isPropertySignature(n) ||
        ts.isPropertyAssignment(n) ||
        ts.isPropertyDeclaration(n)) &&
      ts.isIdentifier(n.name)
    ) {
      return n.name.text;
    }
    if (ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) return n.name.text;
  }
  return "(anonymous)";
}

/**
 * Every `string`-typed mandate-key carrier member in one file. Pure, like
 * `scanSource`, so the jest self-test drives exactly what the CLI walks.
 */
export function scanCarrierTypes(rel: string, src: string): CarrierSite[] {
  if (!/andateKeys?\b/.test(src)) return [];
  const sf = ts.createSourceFile(
    rel,
    src,
    ts.ScriptTarget.Latest,
    true,
    rel.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const sites: CarrierSite[] = [];

  const push = (
    node: ts.Node,
    member: string,
    owner: string,
    type: ts.TypeNode,
    enforcedName: string,
  ) => {
    sites.push({
      file: rel,
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      member,
      owner,
      declared: type.getText(sf),
      enforced: ENFORCED_CARRIERS.has(enforcedName),
    });
  };

  const visit = (n: ts.Node): void => {
    if (ts.isParameter(n) && ts.isIdentifier(n.name) && CARRIER_MEMBER_RE.test(n.name.text)) {
      const owner = ownerNameOf(n);
      // A narrowing/parsing door legitimately takes an unknown string.
      if (!NARROWING_OWNER_RE.test(owner) && isStringTyped(n.type)) {
        push(n, n.name.text, `${owner}()`, n.type!, owner);
      }
    } else if (
      (ts.isPropertySignature(n) || ts.isPropertyDeclaration(n)) &&
      ts.isIdentifier(n.name) &&
      CARRIER_MEMBER_RE.test(n.name.text) &&
      isStringTyped(n.type)
    ) {
      // An interface field that FEEDS a carrier is a carrier: the key is typed
      // where it is declared, or the typing stops there.
      const owner = ownerNameOf(n);
      push(n, n.name.text, owner, n.type!, owner);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);

  return sites;
}

export function scanRepoCarriers(root: string): CarrierSite[] {
  const sites: CarrierSite[] = [];
  for (const rel of inScopeFiles(root)) {
    let src: string;
    try {
      src = readFileSync(join(root, rel), "utf8");
    } catch {
      continue;
    }
    sites.push(...scanCarrierTypes(rel, src));
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
  const carrierSites = scanRepoCarriers(root);
  const carriers = carrierSites.filter((c) => c.enforced);
  const census = carrierSites.filter((c) => !c.enforced);
  const showCensus = argv.includes("--census");
  const allow = loadAllowlist();
  const allowed = new Set(allow.map((e) => `${e.file}::${e.key}`));
  const violations = sites.filter((s) => !allowed.has(`${s.file}::${s.key}`));
  const allowlisted = sites.filter((s) => allowed.has(`${s.file}::${s.key}`));
  const matched = new Set(allowlisted.map((s) => `${s.file}::${s.key}`));
  const staleAllow = allow.filter((e) => !matched.has(`${e.file}::${e.key}`));

  const failed = violations.length > 0 || carriers.length > 0;

  if (asJson) {
    console.log(
      JSON.stringify({ scanned, violations, allowlisted, staleAllow, carriers, census }, null, 2),
    );
    exitAfterDrain(failed ? 1 : 0);
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

  if (carriers.length === 0) {
    console.log(
      `${C.green}✓ Every mandate-key carrier is typed.${C.reset} ${C.dim}(${ENFORCED_CARRIERS.size} resolution/execution carriers, none typed string)${C.reset}`,
    );
  } else {
    console.log(
      `\n${C.red}${C.bold}✗ ${carriers.length} string-typed mandate-key carrier(s)${C.reset}`,
    );
    console.log(
      `${C.dim}A key the compiler does not hold is a 404 nobody sees (V-L6a, 2026-09-17).${C.reset}\n`,
    );
    for (const c of carriers) {
      console.log(`  ${C.cyan}${c.file}:${c.line}${C.reset}  ${C.dim}${c.owner}${C.reset}`);
      console.log(
        `    ${c.member}: ${c.declared}  →  ${C.green}${c.member}: MandateKey${C.reset} ${C.dim}(or AnyMandateKey / DynamicMandateKey)${C.reset}`,
      );
    }
    console.log(
      `\n  ${C.yellow}Fix:${C.reset} import type { MandateKey } from "@ai-matrx/agents/mandates";`,
    );
    console.log(
      `  ${C.dim}Type the SOURCE of the key, never widen the carrier back to string.${C.reset}`,
    );
    console.log(
      `  ${C.dim}A value that truly arrives as an unknown string is narrowed at its boundary with isMandateKey/assertMandateKey, or typed with storedMandateKey() when the row is the authority.${C.reset}`,
    );
  }

  if (census.length > 0) {
    console.log(
      `\n${C.yellow}${census.length} other member(s) named mandateKey are typed string${C.reset} ${C.dim}— the CENSUS, not a failure.${C.reset}`,
    );
    console.log(
      `${C.dim}These are admin-console rows, drafts a user is still typing and [mandateKey] route segments, where an unknown string is honest. Narrowing them is the next wave; run --census to list them.${C.reset}`,
    );
    if (showCensus) {
      for (const c of census) {
        console.log(
          `  ${C.dim}${c.file}:${c.line}  ${c.owner}  ${c.member}: ${c.declared}${C.reset}`,
        );
      }
    }
  }

  if (staleAllow.length > 0) {
    console.log(
      `\n${C.yellow}${staleAllow.length} stale allowlist entr${staleAllow.length === 1 ? "y" : "ies"}${C.reset} ${C.dim}(nothing matches). Remove by hand.${C.reset}`,
    );
    for (const e of staleAllow) console.log(`  ${C.dim}${e.file} :: ${e.key}${C.reset}`);
  }

  console.log("");
  exitAfterDrain(failed ? 1 : 0);
}

if (require.main === module) main();
