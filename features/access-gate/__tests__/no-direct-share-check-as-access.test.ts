/**
 * FORCING FUNCTION: client code never asks `public.has_permission` whether a person may act on a
 * record. That RPC reads DIRECT share rows only — it told a note's OWNER "no" (RC-B11 walk,
 * 2026-09-26) and anyone who reaches a record through their organization or a container. The one
 * question is `canActOn(token, id, level)` (features/access-gate/service/canActOn.ts → iam.has_access).
 *
 * Parsed with the TypeScript compiler over app/, features/, components/, lib/, hooks/, providers/,
 * utils/ (tests excluded): any `.rpc("has_permission" | "has_permission_for", …)` call fails, by file
 * and line.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "../../..");
const DIRS = ["app", "features", "components", "lib", "hooks", "providers", "utils"];
const BANNED = new Set(["has_permission", "has_permission_for"]);

function* walk(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".next") || e.name === "__tests__") continue;
      yield* walk(p);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec|stories)\.tsx?$/.test(e.name) && !e.name.endsWith(".d.ts")) {
      yield p;
    }
  }
}

export function directShareChecks(files?: Array<{ name: string; text: string }>): string[] {
  const out: string[] = [];
  const sources = files ?? [...DIRS.flatMap((d) => [...walk(path.join(ROOT, d))])].map((f) => ({ name: path.relative(ROOT, f), text: fs.readFileSync(f, "utf8") }));
  for (const { name, text } of sources) {
    if (!text.includes("has_permission")) continue;
    const sf = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, name.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "rpc") {
        const first = n.arguments[0];
        if (first && ts.isStringLiteralLike(first) && BANNED.has(first.text)) {
          out.push(`${name}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} rpc("${first.text}")`);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out.sort();
}

it("no client code asks has_permission whether someone may act on a record", () => {
  const found = directShareChecks();
  if (found.length) {
    throw new Error(`Use canActOn(token, id, level) (iam.has_access) instead of the direct-share check:\n  ${found.join("\n  ")}`);
  }
});

it("the guard itself finds a direct-share check (self-test)", () => {
  expect(directShareChecks([{ name: "x.ts", text: 'await supabase.rpc("has_permission", { p_resource_type: "dataset" });' }])).toHaveLength(1);
  expect(directShareChecks([{ name: "y.ts", text: 'await supabase.rpc("has_permissions_report", {});' }])).toHaveLength(0);
});
