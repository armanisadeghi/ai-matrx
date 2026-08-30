#!/usr/bin/env tsx
/**
 * HRB-026 — THE HR RPC SEAM IS TYPED BY NOBODY. THIS IS THE TYPE CHECK.
 *
 *   pnpm hr:rpc-conformance
 *
 * Every HR write and read crosses one untyped seam: `supabase.rpc(name, args)`.
 * The client picks the argument NAMES and, for the payload doors, the JSON KEY
 * NAMES, and TypeScript checks neither against what the Postgres function
 * actually declares and actually reads. `Args` in `types/database.types.ts`
 * covers the argument names for doors that exist — but every HR call site casts
 * (`fn as never`, `args as never`, `rpcClient` typed as `(fn: string, …)`)
 * precisely because the generated types cannot express these doors, so that
 * check is switched off at every single call site.
 *
 * The consequence is the defect class this guard exists to end: a misnamed
 * argument or a misnamed payload key produces NO compile error, NO type error,
 * and at runtime either a 400 that the "a refusal is DATA" transport swallows
 * into a toast, or — for a payload key — a completely silent no-op. The write
 * "succeeds", `ok: true` comes back, and the field was simply dropped on the
 * floor. It has now happened at least five times: verification letters,
 * separations, corrective actions twice, and the corrective-action outcome
 * arguments.
 *
 * WHAT IT CHECKS, against `scripts/hr/hr-door-snapshot.json` (live `pg_proc`):
 *
 *   MISSING DOOR              the door name is not a function at all → PGRST202
 *   UNKNOWN ARGUMENT          an argument the client sends is not declared
 *   MISSING REQUIRED ARGUMENT a no-DEFAULT argument the client never sends
 *   PAYLOAD KEY NEVER READ    a key in a jsonb payload that the function body
 *                             never reads — the silent-no-op case
 *   UNKNOWN TOKEN / WRONG TIER  an `hr_*` token literal that is not registered,
 *                             or whose audited tier is not the tier the door
 *                             demands (`hr_restricted_list` on a confidential
 *                             token raises 22023)
 *
 * and, as WARNINGS that never fail the build:
 *
 *   KEY NEVER SENT            a payload key the door reads that no analyzable
 *                             call site sends — usually fine (optional field),
 *                             occasionally a half-built form
 *   STALE SNAPSHOT            a door in the snapshot that `types/database.types.ts`
 *                             no longer knows about, or vice versa
 *
 * 🚨 AND IT PRINTS WHAT IT COULD NOT SEE, EVERY RUN. A static check over a
 * dynamic language is partial by construction: payloads assembled with spreads,
 * built across module boundaries, or handed in from a caller this pass cannot
 * reach are NOT verified. Those are listed by file and line under
 * "UNANALYZABLE" on every run and are never counted as passing. A guard that
 * quietly treats what it cannot see as clean is the thing it was built to
 * prevent.
 *
 * OFFLINE BY DESIGN. Like every other step in the hr-guards CI job, this needs
 * no database and no secrets, so it runs on every push and can never report
 * UNMEASURED. Live truth arrives through the committed snapshot; refresh it
 * with `pnpm hr:door-snapshot` (scripts/hr/hr_door_snapshot.sql).
 *
 * Exit codes: 0 conformant · 1 at least one failure · 2 the guard itself broke
 *             (missing snapshot, unparseable source) — never a silent pass.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SNAPSHOT = resolve(ROOT, "scripts/hr/hr-door-snapshot.json");
const DB_TYPES = resolve(ROOT, "types/database.types.ts");

/** Where HR speaks to Postgres. Anything outside these trees is out of scope. */
const SCAN_ROOTS = ["features/hr", "app/(core)/hr"];

/**
 * Not a production call site. Test and self-check harnesses construct
 * deliberately partial calls (`callHrTimeRpc(rpc, {}, { mockCase })` walks every
 * door with an empty argument object on purpose), and failing those would make
 * the guard wrong about the one thing it exists to be right about.
 */
const EXCLUDED = /(^|[/\\])(__tests__|__checks__|__mocks__|mocks)[/\\]|\.(test|spec)\.tsx?$/;

const C = { reset: "\x1b[0m", dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m" };
const TAG = {
  info: `${C.cyan}[INFO]${C.reset} `,
  warn: `${C.yellow}[WARN]${C.reset} `,
  fail: `${C.red}[FAIL]${C.reset} `,
  ok: `${C.green}[ OK ]${C.reset} `,
};

// ── the snapshot ────────────────────────────────────────────────────────────

interface DoorArg { required: boolean; ord: number }
interface JsonbParam { reads: string[]; analyzable: boolean; unresolved_refs: number }
interface Door { args: Record<string, DoorArg>; jsonb_params: Record<string, JsonbParam> }
interface Snapshot {
  generated_at: string;
  source: string;
  doors: Record<string, Door>;
  doors_with_no_args: string[];
  door_expected_tier: Record<string, string>;
  tokens: Record<string, { tier: string | null; has_door: boolean }>;
}

// ── findings ────────────────────────────────────────────────────────────────

interface Site { file: string; line: number }
interface Finding extends Site { door: string; kind: string; detail: string }
interface Unanalyzable extends Site { what: string; why: string }

const failures: Finding[] = [];
const warnings: Finding[] = [];
const unanalyzable: Unanalyzable[] = [];

// ── source loading ──────────────────────────────────────────────────────────

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry) && !/\.d\.ts$/.test(entry) && !EXCLUDED.test(p)) out.push(p);
  }
  return out;
}

interface SourceFile { path: string; rel: string; sf: ts.SourceFile }

function lineOf(file: SourceFile, node: ts.Node): number {
  return file.sf.getLineAndCharacterOfPosition(node.getStart(file.sf)).line + 1;
}

// ── expression classification ───────────────────────────────────────────────

/** Peel the wrappers that never change what an expression IS. */
function unwrap(node: ts.Expression): ts.Expression {
  let n: ts.Expression = node;
  for (;;) {
    if (ts.isParenthesizedExpression(n)) { n = n.expression; continue; }
    if (ts.isAsExpression(n) || ts.isTypeAssertionExpression(n) || ts.isSatisfiesExpression(n)) { n = n.expression; continue; }
    if (ts.isNonNullExpression(n)) { n = n.expression; continue; }
    // `args.filter ?? {}` and `x || {}` — the LEFT side is the value that matters.
    if (
      ts.isBinaryExpression(n) &&
      (n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        n.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    ) { n = n.left; continue; }
    return n;
  }
}

/** The enclosing function-ish node, for parameter lookups. */
function enclosingFunction(node: ts.Node): ts.SignatureDeclaration | null {
  let n: ts.Node | undefined = node.parent;
  while (n) {
    if (
      ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) ||
      ts.isArrowFunction(n) || ts.isMethodDeclaration(n)
    ) return n;
    n = n.parent;
  }
  return null;
}

/** The name a function is reachable by (declaration name, or `const f = …`). */
function functionName(fn: ts.SignatureDeclaration): string | null {
  if ((ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)) && fn.name) return fn.name.getText();
  const p = fn.parent;
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.getText();
  return null;
}

/** `x` or `x.y` where `x` is parameter i of the enclosing function → (i, path). */
function asParamPath(expr: ts.Expression, fn: ts.SignatureDeclaration | null): { index: number; path: string[] } | null {
  if (!fn) return null;
  const path: string[] = [];
  let n = unwrap(expr);
  while (ts.isPropertyAccessExpression(n)) { path.unshift(n.name.getText()); n = unwrap(n.expression); }
  if (!ts.isIdentifier(n)) return null;
  const name = n.getText();
  const index = fn.parameters.findIndex((p) => ts.isIdentifier(p.name) && p.name.getText() === name);
  return index === -1 ? null : { index, path };
}

interface ObjectShape { keys: string[]; hasSpread: boolean; computed: boolean }

function objectShape(obj: ts.ObjectLiteralExpression): ObjectShape {
  const keys: string[] = [];
  let hasSpread = false;
  let computed = false;
  for (const prop of obj.properties) {
    if (ts.isSpreadAssignment(prop)) { hasSpread = true; continue; }
    const name = prop.name;
    if (!name) { computed = true; continue; }
    if (ts.isComputedPropertyName(name)) { computed = true; continue; }
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) keys.push(name.text);
    else computed = true;
  }
  return { keys, hasSpread, computed };
}

// ── pass 1: top-level string constants ──────────────────────────────────────
//
// `const HR_CORRECTIVE_ACTION_TOKEN = "hr_corrective_action"` is how tokens
// travel to a door.
//
// 🚨 SCOPED PER FILE, AND ONLY TOP-LEVEL. A first cut used one flat name→value
// map across the whole tree and it silently mis-resolved a `for (const rpc of
// RPCS)` loop variable to a `const rpc = "hr_wf_decide"` in an unrelated file,
// inventing a call site that does not exist. A guard that fabricates findings
// gets switched off. So: only `const X = "…"` at the top level of a module, and
// a cross-file lookup only for `export const`s whose name is unambiguous.

const fileConsts = new Map<string, Map<string, string>>();
const exportedConsts = new Map<string, string>();
const ambiguousExports = new Set<string>();

function collectStringConsts(file: SourceFile): void {
  const locals = new Map<string, string>();
  for (const stmt of file.sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    const exported = stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
      const init = unwrap(decl.initializer);
      if (!ts.isStringLiteral(init) && !ts.isNoSubstitutionTemplateLiteral(init)) continue;
      const name = decl.name.getText();
      locals.set(name, init.text);
      if (!exported) continue;
      const prior = exportedConsts.get(name);
      if (prior !== undefined && prior !== init.text) ambiguousExports.add(name);
      else exportedConsts.set(name, init.text);
    }
  }
  fileConsts.set(file.rel, locals);
}

/** A string literal, or an identifier that provably resolves to one. */
function asStringValue(expr: ts.Expression, file: SourceFile): string | null {
  const n = unwrap(expr);
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (!ts.isIdentifier(n)) return null;
  const name = n.getText();
  const local = fileConsts.get(file.rel)?.get(name);
  if (local !== undefined) return local;
  if (ambiguousExports.has(name)) return null;
  return exportedConsts.get(name) ?? null;
}

// ── pass 2: who dispatches an RPC ───────────────────────────────────────────
//
// The transport is not one function. `features/hr/service.ts` has callHrRaw and
// callHrWrite; time and leave each have their own (`callHrTimeRpc`,
// `callHrLeaveRpc`); several files call `supabase.rpc` directly. Rather than
// hard-code that list — which would go stale the first time someone adds a
// sixth — derive it: a function is a DISPATCHER at (doorArg, argsArg) when it
// forwards two of its own parameters into `.rpc(…)` or into another dispatcher.
// Iterated to a fixed point, this finds wrappers of wrappers.

interface Dispatcher { doorIndex: number; argsIndex: number }
const dispatchers = new Map<string, Dispatcher>();

function calleeIsRpc(call: ts.CallExpression): boolean {
  const e = call.expression;
  return ts.isPropertyAccessExpression(e) && e.name.getText() === "rpc";
}

function deriveDispatchers(files: SourceFile[]): void {
  for (let round = 0; round < 6; round += 1) {
    const before = dispatchers.size;
    for (const file of files) {
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node)) {
          const known = calleeIsRpc(node)
            ? { doorIndex: 0, argsIndex: 1 }
            : (ts.isIdentifier(node.expression) ? dispatchers.get(node.expression.getText()) : undefined);
          if (known && node.arguments.length > Math.max(known.doorIndex, known.argsIndex)) {
            const fn = enclosingFunction(node);
            const name = fn ? functionName(fn) : null;
            if (fn && name && !dispatchers.has(name)) {
              const d = asParamPath(node.arguments[known.doorIndex] as ts.Expression, fn);
              const a = asParamPath(node.arguments[known.argsIndex] as ts.Expression, fn);
              if (d && d.path.length === 0 && a && a.path.length === 0) {
                dispatchers.set(name, { doorIndex: d.index, argsIndex: a.index });
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      ts.forEachChild(file.sf, visit);
    }
    if (dispatchers.size === before) break;
  }
}

// ── pass 3: the door calls ──────────────────────────────────────────────────

/** One `p_x:` slot at one door call, waiting to be given a value. */
interface Sink { door: string; arg: string; site: Site }
/** A function parameter (or one property of it) that FEEDS a sink. */
interface Conduit { fn: string; index: number; path: string[]; sink: Sink }

interface DoorCall {
  door: string;
  site: Site;
  args: string[] | null;       // null = the args object was not a literal
  argsReason?: string;
}

/** Set in main(), before any pass that needs to know what a door declares. */
let snapshot: Snapshot;

/**
 * Which arguments need their VALUE traced, as opposed to just their name.
 *
 * A `p_employment_id` holding a uuid from a React variable is not a defect
 * risk this guard can or should speak about — its NAME is checked and that is
 * the whole seam. Only two kinds of argument carry a second, unchecked
 * vocabulary inside them: a jsonb payload (keys) and a token (a registry
 * value). Tracing anything else would bury the honest coverage gaps under
 * hundreds of lines of "this uuid came from a hook", which is exactly how an
 * unanalyzable list stops being read.
 */
function valueMatters(door: string, arg: string): boolean {
  if (arg === "p_token" || arg === "p_target_token") return true;
  return Boolean(snapshot.doors[door]?.jsonb_params[arg]);
}

const doorCalls: DoorCall[] = [];
const conduits: Conduit[] = [];
/** door+arg → every literal object we proved reaches it. */
const objectValues = new Map<string, Array<{ site: Site; shape: ObjectShape }>>();
/** door+arg → every string literal we proved reaches it. */
const stringValues = new Map<string, Array<{ site: Site; value: string }>>();

const sinkKey = (s: { door: string; arg: string }): string => `${s.door}::${s.arg}`;

function push<T>(m: Map<string, T[]>, k: string, v: T): void {
  const list = m.get(k);
  if (list) list.push(v); else m.set(k, [v]);
}

function describe(expr: ts.Expression): string {
  const text = unwrap(expr).getText().replace(/\s+/g, " ");
  return text.length > 70 ? `${text.slice(0, 67)}…` : text;
}

/**
 * Give one expression to one sink. Either it resolves here, or it becomes a
 * conduit to be chased in the fixed point, or it is honestly unanalyzable.
 */
function bind(expr: ts.Expression, sink: Sink, file: SourceFile, node: ts.Node): void {
  const n = unwrap(expr);
  const site: Site = { file: file.rel, line: lineOf(file, node) };

  if (ts.isObjectLiteralExpression(n)) {
    push(objectValues, sinkKey(sink), { site, shape: objectShape(n) });
    return;
  }
  const str = asStringValue(n, file);
  if (str !== null) { push(stringValues, sinkKey(sink), { site, value: str }); return; }

  // A literal that is definitively NOT a payload/token — nothing to check.
  if (
    n.kind === ts.SyntaxKind.NullKeyword || n.kind === ts.SyntaxKind.TrueKeyword ||
    n.kind === ts.SyntaxKind.FalseKeyword || ts.isNumericLiteral(n) ||
    ts.isArrayLiteralExpression(n)
  ) return;

  const fn = enclosingFunction(n);
  const param = asParamPath(n, fn);
  const name = fn ? functionName(fn) : null;
  if (param && name) { conduits.push({ fn: name, index: param.index, path: param.path, sink }); return; }

  unanalyzable.push({
    ...site,
    what: `${sink.door}(${sink.arg})`,
    why: `value is \`${describe(n)}\` — not a literal, and not traceable to a parameter of an enclosing named function`,
  });
}

function collectDoorCalls(file: SourceFile): void {
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const d = calleeIsRpc(node)
        ? { doorIndex: 0, argsIndex: 1 }
        : (ts.isIdentifier(node.expression) ? dispatchers.get(node.expression.getText()) : undefined);
      if (d && node.arguments.length > d.doorIndex) {
        const door = asStringValue(node.arguments[d.doorIndex] as ts.Expression, file);
        const site: Site = { file: file.rel, line: lineOf(file, node) };
        if (door === null) {
          unanalyzable.push({
            ...site,
            what: "an RPC dispatch",
            why: `the door name is \`${describe(node.arguments[d.doorIndex] as ts.Expression)}\`, not a string literal`,
          });
        } else if (/^hr_[a-z0-9_]+$/.test(door)) {
          const argsExpr = node.arguments[d.argsIndex] as ts.Expression | undefined;
          const unwrapped = argsExpr ? unwrap(argsExpr) : undefined;
          if (unwrapped && ts.isObjectLiteralExpression(unwrapped)) {
            const shape = objectShape(unwrapped);
            doorCalls.push({ door, site, args: shape.keys });
            if (shape.hasSpread || shape.computed) {
              unanalyzable.push({
                ...site,
                what: `${door} argument names`,
                why: "the argument object uses a spread or a computed key, so the full argument set is not statically known",
              });
            }
            for (const prop of unwrapped.properties) {
              if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) continue;
              const argName = prop.name.getText().replace(/['"]/g, "");
              if (!argName.startsWith("p_")) continue;
              if (!valueMatters(door, argName)) continue;
              const value = ts.isPropertyAssignment(prop)
                ? prop.initializer
                : (prop as ts.ShorthandPropertyAssignment).name;
              bind(value, { door, arg: argName, site }, file, prop);
            }
          } else {
            doorCalls.push({
              door, site, args: null,
              argsReason: argsExpr
                ? `the argument object is \`${describe(argsExpr)}\`, not an object literal`
                : "no argument object was passed",
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(file.sf, visit);
}

// ── pass 4: chase the conduits to a fixed point ─────────────────────────────
//
// `issueHrCorrectiveAction(payload)` → `.rpc("hr_corrective_action_issue",
// { p_payload: payload })`. The literal lives in the DIALOG, one hop away. The
// token case is two hops: `sweep(TOKEN, …)` → `fetchHrRestrictedList({token})`
// → `p_token`. So this iterates rather than looking one level up.

function chaseConduits(files: SourceFile[]): void {
  let frontier = conduits.splice(0, conduits.length);
  const seen = new Set<string>();

  for (let round = 0; round < 8 && frontier.length > 0; round += 1) {
    const wanted = new Map<string, Conduit[]>();
    for (const c of frontier) {
      const key = `${c.fn}#${c.index}#${c.path.join(".")}#${sinkKey(c.sink)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      push(wanted, c.fn, c);
    }
    if (wanted.size === 0) return;

    const found = new Set<string>();
    for (const file of files) {
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
          const list = wanted.get(node.expression.getText());
          if (list) {
            for (const c of list) {
              found.add(c.fn);
              const site: Site = { file: file.rel, line: lineOf(file, node) };
              let expr = node.arguments[c.index] as ts.Expression | undefined;
              if (!expr) continue;
              // Walk the property path into the object literal, if we can.
              let ok = true;
              for (const step of c.path) {
                const u: ts.Expression | undefined = expr ? unwrap(expr) : undefined;
                if (!u || !ts.isObjectLiteralExpression(u)) { ok = false; break; }
                const prop: ts.ObjectLiteralElementLike | undefined = u.properties.find(
                  (p) => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
                    p.name && p.name.getText().replace(/['"]/g, "") === step,
                );
                if (!prop) {
                  // The caller simply does not pass this optional field.
                  ok = false; expr = undefined; break;
                }
                expr = ts.isPropertyAssignment(prop) ? prop.initializer : (prop as ts.ShorthandPropertyAssignment).name;
              }
              if (!ok || !expr) {
                if (expr) {
                  unanalyzable.push({
                    ...site,
                    what: `${c.sink.door}(${c.sink.arg}) via ${c.fn}()`,
                    why: `argument ${c.index} is \`${describe(expr)}\`, so \`${c.path.join(".")}\` cannot be read from it`,
                  });
                }
                continue;
              }
              bind(expr, c.sink, file, node);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      ts.forEachChild(file.sf, visit);
    }

    for (const [fn, list] of wanted) {
      if (found.has(fn)) continue;
      // Nobody in scope calls it — an exported service function used only from
      // outside the HR trees, or dead. Either way: not verified, and said so.
      const c = list[0] as Conduit;
      unanalyzable.push({
        file: c.sink.site.file, line: c.sink.site.line,
        what: `${c.sink.door}(${c.sink.arg}) via ${fn}()`,
        why: `no call to \`${fn}()\` was found under ${SCAN_ROOTS.join(" or ")}, so nothing proves what reaches this argument`,
      });
    }

    frontier = conduits.splice(0, conduits.length);
  }
}

// ── pass 5: validate ────────────────────────────────────────────────────────

function validate(snap: Snapshot): void {
  const doorsSeen = new Set<string>();

  for (const call of doorCalls) {
    doorsSeen.add(call.door);
    const door = snap.doors[call.door];
    const noArgDoor = snap.doors_with_no_args.includes(call.door);

    if (!door && !noArgDoor) {
      failures.push({
        ...call.site, door: call.door, kind: "MISSING DOOR",
        detail: `\`${call.door}\` is not a function in \`public\` — this call cannot do anything but PGRST202 ("could not find the function")`,
      });
      continue;
    }
    const declared = door ? door.args : {};

    if (call.args === null) {
      unanalyzable.push({
        ...call.site, what: `${call.door} argument names`,
        why: call.argsReason ?? "the argument object is not a literal",
      });
      continue;
    }

    for (const arg of call.args) {
      if (!arg.startsWith("p_")) continue;
      if (!(arg in declared)) {
        failures.push({
          ...call.site, door: call.door, kind: "UNKNOWN ARGUMENT",
          detail: `sends \`${arg}\`, which \`${call.door}\` does not declare. It declares: ${
            Object.keys(declared).sort().join(", ") || "(no arguments)"
          }`,
        });
      }
    }
    for (const [name, meta] of Object.entries(declared)) {
      if (meta.required && !call.args.includes(name)) {
        failures.push({
          ...call.site, door: call.door, kind: "MISSING REQUIRED ARGUMENT",
          detail: `\`${name}\` has no DEFAULT and is not sent`,
        });
      }
    }
  }

  // ---- payload keys, and the token values
  for (const [key, values] of objectValues) {
    const [doorName, argName] = key.split("::") as [string, string];
    const door = snap.doors[doorName];
    const param = door?.jsonb_params[argName];
    if (!param) continue; // not a jsonb argument (or a missing door, already failed)

    if (!param.analyzable) {
      for (const v of values) {
        unanalyzable.push({
          ...v.site, what: `${doorName}(${argName}) payload keys`,
          why: `the DOOR is opaque: \`${argName}\` is referenced ${param.unresolved_refs} time(s) outside a literal key access (forwarded, merged, or record-expanded), so its read-set is only a lower bound`,
        });
      }
      continue;
    }

    const reads = new Set(param.reads);
    for (const v of values) {
      if (v.shape.hasSpread || v.shape.computed) {
        unanalyzable.push({
          ...v.site, what: `${doorName}(${argName}) payload keys`,
          why: "the payload literal uses a spread or a computed key, so the full key set is not statically known",
        });
      }
      for (const k of v.shape.keys) {
        if (!reads.has(k)) {
          failures.push({
            ...v.site, door: doorName, kind: "PAYLOAD KEY NEVER READ",
            detail: `\`${argName}.${k}\` is sent, and \`${doorName}\` never reads it. THIS IS A SILENT NO-OP — the write returns ok and the value is dropped. The door reads: ${
              param.reads.join(", ") || "(nothing)"
            }`,
          });
        }
      }
    }

    // The mirror finding, ONE line per door: keys the door reads that nothing
    // proven sends. Mostly optional fields the UI does not collect yet — but it
    // is also where a half-built form shows up, and it is how you notice that
    // `hr_corrective_action_issue` reads `employment_id` and nobody sends one.
    const sent = new Set(values.flatMap((v) => v.shape.keys));
    const unsent = param.reads.filter((k) => !sent.has(k));
    if (unsent.length > 0) {
      warnings.push({
        file: "-", line: 0, door: doorName, kind: "KEY NEVER SENT",
        detail: `${doorName} reads ${unsent.length} key(s) of \`${argName}\` that no analyzable call site sends: ${unsent.join(", ")}`,
      });
    }
  }

  // ---- token literals: registered, and the tier the door demands
  for (const [key, values] of stringValues) {
    const [doorName, argName] = key.split("::") as [string, string];
    if (argName !== "p_token" && argName !== "p_target_token") continue;
    const expected = snap.door_expected_tier[doorName];
    for (const v of values) {
      const token = snap.tokens[v.value];
      if (!token) {
        failures.push({
          ...v.site, door: doorName, kind: "UNKNOWN TOKEN",
          detail: `\`${v.value}\` is not a registered entity token (platform.entity_types)`,
        });
        continue;
      }
      if (!token.has_door && expected) {
        failures.push({
          ...v.site, door: doorName, kind: "TOKEN HAS NO DOOR",
          detail: `\`${v.value}\` is structurally doorless — hr._door_spec grants it no capabilities, so ${doorName} refuses it`,
        });
        continue;
      }
      if (expected && token.tier && token.tier !== expected) {
        failures.push({
          ...v.site, door: doorName, kind: "WRONG TIER FOR TOKEN",
          detail: `\`${doorName}\` serves the \`${expected}\` tier; \`${v.value}\` is \`${token.tier}\`. The door raises 22023 ("% is the % tier") on every call.`,
        });
      }
    }
  }

  // ---- is the snapshot still describing the database we generate types from?
  if (existsSync(DB_TYPES)) {
    const types = readFileSync(DB_TYPES, "utf8");
    const missing = Object.keys(snap.doors)
      .filter((d) => !new RegExp(`^      ${d}: \\{$`, "m").test(types))
      .sort();
    if (missing.length > 0) {
      warnings.push({
        file: "scripts/hr/hr-door-snapshot.json", line: 0, door: "-", kind: "STALE SNAPSHOT",
        detail: `${missing.length} door(s) in the snapshot are absent from types/database.types.ts (${
          missing.slice(0, 5).join(", ")
        }${missing.length > 5 ? ", …" : ""}). Refresh with \`pnpm hr:door-snapshot\` and \`pnpm db-types\`.`,
      });
    }
  }
}

// ── report ──────────────────────────────────────────────────────────────────

function report(snap: Snapshot): number {
  const at = `${C.dim}(snapshot pulled ${snap.generated_at})${C.reset}`;
  console.log(`${TAG.info}HRB-026 HR RPC conformance — client call sites vs. live pg_proc ${at}`);
  console.log(
    `${TAG.info}${doorCalls.length} door call(s) across ${new Set(doorCalls.map((c) => c.site.file)).size} site file(s); ` +
      `dispatchers derived: ${[...dispatchers.keys()].sort().join(", ") || "(none — only direct .rpc)"}`,
  );

  console.log("");
  console.log(`${TAG.info}${C.dim}── UNANALYZABLE — call sites this check did NOT verify ──${C.reset}`);
  if (unanalyzable.length === 0) {
    console.log(`${TAG.ok}nothing: every extracted call site was fully resolved.`);
  } else {
    const sorted = [...unanalyzable].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
    for (const u of sorted) console.log(`      ${u.file}:${u.line}  ${u.what}\n        ${C.dim}${u.why}${C.reset}`);
    console.log(`${TAG.warn}${unanalyzable.length} call site(s) above are NOT covered by this guard. They are not passing — they are unmeasured.`);
  }

  if (warnings.length > 0) {
    console.log("");
    console.log(`${TAG.info}${C.dim}── WARNINGS (never fail the build) ──${C.reset}`);
    for (const w of warnings) console.log(`${TAG.warn}${w.kind}: ${w.detail}`);
  }

  console.log("");
  if (failures.length === 0) {
    console.log(`${TAG.ok}HR RPC conformance: every analyzable call site matches the door it calls.`);
    return 0;
  }
  const sorted = [...failures].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  for (const f of sorted) {
    console.log(`${TAG.fail}${f.file}:${f.line}  ${f.kind}  →  ${f.door}`);
    console.log(`        ${f.detail}`);
  }
  console.log("");
  console.log(`${TAG.fail}${failures.length} HR RPC conformance failure(s). Every one of these is a call that cannot do what its author believes it does.`);
  return 1;
}

// ── main ────────────────────────────────────────────────────────────────────

function main(): number {
  if (!existsSync(SNAPSHOT)) {
    console.error(`${TAG.fail}no door snapshot at ${relative(ROOT, SNAPSHOT)} — regenerate it with \`pnpm hr:door-snapshot\`.`);
    return 2;
  }
  const snap = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as Snapshot;
  snapshot = snap;

  const paths: string[] = [];
  for (const root of SCAN_ROOTS) {
    const dir = resolve(ROOT, root);
    if (existsSync(dir)) walk(dir, paths);
  }
  if (paths.length === 0) {
    console.error(`${TAG.fail}no HR sources found under ${SCAN_ROOTS.join(", ")} — the scan roots are wrong, and a check that scans nothing passes everything.`);
    return 2;
  }

  const files: SourceFile[] = paths.map((p) => ({
    path: p,
    rel: relative(ROOT, p),
    sf: ts.createSourceFile(p, readFileSync(p, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
  }));

  for (const f of files) collectStringConsts(f);
  deriveDispatchers(files);
  for (const f of files) collectDoorCalls(f);
  chaseConduits(files);
  validate(snap);
  return report(snap);
}

try {
  process.exit(main());
} catch (err) {
  console.error(`${TAG.fail}the guard itself failed: ${err instanceof Error ? err.stack : String(err)}`);
  process.exit(2);
}
