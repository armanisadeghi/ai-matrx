/**
 * Shared scope patching for Babel-sandboxed components (Agent Apps, tool UI).
 *
 * Only JSX component references (first arg to createElement/jsx/jsxs) are
 * patched — not function names like `function ShellRenderer`, constants, or
 * other PascalCase tokens that appear in transformed source.
 */
import React from "react";

/**
 * One name the sandboxed source referenced that nothing could supply — an
 * import whose module is not allowlisted for this component, an export the
 * module does not have, or a JSX tag no scope entry defines.
 * `importPath` is null for a bare JSX reference with no import behind it.
 */
export interface UnresolvedImport {
  identifier: string;
  importPath: string | null;
}

const UNRESOLVED_IMPORT_MARK = Symbol.for("matrx.sandbox.unresolvedImport");
const UNRESOLVED_LIST_KEY = "__unresolvedImports";

/** The stand-in's own record, or null when `value` is a real binding. */
export function readUnresolvedImportMark(
  value: unknown,
): UnresolvedImport | null {
  if (!value || (typeof value !== "object" && typeof value !== "function")) {
    return null;
  }
  const mark = (value as Record<symbol, unknown>)[UNRESOLVED_IMPORT_MARK];
  return mark && typeof mark === "object" ? (mark as UnresolvedImport) : null;
}

/**
 * Record an unresolved name on the scope being built. Every stand-in site
 * calls this, so the compiler can report the whole list once with the
 * tool / app / kind it is compiling (`collectUnresolvedImports`).
 */
export function recordUnresolvedImport(
  scope: Record<string, any>,
  entry: UnresolvedImport,
): void {
  const list = (scope[UNRESOLVED_LIST_KEY] ??= []) as UnresolvedImport[];
  if (
    !list.some(
      (e) =>
        e.identifier === entry.identifier && e.importPath === entry.importPath,
    )
  ) {
    list.push(entry);
  }
}

/** Every unresolved name recorded while building this scope, deduped. */
export function collectUnresolvedImports(
  scope: Record<string, any>,
): UnresolvedImport[] {
  return [...((scope[UNRESOLVED_LIST_KEY] ?? []) as UnresolvedImport[])];
}

/**
 * NOTHING FAILS SILENTLY (Law 4). Stored component code that names something
 * the sandbox cannot supply still renders — one bad import must not blank a
 * whole tool display — but the gap is SHOWN where it sits: a compact dashed
 * destructive chip carrying the missing name (tooltip: the import path), with
 * the element's children rendered after it so wrapped content is not lost.
 * It replaced a neutral question-mark glyph sized like an icon, which read as
 * a real icon and told nobody anything (2026-10-01).
 *
 * The author's `className` / `size` are deliberately ignored: they were
 * written for the real component, and an `h-4 w-4` would clip the name.
 * Reporting to the error queue is the compiler's job (it knows the origin);
 * this only renders.
 */
export function createUnresolvedImportStandIn(
  identifier: string,
  importPath: string | null = null,
) {
  const tip = importPath
    ? `Not found: ${identifier} in "${importPath}"`
    : `Not found: ${identifier}`;
  const StandIn = React.forwardRef<
    HTMLSpanElement,
    { children?: React.ReactNode }
  >(({ children }, ref) => {
    const chip = React.createElement(
      "span",
      {
        ref,
        title: tip,
        "aria-label": tip,
        role: "note",
        "data-unresolved-import": identifier,
        "data-import-path": importPath ?? undefined,
        className:
          "inline-flex items-center gap-0.5 rounded border border-dashed border-destructive/60 px-1 align-middle font-mono text-[10px] leading-4 text-destructive",
      },
      React.createElement(
        "svg",
        {
          width: 10,
          height: 10,
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 2.5,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": true,
        },
        React.createElement("path", {
          d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
        }),
        React.createElement("line", { x1: 12, y1: 9, x2: 12, y2: 13 }),
        React.createElement("line", { x1: 12, y1: 17, x2: 12.01, y2: 17 }),
      ),
      identifier,
    );
    return children == null
      ? chip
      : React.createElement(React.Fragment, null, chip, children);
  });
  StandIn.displayName = `UnresolvedImport(${identifier})`;
  Object.defineProperty(StandIn, UNRESOLVED_IMPORT_MARK, {
    value: { identifier, importPath } satisfies UnresolvedImport,
    enumerable: false,
  });
  return StandIn;
}

export function stripLiteralsForScan(code: string): string {
  return code
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/gs, "``");
}

/** PascalCase identifiers used as JSX components after Babel transform. */
export function extractJsxComponentIdentifiers(
  codeForScanning: string,
): Set<string> {
  const components = new Set<string>();
  const patterns = [
    /React\.createElement\s*\(\s*([A-Z][a-zA-Z0-9]*)/g,
    /\bjsx\s*\(\s*([A-Z][a-zA-Z0-9]*)/g,
    /\bjsxs\s*\(\s*([A-Z][a-zA-Z0-9]*)/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(codeForScanning)) !== null) {
      components.add(match[1]);
    }
  }

  return components;
}

const PATCH_SCOPE_SKIP_IDENTIFIERS = new Set([
  "React",
  "Object",
  "Array",
  "String",
  "Number",
  "Boolean",
  "Date",
  "Math",
  "JSON",
  "Promise",
  "Error",
  "TypeError",
  "RangeError",
  "RegExp",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Symbol",
  "Proxy",
  "Reflect",
  "Intl",
  "URL",
  "FormData",
  "Headers",
  "Request",
  "Response",
  "AbortController",
  "HTMLElement",
  "SVGElement",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLSelectElement",
  "HTMLButtonElement",
  "HTMLDivElement",
  "HTMLFormElement",
  "Node",
  "Element",
  "Document",
  "Window",
  "Infinity",
  "NaN",
  "Fragment",
]);

/**
 * Babel plugin factory — records every TOP-LEVEL binding name the author
 * declares (`const` / `let` / `var` / `class` / `function`) into `sink`.
 *
 * These are exactly the identifiers that would throw
 * `SyntaxError: Identifier 'X' has already been declared` if the sandbox also
 * injected them as `new Function` parameters: a parameter plus a top-level
 * lexical (`const`/`let`/`class`) binding of the same name is an illegal
 * redeclaration. Compile paths pass this set to `getScopeFunctionParameters`
 * (to drop those params) and to `patchScopeForMissingIdentifiers` (to skip
 * fallback injection), so an author's own declaration cleanly SHADOWS the
 * injected scope instead of colliding with it.
 *
 * Import bindings (`kind === "module"`) and function params (`kind === "param"`)
 * are excluded — imports are stripped from the body and re-supplied via scope,
 * and params never appear at the Program top level.
 *
 * Must run in the SAME Babel pass as the still-valid source (before any
 * `export default → return` rewrite), so the AST parses and scope analysis is
 * accurate. Relies on Babel's own binding table — robust against destructuring,
 * multiple declarators, and comments/strings that would fool a regex.
 */
interface BabelBindingLike {
  kind?: string;
}
interface BabelProgramPathLike {
  scope: { bindings: Record<string, BabelBindingLike> };
}
/**
 * Returns a Babel PLUGIN FACTORY (an uncalled function, matching how
 * `@babel/standalone` types every `plugins[]` entry) closed over `sink`. Add it
 * to the `plugins` array of the same `transform` call that produces the sandbox
 * body: `plugins: [otherPlugin, collectTopLevelBindingsPlugin(sink)]`.
 */
export function collectTopLevelBindingsPlugin(
  sink: Set<string>,
  /**
   * Optional second sink: top-level PascalCase bindings, in declaration
   * order — the component candidates for a source with NO `export default`.
   * The kind-component authoring contract's own example is a bare top-level
   * `function Card({ data }) {…}` (see `component_source_lint` in
   * matrx-ai's `kind_shared.py`), and the Workflow Studio's compiler has
   * always accepted it. Without this, such a source compiles to a factory
   * that returns nothing and the caller reports "compile produced no
   * component" — the component is written, stored, paid for, and never
   * renders. Optional so every existing caller is unaffected.
   */
  componentCandidates?: string[],
) {
  return function collectTopLevelBindings() {
    return {
      name: "collect-top-level-bindings",
      visitor: {
        Program: {
          exit(path: BabelProgramPathLike) {
            const bindings = path.scope.bindings;
            for (const name of Object.keys(bindings)) {
              const kind = bindings[name]?.kind;
              if (kind === "module" || kind === "param") continue;
              sink.add(name);
              if (componentCandidates && /^[A-Z]/.test(name)) {
                componentCandidates.push(name);
              }
            }
          },
        },
      },
    };
  };
}

export interface PatchScopeOptions {
  /**
   * Identifiers the author declares at the top level of the sandbox source (from
   * `collectTopLevelBindingsPlugin`). We must NOT inject a fallback for any of
   * these — the author's own declaration provides the value, and injecting one
   * would both waste work and emit a misleading "unknown JSX component" warning.
   */
  declaredIdentifiers?: Set<string>;
}

/**
 * Adds a visible unresolved-import stand-in for every JSX reference the
 * execution scope does not define, and records each one on the scope
 * (`collectUnresolvedImports`) so the compiler can report it.
 */
export function patchScopeForMissingIdentifiers(
  code: string,
  scope: Record<string, any>,
  options?: PatchScopeOptions,
): void {
  const codeForScanning = stripLiteralsForScan(code);
  const jsxComponents = extractJsxComponentIdentifiers(codeForScanning);

  const safeProxies = scope.__safeProxies as
    | Record<string, Record<string, any>>
    | undefined;
  const moduleKeysByPath = scope.__safeProxyModuleKeys as
    | Record<string, Set<string>>
    | undefined;

  for (const identifier of jsxComponents) {
    if (PATCH_SCOPE_SKIP_IDENTIFIERS.has(identifier)) continue;
    if (identifier in scope) continue;
    // The author declared this at the top level — their binding wins. Injecting
    // a fallback here is what collided with their `const/let/class <Name>` and
    // produced "Identifier 'X' has already been declared".
    if (options?.declaredIdentifiers?.has(identifier)) continue;

    if (safeProxies) {
      let provided = false;
      for (const [path, proxy] of Object.entries(safeProxies)) {
        const moduleKeys = moduleKeysByPath?.[path];
        if (moduleKeys && !moduleKeys.has(identifier)) {
          continue;
        }

        const value = proxy[identifier];
        if (value !== undefined) {
          scope[identifier] = value;
          const mark = readUnresolvedImportMark(value);
          if (mark) recordUnresolvedImport(scope, mark);
          provided = true;
          break;
        }
      }
      if (provided) continue;
    }

    scope[identifier] = createUnresolvedImportStandIn(identifier);
    recordUnresolvedImport(scope, { identifier, importPath: null });
  }
}
