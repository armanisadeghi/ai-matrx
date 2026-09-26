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

/** The census's per-file functions, passed in so this file imports nothing
 * relative (the lint rule loads both through Node's own TypeScript support). */
type ComponentFact = { direct: boolean; tags: string[] };
export type CensusFns = {
  componentFacts: (source: string, fileName: string) => Record<string, ComponentFact>;
  carriersFromFacts: (facts: Record<string, ComponentFact>, known: ReadonlySet<string>) => Set<string>;
};

/** Everything the index needs from one file — one parse, cacheable by mtime. */
export type FileFacts = {
  imports: Imports;
  reexports: Array<{ from: string; names: string[] | null }>;
  defaultName: string | null;
  components: Record<string, ComponentFact>;
};

/** The on-disk cache the lint rule keeps (node_modules/.cache): facts per file, keyed by mtime + size. */
export type FactsCache = {
  version: number;
  files: Record<string, { mtimeMs: number; size: number; facts: FileFacts }>;
};
export const FACTS_CACHE_VERSION = 1;

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

function factsOf(root: string, rel: string, src: string, fns: CensusFns): FileFacts {
  const reexports: FileFacts["reexports"] = [];
  for (const m of src.matchAll(/export\s*(\*|\{([^}]*)\})\s*from\s*["']([^"']+)["']/g)) {
    const from = resolveImport(root, rel, m[3]);
    if (!from) continue;
    const names = m[1] === "*" ? null : m[2].split(",").map((part) => part.trim().split(/\s+as\s+/).pop()!.trim()).filter(Boolean);
    reexports.push({ from, names });
  }
  const relevant = /<[A-Z]/.test(src) || reexports.length > 0;
  return {
    imports: relevant ? importsOf(root, rel, src) : [],
    reexports,
    defaultName: defaultExportName(src),
    components: /<[A-Z]/.test(src) ? fns.componentFacts(src, rel) : {},
  };
}

/**
 * Facts for every file, reusing a cached entry whenever the file's mtime and
 * size are unchanged. Returns the facts and the refreshed cache (only files
 * that still exist) and how many files it had to re-read.
 */
export function collectFacts(
  root: string,
  rels: string[],
  fns: CensusFns,
  cache?: FactsCache | null,
): { facts: Map<string, FileFacts>; cache: FactsCache; reparsed: number } {
  const prior = cache && cache.version === FACTS_CACHE_VERSION ? cache.files : {};
  const next: FactsCache = { version: FACTS_CACHE_VERSION, files: {} };
  const facts = new Map<string, FileFacts>();
  let reparsed = 0;
  for (const rel of rels) {
    if (!/\.tsx?$/.test(rel)) continue;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(path.join(root, rel));
    } catch {
      continue;
    }
    const hit = prior[rel];
    let entry: FileFacts;
    if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) entry = hit.facts;
    else {
      entry = factsOf(root, rel, fs.readFileSync(path.join(root, rel), "utf8"), fns);
      reparsed += 1;
    }
    next.files[rel] = { mtimeMs: stat.mtimeMs, size: stat.size, facts: entry };
    facts.set(rel, entry);
  }
  return { facts, cache: next, reparsed };
}

/** The resolver from facts alone — no file is read or parsed here. */
export function resolverFromFacts(
  facts: Map<string, FileFacts>,
  fns: CensusFns,
): (source: string, rel: string) => ReadonlySet<string> {
  const carrying = new Map<string, Set<string>>();
  const importedCarriers = (rel: string): Set<string> => {
    const set = new Set<string>();
    for (const imp of facts.get(rel)?.imports ?? []) {
      const theirs = carrying.get(imp.from);
      if (!theirs || theirs.size === 0) continue;
      const name = imp.imported === "default" ? facts.get(imp.from)?.defaultName ?? null : imp.imported;
      if (name && theirs.has(name)) set.add(imp.local);
    }
    return set;
  };
  // Fixpoint over imports and re-exports: a component that renders an imported carrier carries.
  for (let pass = 0; pass < 6; pass += 1) {
    let changed = false;
    for (const [rel, f] of facts) {
      if (!f.imports.length && !f.reexports.length && !Object.keys(f.components).length) continue;
      const next = fns.carriersFromFacts(f.components, importedCarriers(rel));
      for (const re of f.reexports) {
        for (const name of carrying.get(re.from) ?? []) if (!re.names || re.names.includes(name)) next.add(name);
      }
      if (next.size !== (carrying.get(rel)?.size ?? 0)) changed = true;
      carrying.set(rel, next);
    }
    if (!changed) break;
  }
  return (source, rel) => {
    const own = facts.get(rel)?.components;
    const set = new Set(carrying.get(rel) ?? fns.carriersFromFacts(own ?? fns.componentFacts(source, rel), new Set()));
    for (const name of importedCarriers(rel)) set.add(name);
    return set;
  };
}

/** Build a resolver: (source, rel) → names that carry the menu in that file. */
export function buildCarryingResolver(
  root: string,
  rels: string[],
  fns: CensusFns,
): (source: string, rel: string) => ReadonlySet<string> {
  return resolverFromFacts(collectFacts(root, rels, fns).facts, fns);
}
