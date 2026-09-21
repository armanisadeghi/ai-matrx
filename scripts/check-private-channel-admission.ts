/**
 * check-private-channel-admission.ts — EVERY `private: true` CHANNEL'S TOPIC PREFIX IS
 * REGISTERED IN `platform.realtime_topic_prefix`, OR THIS FAILS BY NAME.
 *
 * WHY THIS EXISTS. Supabase authorizes a PRIVATE channel by running RLS on
 * `realtime.messages` once, at join time, with `realtime.topic()` set to the topic the socket
 * asked for. This database had RLS ENABLED on that table and ZERO POLICIES from the day it was
 * created until 2026-09-21, so every private channel on the whole platform was refused —
 * forever, silently, behind a screen that looked perfectly healthy. Lane REALTIME wrote the one
 * policy; it dispatches by topic PREFIX to the owning schema's own access rule, through the
 * registry `platform.realtime_topic_prefix`. A prefix nobody has registered is still refused.
 *
 * So `private: true` in a source file is a PROMISE that a row exists in that registry, and
 * nothing anywhere checked it. The scheduler's `scheduler:user:<user_id>` channel was the
 * living proof: written, shipped, `private: true`, joining nothing, for months. This guard is
 * that defect's class, not its instance.
 *
 * It is the sibling of `check:realtime-publication`, which asks the same question of the OTHER
 * transport: a `postgres_changes` binding on an unpublished table also joins, reports
 * SUBSCRIBED and delivers nothing forever. Same silence, two different causes, two guards.
 *
 * WHAT IT READS. Every `.ts`/`.tsx` under this repo's application roots, under
 * `aidream/apps/shared/<pkg>/src` (where the `@ai-matrx/*` sources live), under
 * `matrx-extend/src` and under `matrx-local/desktop/src` — the four places the census found
 * channel declarations.
 *
 * HOW A TOPIC PREFIX IS RESOLVED. `@ai-matrx/realtime`'s `defineChannelNamespace` builds every
 * topic in one place: `foreignTopic` is used verbatim as the root, and a plain `namespace` is
 * prefixed `mx:`. So the guard finds the namespace declarations, then finds every channel spec
 * carrying `private: true`, and follows its `topic:` expression back to the namespace whose
 * `.topic(...)` produced it.
 *
 * AN UNRESOLVED SITE FAILS. It does not warn and it does not pass. A topic this file cannot
 * settle statically is a topic nobody has checked, which is the state that shipped the bug.
 * The escape hatch is an annotation on the call site — `// realtime-admission: <prefix>` — and
 * the guard then verifies THAT prefix against the registry, so the annotation is a claim it
 * checks rather than a way to be excused.
 *
 * WITHOUT DATABASE CREDENTIALS IT FAILS AS UNMEASURED, never as a pass. A guard that cannot
 * see the registry has not verified anything, and "green because it could not run" is exactly
 * how a silent class survives.
 *
 *   pnpm check:private-channel-admission
 *   pnpm check:private-channel-admission --list        # every private channel, with its prefix
 *   pnpm check:private-channel-admission --self-test   # prove the guard can FAIL (exit 0 = it can)
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import { loadDbEnvFrom } from "./lib/direct-db-env";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE = resolve(ROOT, "..");
const AIDREAM_DIR = process.env.AIDREAM_DIR ?? join(WORKSPACE, "aidream");
const SELF_TEST = process.argv.includes("--self-test");
const LIST_ONLY = process.argv.includes("--list");
const EXTRA_ROOT = (() => {
  const i = process.argv.indexOf("--extra-root");
  return i >= 0 ? process.argv[i + 1] : undefined;
})();

const C = {
  reset: "[0m",
  dim: "[2m",
  bold: "[1m",
  red: "[31m",
  green: "[32m",
  yellow: "[33m",
  cyan: "[36m",
};
const TAG = {
  ok: `${C.green}[ OK ]${C.reset} `,
  fail: `${C.red}[FAIL]${C.reset} `,
  info: `${C.cyan}[INFO]${C.reset} `,
  warn: `${C.yellow}[WARN]${C.reset} `,
};

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "coverage",
  "out",
  ".turbo",
  ".vercel",
  ".wt",
]);
const EXTS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx"];

/** The package's own topic root for a namespace that is not foreign. */
const TOPIC_PREFIX = "mx";

/** The annotation a call site uses when the topic cannot be settled statically. */
const ANNOTATION = /realtime-admission:\s*([A-Za-z0-9_:.\-]+)/;

function isTestFile(file: string): boolean {
  return /(\.test\.|\.spec\.|__tests__|\/testing\/|\/__mocks__\/|\/judgment-corpus\/)/.test(
    file.replace(/\\/g, "/"),
  );
}

function walk(dir: string, out: string[]): void {
  let entries: { name: string; isDirectory(): boolean }[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const target = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(target, out);
    } else if (EXTS.some((e) => entry.name.endsWith(e))) {
      out.push(target);
    }
  }
}

const FRONTEND_ROOTS = [
  "actions",
  "app",
  "components",
  "constants",
  "features",
  "hooks",
  "lib",
  "providers",
  "services",
  "types",
  "utils",
];

interface Scanned {
  file: string;
  repo: string;
}

function collectFiles(): Scanned[] {
  const out: Scanned[] = [];
  const add = (dir: string, repo: string): void => {
    const files: string[] = [];
    walk(dir, files);
    for (const f of files) {
      if (isTestFile(f)) continue;
      out.push({ file: f, repo });
    }
  };

  for (const root of FRONTEND_ROOTS) add(join(ROOT, root), "matrx-frontend");

  const pkgRoot = join(AIDREAM_DIR, "apps", "shared");
  let pkgs: string[] = [];
  try {
    pkgs = (readdirSync(pkgRoot, { withFileTypes: true }) as unknown as {
      name: string;
      isDirectory(): boolean;
    }[])
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    pkgs = [];
  }
  for (const pkg of pkgs) {
    const src = join(pkgRoot, pkg, "src");
    if (existsSync(src)) add(src, `aidream/apps/shared/${pkg}`);
  }

  for (const [dir, repo] of [
    [join(WORKSPACE, "matrx-extend", "src"), "matrx-extend"],
    [join(WORKSPACE, "matrx-local", "desktop", "src"), "matrx-local"],
    [join(WORKSPACE, "matrx-local", "app"), "matrx-local"],
  ] as const) {
    if (existsSync(dir)) add(dir, repo);
  }

  if (EXTRA_ROOT && existsSync(EXTRA_ROOT)) add(EXTRA_ROOT, "self-test");

  return out;
}

/* ──────────────────────────── parsing helpers ───────────────────────────── */

const parsed = new Map<string, ts.SourceFile | null>();
function parse(file: string): ts.SourceFile | null {
  if (parsed.has(file)) return parsed.get(file) ?? null;
  let sf: ts.SourceFile | null = null;
  try {
    sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  } catch {
    sf = null;
  }
  parsed.set(file, sf);
  return sf;
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function propOf(obj: ts.ObjectLiteralExpression, name: string): ts.Expression | null {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && p.name && ts.isIdentifier(p.name) && p.name.text === name) {
      return p.initializer;
    }
    if (ts.isShorthandPropertyAssignment(p) && p.name.text === name) return p.name;
  }
  return null;
}

function literalString(expr: ts.Expression | null): string | null {
  if (!expr) return null;
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
  return null;
}

function isTrue(expr: ts.Expression | null): boolean {
  return expr !== null && expr.kind === ts.SyntaxKind.TrueKeyword;
}

/* ───────────────────── every channel namespace, by variable ─────────────────────── */

interface Namespace {
  /** The topic ROOT this namespace produces: `custom:table`, or `mx:notes`. */
  prefix: string;
  file: string;
  line: number;
}

/** variableName → namespace, per file; plus a global by-name index for imports. */
const namespacesByFile = new Map<string, Map<string, Namespace>>();
const namespacesByName = new Map<string, Namespace[]>();

function indexNamespaces(files: Scanned[]): void {
  for (const { file } of files) {
    const text = (() => {
      try {
        return readFileSync(file, "utf8");
      } catch {
        return "";
      }
    })();
    if (!text.includes("defineChannelNamespace")) continue;
    const sf = parse(file);
    if (!sf) continue;
    const local = new Map<string, Namespace>();
    const visit = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        node.name &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isCallExpression(node.initializer) &&
        ts.isIdentifier(node.initializer.expression) &&
        node.initializer.expression.text === "defineChannelNamespace"
      ) {
        const arg = node.initializer.arguments[0];
        if (arg && ts.isObjectLiteralExpression(arg)) {
          const foreign = literalString(propOf(arg, "foreignTopic"));
          const ns = literalString(propOf(arg, "namespace"));
          const prefix = foreign ?? (ns ? `${TOPIC_PREFIX}:${ns}` : null);
          if (prefix) {
            const entry = { prefix, file, line: lineOf(sf, node) };
            local.set(node.name.text, entry);
            const bag = namespacesByName.get(node.name.text) ?? [];
            bag.push(entry);
            namespacesByName.set(node.name.text, bag);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    if (local.size > 0) namespacesByFile.set(file, local);
  }
}

/* ───────────────────────── every private channel site ───────────────────────── */

interface Site {
  file: string;
  repo: string;
  line: number;
  /** The prefix this site's topic resolves to, or null when it could not be settled. */
  prefix: string | null;
  /** How the prefix was arrived at, printed in --list and in the failure. */
  how: string;
}

/**
 * Follow a `topic:` expression back to the namespace that built it. The package makes this
 * tractable on purpose: a topic is NEVER written by hand at a call site (the doctrine's rule 4),
 * so every legitimate one is `<someNamespace>.topic(...)`.
 */
function prefixOfTopicExpr(
  expr: ts.Expression | null,
  file: string,
): { prefix: string | null; how: string } {
  if (!expr) return { prefix: null, how: "the spec carries no `topic:`" };

  // `ns.topic({...})`
  if (
    ts.isCallExpression(expr) &&
    ts.isPropertyAccessExpression(expr.expression) &&
    expr.expression.name.text === "topic" &&
    ts.isIdentifier(expr.expression.expression)
  ) {
    const varName = expr.expression.expression.text;
    const local = namespacesByFile.get(file)?.get(varName);
    if (local) return { prefix: local.prefix, how: `${varName}.topic() → defineChannelNamespace` };
    const global = namespacesByName.get(varName) ?? [];
    const distinct = [...new Set(global.map((g) => g.prefix))];
    if (distinct.length === 1)
      return { prefix: distinct[0]!, how: `${varName}.topic() → imported namespace` };
    if (distinct.length > 1)
      return {
        prefix: null,
        how: `${varName}.topic() is ambiguous — ${distinct.length} namespaces share that name`,
      };
    return { prefix: null, how: `${varName}.topic() names a namespace this guard cannot find` };
  }

  // A helper that returns the topic, e.g. `schedulerBroadcastTopic(userId)`. Resolve it when
  // the helper's body is a single `ns.topic(...)` return in a file we have indexed.
  if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) {
    const hit = resolveTopicHelper(expr.expression.text, file);
    if (hit) return { prefix: hit, how: `${expr.expression.text}() → defineChannelNamespace` };
  }

  // A literal topic root, `"custom:table:" + id` style. Take everything before the first
  // dynamic piece; the registry's own matching rule is prefix-then-colon, so a literal head is
  // exactly what the policy will see.
  if (ts.isTemplateExpression(expr) && expr.head.text.includes(":")) {
    const head = expr.head.text.replace(/:$/, "");
    return { prefix: head, how: "a template literal's fixed head" };
  }
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = literalString(expr.left);
    if (left && left.includes(":")) {
      return { prefix: left.replace(/:$/, ""), how: "a string concatenation's fixed head" };
    }
  }
  const whole = literalString(expr);
  if (whole) return { prefix: whole, how: "a literal topic" };

  return { prefix: null, how: "the `topic:` expression could not be settled statically" };
}

const helperCache = new Map<string, string | null>();
function resolveTopicHelper(name: string, file: string): string | null {
  const key = `${file}::${name}`;
  if (helperCache.has(key)) return helperCache.get(key) ?? null;
  let found: string | null = null;
  // The helper is nearly always in the same file as its namespace (the package's own pattern).
  for (const [nsFile, locals] of namespacesByFile) {
    const sf = parse(nsFile);
    if (!sf) continue;
    const visit = (node: ts.Node): void => {
      if (found) return;
      if (
        ts.isFunctionDeclaration(node) &&
        node.name &&
        node.name.text === name &&
        node.body &&
        node.body.statements.length === 1
      ) {
        const stmt = node.body.statements[0];
        if (stmt && ts.isReturnStatement(stmt) && stmt.expression) {
          const inner = prefixOfTopicExprLocal(stmt.expression, locals);
          if (inner) found = inner;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    if (found) break;
  }
  helperCache.set(key, found);
  return found;
}

function prefixOfTopicExprLocal(
  expr: ts.Expression,
  locals: Map<string, Namespace>,
): string | null {
  if (
    ts.isCallExpression(expr) &&
    ts.isPropertyAccessExpression(expr.expression) &&
    expr.expression.name.text === "topic" &&
    ts.isIdentifier(expr.expression.expression)
  ) {
    return locals.get(expr.expression.expression.text)?.prefix ?? null;
  }
  return null;
}

function collectSites(files: Scanned[]): Site[] {
  const sites: Site[] = [];
  for (const { file, repo } of files) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!/private\s*:\s*true/.test(text)) continue;
    const sf = parse(file);
    if (!sf) continue;
    const lines = text.split("\n");

    const visit = (node: ts.Node): void => {
      if (ts.isObjectLiteralExpression(node) && isTrue(propOf(node, "private"))) {
        // `{ private: true }` AND NOTHING ELSE is not a channel declaration — it is the
        // supabase-js config fragment the realtime manager itself spreads into
        // `client.channel(topic, { config: … })`. A real ChannelSpec always carries at least
        // its topic and its transport beside `private`. Skipping by SHAPE rather than by path
        // keeps the guard honest: any file may declare a channel, including the package's own.
        if (node.properties.length === 1) {
          ts.forEachChild(node, visit);
          return;
        }
        const line = lineOf(sf, node);
        // An annotation anywhere in the five lines above the spec is the declared answer.
        let annotated: string | null = null;
        for (let i = Math.max(0, line - 6); i < line; i += 1) {
          const m = ANNOTATION.exec(lines[i] ?? "");
          if (m) annotated = m[1]!;
        }
        if (annotated) {
          sites.push({ file, repo, line, prefix: annotated, how: "// realtime-admission:" });
        } else {
          const { prefix, how } = prefixOfTopicExpr(propOf(node, "topic"), file);
          sites.push({ file, repo, line, prefix, how });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return sites;
}

/* ──────────────────────────── the live registry ──────────────────────────── */

function readRegistry(): string[] | null {
  const env = loadDbEnvFrom(ROOT);
  if ("missing" in env) return null;
  let psql: string;
  try {
    psql = execFileSync("brew", ["--prefix", "libpq"], { encoding: "utf8" }).trim() + "/bin/psql";
  } catch {
    psql = "psql";
  }
  const dsn = `postgresql://${encodeURIComponent(env.user)}@${env.host}:${env.port}/${env.database}`;
  try {
    const out = execFileSync(
      psql,
      [dsn, "-At", "-c", "select prefix from platform.realtime_topic_prefix order by 1"],
      { encoding: "utf8", env: { ...process.env, PGPASSWORD: env.password }, timeout: 30000 },
    );
    return out
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * The SAME matching rule `platform.realtime_topic_admits` uses: the longest registered prefix
 * whose value plus a colon starts the topic. A declared prefix is covered when a registered
 * prefix is equal to it or is a colon-bounded head of it.
 */
function registeredFor(declared: string, registry: string[]): string | null {
  const matches = registry.filter((r) => declared === r || declared.startsWith(`${r}:`));
  matches.sort((a, b) => b.length - a.length);
  return matches[0] ?? null;
}

/* ──────────────────────────────── self-test ──────────────────────────────── */

function selfTest(): never {
  const dir = mkdtempSync(join(tmpdir(), "private-channel-admission-"));
  const file = join(dir, "planted.ts");
  writeFileSync(
    file,
    [
      'import { defineChannelNamespace, subscribeToRealtimeManager } from "@ai-matrx/realtime";',
      "",
      "const plantedChannel = defineChannelNamespace({",
      '  namespace: "planted-guard-probe",',
      '  foreignTopic: "nobody:owns:this",',
      '  parts: ["id"],',
      '  description: "a private channel on a prefix no schema has registered",',
      "});",
      "",
      "export function plant(id: string) {",
      "  return subscribeToRealtimeManager(() => ({",
      "    topic: plantedChannel.topic({ id }),",
      "    private: true,",
      '    broadcast: [{ event: "x", onMessage: () => {} }],',
      "  }));",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );
  // Re-run THIS guard, unchanged, over a root containing the planted file. It is run as a
  // child process rather than by calling main() so the exit code under test is the real one.
  const self = process.argv[1]!;
  const tsx = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
  const argv = self.endsWith(".ts") && existsSync(tsx)
    ? [tsx, self, "--extra-root", dir]
    : [self, "--extra-root", dir];
  let status = 0;
  try {
    execFileSync(process.execPath, argv, { stdio: "pipe", env: process.env });
  } catch (error) {
    status = (error as { status?: number }).status ?? 1;
  }
  if (status === 0) {
    console.log(
      `${TAG.fail}the guard PASSED with a private channel planted on the unregistered prefix ` +
        "`nobody:owns:this`. It cannot fail, so it is not a guard.",
    );
    exitAfterDrain(1);
  }
  console.log(
    `${TAG.ok}RED when it should be: a planted private channel on an unregistered prefix ` +
      `made the guard exit ${status}. ${C.dim}(${relative(ROOT, file)})${C.reset}`,
  );
  exitAfterDrain(0);
}

/* ─────────────────────────────────── main ─────────────────────────────────── */

function main(): void {
  if (SELF_TEST) selfTest();

  const files = collectFiles();
  indexNamespaces(files);
  const sites = collectSites(files);

  console.log(
    `${TAG.info}${files.length} source file(s) across matrx-frontend, aidream/apps/shared, ` +
      `matrx-extend and matrx-local; ${namespacesByName.size} channel namespace(s); ` +
      `${C.bold}${sites.length}${C.reset} private channel declaration(s).`,
  );

  const registry = readRegistry();
  if (registry === null) {
    console.log(
      `${TAG.fail}UNMEASURED — the five SUPABASE_MATRIX_* variables (or psql) are not available, ` +
        "so platform.realtime_topic_prefix could not be read. This guard never passes on a " +
        "registry it did not see: a private channel whose prefix is unregistered joins nothing, " +
        "forever, and looks healthy while it does it.",
    );
    exitAfterDrain(1);
  }
  console.log(
    `${TAG.info}registry: ${registry.length} prefix(es) — ${registry.join(", ") || "(none)"}`,
  );

  if (LIST_ONLY) {
    for (const s of sites) {
      const hit = s.prefix ? registeredFor(s.prefix, registry) : null;
      console.log(
        `  ${hit ? `${C.green}admitted by ${hit}${C.reset}` : `${C.red}${s.prefix ?? "UNRESOLVED"}${C.reset}`}` +
          `  ${relative(WORKSPACE, s.file)}:${s.line}  ${C.dim}${s.how}${C.reset}`,
      );
    }
    exitAfterDrain(0);
  }

  const unresolved = sites.filter((s) => s.prefix === null);
  const unregistered = sites.filter((s) => s.prefix !== null && !registeredFor(s.prefix, registry));

  for (const s of unresolved) {
    console.log(
      `${TAG.fail}${relative(WORKSPACE, s.file)}:${s.line} declares \`private: true\` and this ` +
        `guard could not work out its topic prefix — ${s.how}.\n` +
        `       A topic nobody can resolve is a topic nobody has checked. Build it through ` +
        `\`defineChannelNamespace\` (never a hand-written topic string — realtime doctrine rule 4), ` +
        `or annotate the call site \`// realtime-admission: <prefix>\` and the guard will verify ` +
        `THAT prefix against platform.realtime_topic_prefix.`,
    );
  }
  for (const s of unregistered) {
    console.log(
      `${TAG.fail}${relative(WORKSPACE, s.file)}:${s.line} declares \`private: true\` on topic ` +
        `prefix ${C.bold}${s.prefix}${C.reset}, which NO schema has registered in ` +
        `platform.realtime_topic_prefix.\n` +
        `       The one RLS policy on realtime.messages dispatches by prefix; an unregistered ` +
        `prefix is refused at every join, so this channel joins nothing, forever, and the screen ` +
        `above it looks healthy while it does. Register it in a migration:\n` +
        `         insert into platform.realtime_topic_prefix (prefix, admits_fn, description)\n` +
        `         values ('${s.prefix}', '<schema>.realtime_topic_admits(text)'::regprocedure, '…');\n` +
        `       The answering function must ask that schema's EXISTING access rule — the same ` +
        `question its own read doors ask — never a new one invented for the socket.`,
    );
  }

  const bad = unresolved.length + unregistered.length;
  if (bad === 0) {
    console.log(
      `${TAG.ok}all ${sites.length} private channel declaration(s) name a topic prefix that a ` +
        `schema has registered an admission function for.`,
    );
    exitAfterDrain(0);
  }
  console.log(
    `${TAG.fail}${bad} of ${sites.length} private channel declaration(s) would be refused at ` +
      `the join.`,
  );
  exitAfterDrain(1);
}

main();
