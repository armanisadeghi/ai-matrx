/**
 * A CONFIRM THAT CANNOT BE SHOWN MUST NEVER VANISH.
 *
 * WHAT THIS CLOSES — FIX-11A/F7, measured on the running app on 2026-09-22.
 * `components/dialogs/confirm/ConfirmDialogHost.tsx`'s `confirm()` used to
 * THROW when no `<ConfirmDialogHost />` was mounted, on the written assumption
 * that "the caller's own error handling surfaces it". That assumption is false
 * against this tree. The ordinary shape of a confirm-gated control is
 *
 *     onClick={() => void (async () => { const ok = await confirm({...}); … })()}
 *
 * — a FLOATING promise whose rejection reaches no `catch`, raises no toast and
 * prints nothing a person can see. It becomes an unhandled rejection, and the
 * control is, to the person pressing it, dead: exactly the shape law 4 forbids.
 * The census below counts the call sites standing in that shape; on the day
 * this guard was written there were 333 of them, so "the caller will catch it"
 * describes no site at all.
 *
 * THE RULE THIS ENFORCES. The primitive itself never throws on the no-host
 * path: it ANNOUNCES ITSELF WITH A REMEDY and answers `false` — which every
 * caller already handles as "not confirmed, do nothing". So the guard reads
 * the primitive and fails if the announcement is gone or a `throw` has come
 * back to that path, and it prints the census as the reason.
 *
 * WHAT COUNTS AS AN OFFENCE, precisely:
 *   1. the no-host branch of `confirm()` in the primitive throws; or
 *   2. it does not call the announcement; or
 *   3. it does not answer `false`.
 *
 *   pnpm check:confirm-never-vanishes
 *   pnpm check:confirm-never-vanishes:self-test   # proves it can still go RED
 */

import { execSync } from "child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import ts from "typescript";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = join(__dirname, "..");
const PRIMITIVE = "components/dialogs/confirm/ConfirmDialogHost.tsx";

/** The modules that hand out the imperative `confirm`. */
const CONFIRM_MODULE = /ConfirmDialogHost|confirm-opener/;

export interface Verdict {
  ok: boolean;
  why: string[];
}

/**
 * READ THE NO-HOST BRANCH OF `confirm()` ITSELF, not the whole file — a
 * `throw` somewhere else in the module is somebody else's business, and a
 * substring search over the file would miss the branch coming back inside a
 * helper it calls.
 */
export function judgePrimitive(body: string): Verdict {
  const why: string[] = [];
  const sf = ts.createSourceFile(PRIMITIVE, body, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  let found: ts.FunctionDeclaration | undefined;
  const find = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "confirm") found = node;
    ts.forEachChild(node, find);
  };
  find(sf);
  if (!found?.body) {
    return { ok: false, why: [`${PRIMITIVE} no longer declares \`export async function confirm\` — this guard can no longer read the branch it protects.`] };
  }

  const text = found.body.getText(sf);

  // The branch: `if (!(await waitForConfirmHost(...))) { … }`
  const branch = /waitForConfirmHost\([^)]*\)\s*\)\s*\)\s*\{([\s\S]*?)\n  \}/.exec(text);
  if (!branch) {
    why.push(`${PRIMITIVE}: could not find the \`if (!(await waitForConfirmHost(…)))\` branch inside \`confirm()\`. The no-host path is what this guard protects; if it moved, move the guard with it.`);
    return { ok: false, why };
  }
  const arm = branch[1] ?? "";

  if (/\bthrow\b/.test(arm)) {
    why.push(`${PRIMITIVE}: the no-host branch THROWS again. A rejection out of \`confirm()\` reaches no catch at the floating \`void (async () => …)()\` call sites below, so the control goes dead and silent.`);
  }
  if (!/announceTheQuestionCouldNotBeAsked\s*\(/.test(arm)) {
    why.push(`${PRIMITIVE}: the no-host branch no longer announces itself. Law 4: every stand-in announces itself with a remedy — a confirm that cannot be shown must say so to the person.`);
  }
  if (!/return\s+false/.test(arm)) {
    why.push(`${PRIMITIVE}: the no-host branch no longer answers \`false\`. Every caller reads \`if (!ok) return;\`, so \`false\` is the only answer that performs nothing without inventing a new contract.`);
  }
  return { ok: why.length === 0, why };
}

/**
 * THE CENSUS — every `confirm(...)` whose rejection nothing could handle: not
 * lexically inside a `try`, and the enclosing function's promise not
 * `.catch()`ed. It is printed as the REASON the rule above exists, never as a
 * list of things to fix one by one: the fix is the primitive.
 */
export function floatingCallSites(root: string = ROOT): string[] {
  const files = execSync("git ls-files '*.ts' '*.tsx'", { cwd: root, maxBuffer: 1 << 28 })
    .toString().trim().split("\n").filter(Boolean);
  const hits: string[] = [];
  for (const rel of files) {
    let body: string;
    try { body = readFileSync(join(root, rel), "utf8"); } catch { continue; }
    if (!CONFIRM_MODULE.test(body) || !/\bconfirm\b/.test(body)) continue;
    const sf = ts.createSourceFile(rel, body, ts.ScriptTarget.Latest, true,
      rel.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

    const names = new Set<string>();
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st)) continue;
      const spec = st.moduleSpecifier;
      if (!ts.isStringLiteral(spec) || !CONFIRM_MODULE.test(spec.text)) continue;
      const nb = st.importClause?.namedBindings;
      if (nb && ts.isNamedImports(nb)) {
        for (const e of nb.elements) {
          if ((e.propertyName?.text ?? e.name.text) === "confirm") names.add(e.name.text);
        }
      }
    }
    if (names.size === 0) continue;

    const walk = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && names.has(node.expression.text)) {
        let n: ts.Node | undefined = node.parent;
        let handled = false;
        while (n) {
          if (ts.isTryStatement(n) && n.tryBlock.getStart() <= node.getStart() && node.getEnd() <= n.tryBlock.getEnd()) {
            handled = true; break;
          }
          if (ts.isFunctionLike(n)) {
            let p: ts.Node | undefined = n.parent;
            if (p && ts.isCallExpression(p) && p.expression === n) p = p.parent;
            if (p && ts.isPropertyAccessExpression(p) && /^(catch|then)$/.test(p.name.text)) { handled = true; break; }
          }
          n = n.parent;
        }
        if (!handled) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
          hits.push(`${rel}:${line + 1}`);
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(sf);
  }
  return hits;
}

function main(): void {
  if (process.argv.includes("--self-test")) {
    // A FORCING-FUNCTION SELF-TEST. Replay the exact primitive this guard was
    // written against — the throwing one — and prove the guard still sees it.
    const dir = mkdtempSync(join(tmpdir(), "confirm-never-vanishes-selftest-"));
    const live = readFileSync(join(ROOT, PRIMITIVE), "utf8");
    const planted = live.replace(
      /await announceTheQuestionCouldNotBeAsked\(\);\s*\n\s*return false;/,
      'throw new Error(\n      "Could not show the confirmation dialog: no <ConfirmDialogHost /> is mounted in this tree. The action was not performed.",\n    );',
    );
    writeFileSync(join(dir, "planted.tsx"), planted);
    if (planted === live) {
      console.error("[FAIL] self-test: could not plant the 2026-09-22 throwing primitive — the shape this guard reads has moved. Fix the guard, do not skip it.");
      exitAfterDrain(1);
    }
    const red = judgePrimitive(planted);
    const green = judgePrimitive(live);
    if (red.ok) {
      console.error(`[FAIL] self-test: the guard passed the THROWING primitive (planted at ${join(dir, "planted.tsx")}). It cannot go red, so it proves nothing.`);
      exitAfterDrain(1);
    }
    if (!green.ok) {
      console.error(`[FAIL] self-test: the guard failed the LIVE primitive, which announces and answers false — ${green.why.join("; ")}. A guard that refuses the correct shape teaches people to switch it off.`);
      exitAfterDrain(1);
    }
    console.log(`[OK] self-test: RED on the throwing primitive, GREEN on the announcing one (planted in ${dir}). The guard can still fail.`);
    exitAfterDrain(0);
  }

  const verdict = judgePrimitive(readFileSync(join(ROOT, PRIMITIVE), "utf8"));
  const floating = floatingCallSites();
  if (!verdict.ok) {
    console.error("[FAIL] a confirm that cannot be shown would vanish:");
    for (const line of verdict.why) console.error("  - " + line);
    console.error(`  …and ${floating.length} confirm() call site(s) in this repo are floating promises that would swallow it, e.g.`);
    for (const site of floating.slice(0, 5)) console.error("      " + site);
    exitAfterDrain(1);
  }
  console.log(`[OK] a confirm that cannot be shown announces itself with a remedy and answers false, so none of the ${floating.length} floating confirm() call site(s) can go silently dead.`);
}

if (require.main === module) main();
