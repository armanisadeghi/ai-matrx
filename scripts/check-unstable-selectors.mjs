#!/usr/bin/env node
// pnpm check:unstable-selectors — INLINE SELECTORS THAT MINT A FRESH VALUE ON EVERY STORE NOTIFICATION.
//
// `useAppSelector(fn)` re-runs `fn` on EVERY store notification and re-renders the component
// whenever the result is not `===` the previous one. A selector that returns a new array/object
// literal, or calls `.filter` / `.map` / `Object.values` / `Object.entries` / … inline, returns a
// new reference every time — so its component re-renders on every dispatch anywhere in the app.
// With several chats streaming on the /board canvas that is every mounted page re-rendering ~30×
// a second for state it does not read (perf campaign, 2026-10-01). The fix is a `createSelector`
// (or a stable EMPTY constant for the `?? []` fallback), never a manual `useMemo`.
//
// Offline and read-only: parses every tracked .ts/.tsx under app, features, components, hooks,
// lib and providers with the TypeScript compiler API and inspects the function passed DIRECTLY
// as the first argument of `useAppSelector` / `useSelector` (a call carrying an equality function
// as its second argument is deliberate and skipped). It flags a returned expression that is:
//   - an array / object literal, or `new X(…)`
//   - a call to .filter .map .flatMap .slice .concat .toSorted .toReversed .toSpliced .with
//   - Object.values / entries / keys / fromEntries / assign, Array.from / Array.of, structuredClone
//   - any of the above through `?:`, `??`, `||`, `&&`, parentheses, `as`, `!`, `satisfies`
// Selector FACTORIES defined elsewhere (`useAppSelector(selectX(id))`) are out of reach of a
// one-file parse and are not judged here.
//
// THE BASELINE ONLY SHRINKS (`scripts/unstable-selectors-baseline.json`, file → count). A file
// above its baseline, or an offending file the baseline does not know, is a finding (exit 1).
// `--shrink` lowers entries that dropped and removes files that reached zero; never raises/adds.
//
// Usage:
//   pnpm check:unstable-selectors                 # NEW/grown files only (exit 1 on any)
//   pnpm check:unstable-selectors --list          # …and every offending selector with its line
//   pnpm check:unstable-selectors --shrink        # lower the baseline to what is true now
//   pnpm check:unstable-selectors --self-test     # prove the check can still fail (planted sample)
//   pnpm check:unstable-selectors <file> …        # just these files, every finding (no baseline)
import { execFileSync } from "node:child_process";
import { gitFiles } from "./lib/source-roots.cjs";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const BASELINE = join(ROOT, "scripts/unstable-selectors-baseline.json");
const SCOPE = ["app", "features", "../aidream/apps/shared/chat/src", "components", "hooks", "lib", "providers"];
const HOOKS = new Set(["useAppSelector", "useSelector"]);
const FRESH_METHODS = new Set([
  "filter",
  "map",
  "flatMap",
  "slice",
  "concat",
  "toSorted",
  "toReversed",
  "toSpliced",
  "with",
]);
const FRESH_STATICS = {
  Object: new Set(["values", "entries", "keys", "fromEntries", "assign"]),
  Array: new Set(["from", "of"]),
};

const ts = createRequire(join(ROOT, "package.json"))("typescript");

function unwrap(node) {
  let n = node;
  while (
    n &&
    (ts.isParenthesizedExpression(n) ||
      ts.isAsExpression(n) ||
      ts.isNonNullExpression(n) ||
      (ts.isSatisfiesExpression && ts.isSatisfiesExpression(n)) ||
      ts.isTypeAssertionExpression(n))
  ) {
    n = n.expression;
  }
  return n;
}

/** Why `expr` yields a fresh reference on every call, or null when it does not. */
function freshReason(node) {
  const n = unwrap(node);
  if (!n) return null;
  if (ts.isArrayLiteralExpression(n)) return "array literal";
  if (ts.isObjectLiteralExpression(n)) return "object literal";
  if (ts.isNewExpression(n)) return `new ${n.expression.getText()}`;
  if (ts.isConditionalExpression(n)) return freshReason(n.whenTrue) ?? freshReason(n.whenFalse);
  if (ts.isBinaryExpression(n)) {
    const op = n.operatorToken.kind;
    if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) {
      return freshReason(n.left) ?? freshReason(n.right);
    }
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return freshReason(n.right);
    return null;
  }
  if (ts.isCallExpression(n)) {
    const callee = unwrap(n.expression);
    if (ts.isIdentifier(callee) && callee.text === "structuredClone") return "structuredClone()";
    if (ts.isPropertyAccessExpression(callee)) {
      const name = callee.name.text;
      const target = unwrap(callee.expression);
      if (ts.isIdentifier(target) && FRESH_STATICS[target.text]?.has(name)) {
        return `${target.text}.${name}()`;
      }
      if (FRESH_METHODS.has(name)) return `.${name}()`;
    }
  }
  return null;
}

/** Return expressions of a function body, not descending into nested functions. */
function returnedExpressions(fn) {
  if (!ts.isBlock(fn.body)) return [fn.body];
  const out = [];
  const visit = (node) => {
    if (ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression) out.push(node.expression);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(fn.body, visit);
  return out;
}

/** Findings for one source text: [{ line, hook, reason, text }]. */
export function analyseSource(fileName, text) {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const findings = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      HOOKS.has(node.expression.text) &&
      node.arguments.length === 1
    ) {
      const arg = unwrap(node.arguments[0]);
      if (arg && (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg))) {
        for (const expr of returnedExpressions(arg)) {
          const reason = freshReason(expr);
          if (reason) {
            const { line } = sf.getLineAndCharacterOfPosition(expr.getStart(sf));
            findings.push({
              line: line + 1,
              hook: node.expression.text,
              reason,
              text: expr.getText(sf).replace(/\s+/g, " ").slice(0, 100),
            });
            break;
          }
        }
      }
    }
    // A hand-written selector (or selector factory) named `select…` that is NOT a createSelector:
    // `const selectX = (state) => fresh` / `const selectX = (id) => (state) => fresh`. Every
    // consumer of it re-renders on every dispatch, wherever it is used.
    const isSelectorVar =
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      /^select[A-Z]/.test(node.name.text) &&
      node.initializer;
    const isSelectorFn =
      ts.isFunctionDeclaration(node) && node.name && /^select[A-Z]/.test(node.name.text) && node.body;
    if (isSelectorVar || isSelectorFn) {
      let fn = isSelectorFn ? node : unwrap(node.initializer);
      // Unwrap one factory level: (id) => (state) => …
      if (fn && ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) {
        const inner = unwrap(fn.body);
        if (inner && (ts.isArrowFunction(inner) || ts.isFunctionExpression(inner))) fn = inner;
      }
      // Only a STORE selector: its first parameter is the store state (`state`/`s`/`rootState`, or
      // typed `…State`). A `selectValues(filter)` helper that is not a Redux selector is not judged.
      const first = fn?.parameters?.[0];
      const readsStore =
        first &&
        ((ts.isIdentifier(first.name) && /^(state|s|rootState)$/.test(first.name.text)) ||
          (first.type && /State\b/.test(first.type.getText(sf))));
      if (readsStore && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn) || ts.isFunctionDeclaration(fn))) {
        for (const expr of returnedExpressions(fn)) {
          const reason = freshReason(expr);
          if (reason) {
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
            findings.push({
              line: line + 1,
              hook: node.name.text,
              reason,
              text: expr.getText(sf).replace(/\s+/g, " ").slice(0, 100),
            });
            break;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

function trackedFiles() {
  const globs = SCOPE.flatMap((d) => [`${d}/**/*.ts`, `${d}/**/*.tsx`]);
  return gitFiles(ROOT, ["ls-files", "-z", "--", ...globs])
    .split("\0")
    .filter(Boolean)
    .filter((f) => !/(^|\/)__tests__\/|\.test\.tsx?$|\.spec\.tsx?$|\.stories\.tsx$|\.d\.ts$/.test(f))
    .filter((f) => existsSync(join(ROOT, f)))
    .sort();
}

function census(files) {
  const byFile = {};
  for (const file of files) {
    const text = readFileSync(join(ROOT, file), "utf8");
    if (!text.includes("Selector(") && !/\bselect[A-Z]/.test(text)) continue;
    const found = analyseSource(file, text);
    if (found.length > 0) byFile[file] = found;
  }
  return byFile;
}

function readBaseline() {
  if (!existsSync(BASELINE)) return null;
  return JSON.parse(readFileSync(BASELINE, "utf8")).files ?? {};
}

function writeBaseline(files, note) {
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
  const total = Object.values(sorted).reduce((s, n) => s + n, 0);
  writeFileSync(
    BASELINE,
    `${JSON.stringify(
      {
        _: "pnpm check:unstable-selectors — inline useAppSelector/useSelector callbacks that return a fresh array/object per call, per file. ONLY SHRINKS: fix one (createSelector / stable EMPTY), then `pnpm check:unstable-selectors --shrink`. Never add or raise an entry by hand.",
        note,
        total,
        files: sorted,
      },
      null,
      1,
    )}\n`,
  );
}

const ratchet = (baseline, now) =>
  Object.entries(now)
    .filter(([f, n]) => n > (baseline[f] ?? 0))
    .map(([f]) => f);

function selfTest() {
  // Planted in memory — never by editing a real file.
  const planted = `
    export function Planted({ id }: { id: string }) {
      const a = useAppSelector((s) => s.items.list.filter((x) => x.on));          // fresh: .filter
      const b = useAppSelector((s) => Object.values(s.items.byId));                // fresh: Object.values
      const c = useAppSelector((s) => ({ one: s.a, two: s.b }));                    // fresh: object literal
      const d = useSelector((s) => s.items.byId[id]?.tags ?? []);                  // fresh: ?? []
      const e = useAppSelector((s) => { if (!s.x) return null; return s.x.map((y) => y.id); });
      const ok1 = useAppSelector((s) => s.items.byId[id]);                         // stable ref
      const ok2 = useAppSelector((s) => s.items.list.filter((x) => x.on).length);  // primitive
      const ok3 = useAppSelector((s) => s.items.list.some((x) => x.on));           // primitive
      const ok4 = useAppSelector((s) => s.items.list.map((x) => x.id), shallowEqual); // deliberate
      const ok5 = useAppSelector(selectThing(id));                                  // factory: not judged
      return null;
    }
    const selectActiveThings = (id: string) => (state: RootState) =>
      state.things.byId[id]?.list.filter((x) => x.on);                            // fresh: factory .filter
    const selectThingIds = (state: RootState) => Object.keys(state.things.byId); // fresh: Object.keys
    const selectMemo = createSelector([selectIds], (ids) => ids.map(String));     // memoized: fine
    const selectOne = (id: string) => (state: RootState) => state.things.byId[id]; // stable ref
    function selectAllThings(state: RootState) { return [...state.things.list]; } // fresh: spread array`;
  const found = analyseSource("planted.tsx", planted);
  const reasons = found.map((f) => f.reason);
  const expected = [".filter()", "Object.values()", "object literal", "array literal", ".map()", ".filter()", "Object.keys()", "array literal"];
  const detects = found.length === expected.length && expected.every((r, i) => reasons[i] === r);
  const grows = ratchet({ "a.tsx": 1 }, { "a.tsx": 2 }).length === 1;
  const unknown = ratchet({}, { "b.tsx": 1 }).length === 1;
  const shrinkOk = ratchet({ "a.tsx": 3 }, { "a.tsx": 1 }).length === 0;
  const ok = detects && grows && unknown && shrinkOk;
  if (!detects) console.log("[unstable-selectors] self-test: detector found", JSON.stringify(found, null, 1));
  console.log(
    ok
      ? "[unstable-selectors] self-test OK — the check flags all 8 planted fresh selectors, passes the 7 stable ones, and the ratchet fails on a grown or unknown file."
      : "[unstable-selectors] self-test FAILED",
  );
  process.exit(ok ? 0 : 1);
}

function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const named = args.filter((a) => !a.startsWith("--"));
  if (flags.has("--self-test")) return selfTest();

  if (named.length > 0) {
    let n = 0;
    for (const file of named) {
      const found = analyseSource(file, readFileSync(resolve(ROOT, file), "utf8"));
      for (const f of found) console.log(`${file}:${f.line}  ${f.hook} returns ${f.reason}  ${f.text}`);
      n += found.length;
    }
    console.log(`[unstable-selectors] ${n} unstable inline selector(s) in ${named.length} file(s).`);
    return;
  }

  const findings = census(trackedFiles());
  const now = Object.fromEntries(Object.entries(findings).map(([f, list]) => [f, list.length]));
  const total = Object.values(now).reduce((s, n) => s + n, 0);
  const baseline = readBaseline();

  if (flags.has("--write-initial")) {
    if (baseline) {
      console.error("[unstable-selectors] a baseline already exists; it only shrinks (--shrink).");
      process.exit(1);
    }
    writeBaseline(now, `Initial census ${new Date().toISOString().slice(0, 10)}: ${total} unstable inline selectors in ${Object.keys(now).length} files.`);
    console.log(`[unstable-selectors] baseline written: ${Object.keys(now).length} files, ${total} selectors.`);
    return;
  }
  if (!baseline) {
    console.log("[unstable-selectors] no baseline yet — `pnpm check:unstable-selectors --write-initial` records today's census.");
    process.exit(1);
  }

  if (flags.has("--list")) {
    for (const [file, list] of Object.entries(findings)) {
      for (const f of list) console.log(`${file}:${f.line}  ${f.hook} returns ${f.reason}  ${f.text}`);
    }
  }

  const grown = ratchet(baseline, now);
  const shrunk = Object.entries(baseline).filter(([f, n]) => (now[f] ?? 0) < n);
  if (flags.has("--shrink")) {
    const next = {};
    for (const [f, n] of Object.entries(baseline)) {
      const m = Math.min(n, now[f] ?? 0);
      if (m > 0) next[f] = m;
    }
    const raw = JSON.parse(readFileSync(BASELINE, "utf8"));
    writeBaseline(next, raw.note);
    console.log(`[unstable-selectors] baseline shrunk: ${shrunk.length} file(s) lowered; never raised, never added.`);
  } else if (shrunk.length > 0) {
    console.log(`[unstable-selectors] ${shrunk.length} file(s) now hold fewer than the baseline records — \`pnpm check:unstable-selectors --shrink\` locks that in.`);
  }

  if (grown.length > 0) {
    console.log(`\n[FAIL] ${grown.length} file(s) hold MORE unstable inline selectors than the baseline allows (each re-renders its component on every dispatch):`);
    for (const f of grown) {
      console.log(`   ${f}: ${now[f]} (baseline ${baseline[f] ?? 0})`);
      for (const x of findings[f]) console.log(`      :${x.line}  ${x.hook} returns ${x.reason}  ${x.text}`);
    }
    console.log("  Fix: a createSelector (memoized per id) or a module-level EMPTY constant for the fallback. Never raise the baseline.");
    process.exit(1);
  }
  const recorded = Object.values(baseline).reduce((s, n) => s + n, 0);
  console.log(`[unstable-selectors] OK — no file holds more than the baseline (${recorded} recorded, ${total} now).`);
}

main();
