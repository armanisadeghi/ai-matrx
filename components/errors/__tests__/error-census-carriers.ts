/**
 * Which components carry the Alchemy Menu themselves, resolved across imports
 * for the tree census (RC-B12 round 5). `<ErrorPane message={error} />` is
 * carried when ErrorPane's own render holds the menu — in this file or in the
 * file it is imported from. Every other neutral component handed an error by
 * prop is an uncarried display at the call site.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/** The census's per-file carrier finder, passed in so this file imports nothing
 * relative (the lint rule loads both through Node's own TypeScript support). */
type CarriersOf = (source: string, fileName: string, known: ReadonlySet<string>) => Set<string>;

const EXT = [".tsx", ".ts", "/index.tsx", "/index.ts"];

function resolveImport(root: string, fromRel: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
  else return null;
  for (const ext of ["", ...EXT]) {
    const rel = base + ext;
    const full = path.join(root, rel);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return rel;
  }
  return null;
}

type Imports = Array<{ local: string; imported: string; from: string }>;

function importsOf(root: string, rel: string, source: string): Imports {
  const sf = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  const out: Imports = [];
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const from = resolveImport(root, rel, st.moduleSpecifier.text);
    if (!from) continue;
    const clause = st.importClause;
    if (clause.name) out.push({ local: clause.name.text, imported: "default", from });
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) {
        out.push({ local: el.name.text, imported: (el.propertyName ?? el.name).text, from });
      }
    }
  }
  return out;
}

function defaultExportName(source: string): string | null {
  const m = source.match(/export\s+default\s+(?:async\s+)?(?:function\s+)?([A-Z]\w*)/);
  return m ? m[1] : null;
}

/** Build a resolver: (source, rel) → names that carry the menu in that file. */
export function buildCarryingResolver(
  root: string,
  rels: string[],
  componentsThatCarry: CarriersOf,
): (source: string, rel: string) => ReadonlySet<string> {
  const sources = new Map<string, string>();
  for (const rel of rels) {
    if (!/\.tsx?$/.test(rel)) continue;
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    // Only files that could define or forward a carrier matter.
    sources.set(rel, src);
  }
  const imports = new Map<string, Imports>();
  const carrying = new Map<string, Set<string>>();
  const importedCarriers = (rel: string): Set<string> => {
    const set = new Set<string>();
    for (const imp of imports.get(rel) ?? []) {
      const theirs = carrying.get(imp.from);
      if (!theirs || theirs.size === 0) continue;
      const name = imp.imported === "default" ? defaultExportName(sources.get(imp.from) ?? "") : imp.imported;
      if (name && theirs.has(name)) set.add(imp.local);
    }
    return set;
  };
  // `export * from "./parts"` / `export { A } from "./parts"` forward the target's carriers.
  const reexports = new Map<string, Array<{ from: string; names: string[] | null }>>();
  for (const [rel, src] of sources) {
    const list: Array<{ from: string; names: string[] | null }> = [];
    for (const m of src.matchAll(/export\s*(\*|\{([^}]*)\})\s*from\s*["']([^"']+)["']/g)) {
      const from = resolveImport(root, rel, m[3]);
      if (!from) continue;
      const names = m[1] === "*" ? null : m[2].split(",").map((part) => part.trim().split(/\s+as\s+/).pop()!.trim()).filter(Boolean);
      list.push({ from, names });
    }
    if (list.length) reexports.set(rel, list);
    if (!/<[A-Z]/.test(src) && !list.length) continue;
    imports.set(rel, importsOf(root, rel, src));
  }
  // Fixpoint over imports: a component that renders an imported carrier carries.
  for (let pass = 0; pass < 6; pass += 1) {
    let changed = false;
    for (const [rel, src] of sources) {
      if (!imports.has(rel)) continue;
      const next = componentsThatCarry(src, rel, importedCarriers(rel));
      for (const re of reexports.get(rel) ?? []) {
        for (const name of carrying.get(re.from) ?? []) if (!re.names || re.names.includes(name)) next.add(name);
      }
      if (next.size !== (carrying.get(rel)?.size ?? 0)) changed = true;
      carrying.set(rel, next);
    }
    if (!changed) break;
  }
  return (source, rel) => {
    const local = carrying.get(rel) ?? componentsThatCarry(source, rel, new Set());
    const set = new Set(local);
    for (const name of importedCarriers(rel)) set.add(name);
    return set;
  };
}
