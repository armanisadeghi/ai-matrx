/**
 * The settings tab host gates a tab on the load of the person's saved
 * preferences only when the tab is flagged `readsUserPreferences`. A flag that
 * drifts from the code puts defaults back on screen as the person's settings
 * (or blocks a tab that never needed them). So the flag is DERIVED here from
 * each tab component's source: it reads preferences when it names a
 * `"userPreferences.…"` setting path, touches `<x>.userPreferences`, or
 * imports the preferences slice or its selectors.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "../../..");
const REGISTRY = path.join(ROOT, "features/settings/registry.ts");

function resolveModule(spec: string, fromFile: string): string | null {
  const base = spec.startsWith("@/")
    ? path.join(ROOT, spec.slice(2))
    : spec.startsWith(".")
      ? path.resolve(path.dirname(fromFile), spec)
      : null;
  if (!base) return null;
  for (const c of [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export function sourceReadsUserPreferences(source: string, fileName = "tab.tsx"): boolean {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let hit = false;
  const visit = (n: ts.Node) => {
    if (hit) return;
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && n.text.startsWith("userPreferences.")) {
      const parent = n.parent;
      const isImportPath = parent && ts.isImportDeclaration(parent);
      if (!isImportPath) hit = true;
    } else if (ts.isPropertyAccessExpression(n) && n.name.text === "userPreferences") {
      hit = true;
    } else if (
      ts.isImportDeclaration(n) &&
      ts.isStringLiteral(n.moduleSpecifier) &&
      /preferences\/(?:userPreferencesSlice|userPreferenceSelectors)$/.test(n.moduleSpecifier.text) &&
      !n.importClause?.isTypeOnly
    ) {
      hit = true;
    }
    n.forEachChild(visit);
  };
  visit(sf);
  return hit;
}

/** { tab id → { component identifier, flag } } straight from the registry source. */
function registryEntries(): { id: string; component: string; flagged: boolean }[] {
  const src = fs.readFileSync(REGISTRY, "utf8");
  const sf = ts.createSourceFile(REGISTRY, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: { id: string; component: string; flagged: boolean }[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isObjectLiteralExpression(n)) {
      const prop = (name: string) =>
        n.properties.find(
          (p): p is ts.PropertyAssignment =>
            ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === name,
        );
      const id = prop("id");
      const component = prop("component");
      if (id && component && ts.isStringLiteral(id.initializer) && ts.isIdentifier(component.initializer)) {
        const flag = prop("readsUserPreferences");
        out.push({
          id: id.initializer.text,
          component: component.initializer.text,
          flagged: flag?.initializer.kind === ts.SyntaxKind.TrueKeyword,
        });
      }
    }
    n.forEachChild(visit);
  };
  visit(sf);
  return out;
}

/** identifier → file, for the registry's default and named imports. */
function registryImports(): Map<string, string> {
  const src = fs.readFileSync(REGISTRY, "utf8");
  const sf = ts.createSourceFile(REGISTRY, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const map = new Map<string, string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || !st.importClause) continue;
    const file = resolveModule(st.moduleSpecifier.text, REGISTRY);
    if (!file) continue;
    if (st.importClause.name) map.set(st.importClause.name.text, file);
    const nb = st.importClause.namedBindings;
    if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) map.set(el.name.text, file);
  }
  return map;
}

describe("settings registry: readsUserPreferences matches what each tab reads", () => {
  it("the detector sees a real read and ignores a comment", () => {
    expect(sourceReadsUserPreferences(`const [v] = useSetting("userPreferences.voice.language");`)).toBe(true);
    expect(sourceReadsUserPreferences(`const v = useSelector((s) => s.userPreferences.system);`)).toBe(true);
    expect(sourceReadsUserPreferences(`// each saving to \`userPreferences.flashcard.*\`\nexport default function T() { return null; }`)).toBe(false);
  });

  it("every tab that reads the person's preferences is gated, and no other tab is", () => {
    const imports = registryImports();
    const entries = registryEntries();
    expect(entries.length).toBeGreaterThan(20);
    const unresolved: string[] = [];
    const mismatches: string[] = [];
    for (const e of entries) {
      const file = imports.get(e.component);
      if (!file) {
        unresolved.push(`${e.id} (${e.component})`);
        continue;
      }
      const reads = sourceReadsUserPreferences(fs.readFileSync(file, "utf8"), file);
      if (reads !== e.flagged) {
        mismatches.push(
          `${e.id}: component ${e.component} ${reads ? "READS" : "does not read"} userPreferences but readsUserPreferences is ${e.flagged}`,
        );
      }
    }
    expect(unresolved).toEqual([]);
    expect(mismatches).toEqual([]);
  });
});
