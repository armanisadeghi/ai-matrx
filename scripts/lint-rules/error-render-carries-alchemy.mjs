/**
 * matrx/error-render-carries-alchemy (RC-B12, 2026-09-26)
 *
 * Every error the UI shows carries the Alchemy Menu — through ErrorNotice,
 * ErrorBox or <ErrorAlchemyMenu/> in the same box. The jest census
 * (components/errors/__tests__/error-renders-carry-alchemy.test.ts) proves the
 * whole tree, but CI is a signal, never a gate, and new renders kept landing
 * between runs. This rule puts the SAME census in the editor and `pnpm lint`,
 * so the render is flagged the moment it is written.
 *
 * One definition: the rule loads the census module itself
 * (components/errors/__tests__/error-display-census.ts, through Node's own
 * TypeScript support) — it never re-derives what an error display is.
 * Components that draw the menu themselves are resolved across imports once
 * per lint process (error-census-carriers.ts), then this file's own text
 * wins over the copy on disk.
 *
 * Fix: render the error through <ErrorNotice …/> (or a component that does),
 * or put <ErrorAlchemyMenu error={…} /> inside the error's own box — on its
 * line, never a row of its own. See components/errors/FEATURE.md.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Node warns that a .ts file has no "type" — expected here; keep lint output clean.
async function importQuiet(rel) {
  const original = process.emitWarning;
  process.emitWarning = (warning, ...rest) => {
    const text = typeof warning === "string" ? warning : warning?.message ?? "";
    if (/Module type of file|MODULE_TYPELESS_PACKAGE_JSON|Type Stripping|stripping types/i.test(`${text} ${rest.join(" ")}`)) return;
    return original.call(process, warning, ...rest);
  };
  try {
    return await import(path.join(ROOT, rel));
  } finally {
    process.emitWarning = original;
  }
}

const census = await importQuiet("components/errors/__tests__/error-display-census.ts");
const carriers = await importQuiet("components/errors/__tests__/error-census-carriers.ts");

let resolver = null;
function treeResolver() {
  if (resolver) return resolver;
  let rels = [];
  try {
    rels = execSync("git ls-files -co --exclude-standard -- app components features lib", {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 1e9,
    })
      .split("\n")
      .filter((rel) => rel.endsWith(".tsx"));
  } catch {
    rels = [];
  }
  const fs = globalThis.process.getBuiltinModule?.("node:fs");
  const existing = fs ? rels.filter((rel) => fs.existsSync(path.join(ROOT, rel))) : rels;
  resolver = carriers.buildCarryingResolver(ROOT, existing, census.componentsThatCarry);
  return resolver;
}

export const errorRenderCarriesAlchemy = {
  meta: {
    type: "problem",
    docs: {
      description:
        "An error shown in the UI must carry the Alchemy Menu (ErrorNotice, ErrorBox, or <ErrorAlchemyMenu/> in its own box).",
    },
    schema: [],
    messages: {
      uncarried:
        "This {{what}} shows an error without the Alchemy Menu ({{reason}}). Render it through <ErrorNotice …/>, or put <ErrorAlchemyMenu error={…} /> inside this box, on the error's line — never a row of its own. See components/errors/FEATURE.md.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    const rel = path.relative(ROOT, filename).split(path.sep).join("/");
    if (rel.startsWith("..") || !census.isCensusScannable(rel)) return {};
    return {
      "Program:exit"() {
        const source = (context.sourceCode ?? context.getSourceCode()).text;
        const fromTree = treeResolver();
        census.setCarryingComponentsResolver((text, name) => {
          const set = new Set(fromTree(text, name));
          for (const own of census.componentsThatCarry(text, name, set)) set.add(own);
          return set;
        });
        let hits = [];
        try {
          hits = census.uncarriedErrorDisplays(source, rel);
        } finally {
          census.setCarryingComponentsResolver(null);
        }
        for (const hit of hits) {
          context.report({
            loc: { start: { line: hit.line, column: 0 }, end: { line: hit.line, column: 0 } },
            messageId: "uncarried",
            data: { what: `<${hit.tag}>`, reason: hit.reason },
          });
        }
      },
    };
  },
};
