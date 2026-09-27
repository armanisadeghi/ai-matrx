/**
 * A settings screen that reads the person's saved `userPreferences` must not
 * render the built-in defaults as their settings while those preferences are
 * loading or failed to load. Each tab gates ONLY the section that reads them,
 * with `<PreferencesLoadGate>` — never the whole tab, so a failed load never
 * hides the tab's unrelated settings (the tab host gates nothing).
 *
 * The obligation is DERIVED here from each registered tab's source: a tab
 * reads preferences when it names a `"userPreferences.…"` setting path,
 * touches `<x>.userPreferences`, or imports the preferences slice or its
 * selectors at runtime. Every such tab must render the gate.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "../../..");
const REGISTRY = path.join(ROOT, "features/settings/registry.ts");
/** Every file that declares SettingsTabDef literals the tab host renders. */
const TAB_DEF_FILES = [
  REGISTRY,
  // The settings route's index tab (FIRST_SCREEN_TAB), rendered through the same host.
  path.join(ROOT, "features/settings/tabs/FirstScreenTab.tsx"),
];

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

function parse(source: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

export function sourceReadsUserPreferences(source: string, fileName = "tab.tsx"): boolean {
  let hit = false;
  const visit = (n: ts.Node) => {
    if (hit) return;
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && n.text.startsWith("userPreferences.")) {
      if (!(n.parent && ts.isImportDeclaration(n.parent))) hit = true;
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
  visit(parse(source, fileName));
  return hit;
}

/** Does the source render `<PreferencesLoadGate>` (or gate itself with `usePreferencesLoad`)? */
export function sourceGatesPreferences(source: string, fileName = "tab.tsx"): boolean {
  let hit = false;
  const visit = (n: ts.Node) => {
    if (hit) return;
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && n.tagName.getText() === "PreferencesLoadGate") hit = true;
    else if (ts.isCallExpression(n) && n.expression.getText() === "usePreferencesLoad") hit = true;
    n.forEachChild(visit);
  };
  visit(parse(source, fileName));
  return hit;
}

function tabEntries(file: string): { id: string; component: string }[] {
  const out: { id: string; component: string }[] = [];
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
        out.push({ id: id.initializer.text, component: component.initializer.text });
      }
    }
    n.forEachChild(visit);
  };
  visit(parse(fs.readFileSync(file, "utf8"), file));
  return out;
}

/** identifier → file: the file's default and named imports, and components it declares itself. */
function componentFiles(file: string): Map<string, string> {
  const sf = parse(fs.readFileSync(file, "utf8"), file);
  const map = new Map<string, string>();
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) map.set(st.name.text, file);
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || !st.importClause) continue;
    const target = resolveModule(st.moduleSpecifier.text, file);
    if (!target) continue;
    if (st.importClause.name) map.set(st.importClause.name.text, target);
    const nb = st.importClause.namedBindings;
    if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) map.set(el.name.text, target);
  }
  return map;
}

describe("settings tabs: every section over saved preferences is gated on their load", () => {
  it("the detectors see a real read / gate and ignore a comment", () => {
    expect(sourceReadsUserPreferences(`const [v] = useSetting("userPreferences.voice.language");`)).toBe(true);
    expect(sourceReadsUserPreferences(`const v = useSelector((s) => s.userPreferences.system);`)).toBe(true);
    expect(sourceReadsUserPreferences(`// each saving to \`userPreferences.flashcard.*\`\nexport default function T() { return null; }`)).toBe(false);
    expect(sourceGatesPreferences(`const x = <PreferencesLoadGate what="a"><p /></PreferencesLoadGate>;`)).toBe(true);
    expect(sourceGatesPreferences(`// <PreferencesLoadGate>\nconst x = <p />;`)).toBe(false);
  });

  it("every tab that reads the person's preferences renders PreferencesLoadGate", () => {
    const entries = TAB_DEF_FILES.flatMap((defFile) => {
      const files = componentFiles(defFile);
      return tabEntries(defFile).map((e) => ({ ...e, file: files.get(e.component) }));
    });
    expect(entries.length).toBeGreaterThan(20);
    expect(entries.some((e) => e.id === "firstScreen")).toBe(true);
    const unresolved = entries.filter((e) => !e.file).map((e) => `${e.id} (${e.component})`);
    expect(unresolved).toEqual([]);
    const resolved = entries.flatMap((e) => (e.file ? [{ id: e.id, file: e.file }] : []));
    const readers = resolved.filter((e) => sourceReadsUserPreferences(fs.readFileSync(e.file, "utf8"), e.file));
    expect(readers.length).toBeGreaterThan(10);
    const ungated = readers
      .filter((e) => !sourceGatesPreferences(fs.readFileSync(e.file, "utf8"), e.file))
      .map((e) => `${e.id}: ${path.relative(ROOT, e.file)} reads userPreferences with no <PreferencesLoadGate>`);
    expect(ungated).toEqual([]);
  });

  it("the tab host never gates a whole tab", () => {
    const host = fs.readFileSync(path.join(ROOT, "features/settings/components/SettingsTabHost.tsx"), "utf8");
    expect(sourceGatesPreferences(host)).toBe(false);
  });
});
