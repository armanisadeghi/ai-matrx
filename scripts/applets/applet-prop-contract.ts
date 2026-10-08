/**
 * applet-prop-contract — type-checks every stored Applet file's use of the PACKAGE components it imports.
 *
 * A first-paint render cannot reach a page that is still loading its rows, so a control given the wrong prop
 * (`<SegmentedControl options=…>` where the contract is `data`) passed the render sweep and crashed the whole
 * /applets/build route the moment the rows arrived (2026-10-08, `Cannot read properties of undefined (reading 'map')`).
 * The installed package types ARE the runtime contract for these modules, so the compiler answers it exactly.
 *
 * Only diagnostics INSIDE a JSX element (or a call) whose name is imported from one of `CONTRACT_MODULES` count —
 * `@/…` imports run through the stored-scope shim, whose bindings the repo's own files do not describe.
 * Pure: `propContractFindings(rows)` → findings; no network, no writes. Used by applet-render-sweep.ts.
 */
import { resolve } from "node:path";
import ts from "typescript";

export const CONTRACT_MODULES = ["@ai-matrx/design-system/controls", "@ai-matrx/applets/react"] as const;

/**
 * The contract codes: not assignable · missing required prop(s) · unknown prop on a literal · no overload · no such export.
 * Null-safety findings (18048, 2532…) are the Applet's own logic, not the package contract.
 */
const CONTRACT_CODES = new Set([2322, 2741, 2739, 2740, 2559, 2353, 2769, 2305, 2724, 2345]);
/**
 * Applet code is plain JSX (no annotations), so inference widens or narrows values the compiler cannot judge:
 * a plain `string`/`any`, a row cell (`{}` / `unknown`), `useState(null)`'s `SetStateAction<null>`. Runtime decides those.
 */
const UNJUDGEABLE = [/^(Argument of type|Type) '(string|any|number|\{\})' is not assignable/, /SetStateAction<null>/, /\bunknown\b/];

export interface PropContractFinding {
  slug: string;
  file: string;
  line: number;
  component: string;
  message: string;
}

const COMPILER_OPTIONS: ts.CompilerOptions = {
  jsx: ts.JsxEmit.ReactJSX,
  strict: false,
  // Discriminated unions (`made.ok ? made.data : made.error`) only narrow with null checks on.
  strictNullChecks: true,
  noImplicitAny: false,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: true,
  noEmit: true,
  allowJs: true,
  esModuleInterop: true,
  types: [],
};

/** Local name → module, for every named/default import from a contract module in this file. */
function contractImports(sf: ts.SourceFile): Map<string, string> {
  const out = new Map<string, string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const mod = st.moduleSpecifier.text;
    if (!(CONTRACT_MODULES as readonly string[]).includes(mod)) continue;
    const clause = st.importClause;
    if (clause?.name) out.set(clause.name.text, mod);
    const named = clause?.namedBindings;
    if (named && ts.isNamedImports(named)) for (const el of named.elements) out.set(el.name.text, mod);
  }
  return out;
}

function enclosingContractUse(sf: ts.SourceFile, pos: number, imports: Map<string, string>): string | null {
  let found: string | null = null;
  const visit = (node: ts.Node): void => {
    if (pos < node.getStart(sf) || pos >= node.getEnd()) return;
    // An import from a contract module naming something it does not export (`WritingBox` from controls).
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && (CONTRACT_MODULES as readonly string[]).includes(node.moduleSpecifier.text)) {
      found = `import from ${node.moduleSpecifier.text}`;
      return;
    }
    let name: string | null = null;
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) name = node.tagName.getText(sf);
    else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) name = node.expression.text;
    if (name && imports.has(name.split(".")[0] ?? name)) found = name;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

export function propContractFindings(rows: readonly { slug: string; files: Record<string, string> | null }[], cwd = process.cwd()): PropContractFinding[] {
  const root = resolve(cwd, ".applet-prop-contract");
  const mem = new Map<string, { slug: string; file: string; source: string }>();
  for (const row of rows) {
    for (const [file, source] of Object.entries(row.files ?? {})) {
      if (/\.(t|j)sx?$/.test(file)) mem.set(`${root}/${row.slug}/${file}`, { slug: row.slug, file, source });
    }
  }
  const host = ts.createCompilerHost(COMPILER_OPTIONS);
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);
  host.getSourceFile = (name, lang, ...rest) => {
    const m = mem.get(name);
    return m ? ts.createSourceFile(name, m.source, lang, true, /x$/.test(name) ? ts.ScriptKind.TSX : ts.ScriptKind.TS) : getSourceFile(name, lang, ...rest);
  };
  host.fileExists = (name) => mem.has(name) || fileExists(name);
  host.readFile = (name) => mem.get(name)?.source ?? readFile(name);
  const program = ts.createProgram([...mem.keys()], COMPILER_OPTIONS, host);
  const out: PropContractFinding[] = [];
  for (const [path, m] of mem) {
    const sf = program.getSourceFile(path);
    if (!sf) continue;
    const imports = contractImports(sf);
    if (!imports.size) continue;
    for (const d of program.getSemanticDiagnostics(sf)) {
      if (d.start === undefined || !CONTRACT_CODES.has(d.code)) continue;
      const text = ts.flattenDiagnosticMessageText(d.messageText, " ");
      if (UNJUDGEABLE.some((re) => re.test(text))) continue;
      const component = enclosingContractUse(sf, d.start, imports);
      if (!component) continue;
      out.push({ slug: m.slug, file: m.file, line: sf.getLineAndCharacterOfPosition(d.start).line + 1, component, message: text.slice(0, 300) });
    }
  }
  return out;
}
