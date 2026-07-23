/**
 * Shared scope patching for Babel-sandboxed components (Agent Apps, tool UI).
 *
 * Only JSX component references (first arg to createElement/jsx/jsxs) are
 * patched — not function names like `function ShellRenderer`, constants, or
 * other PascalCase tokens that appear in transformed source.
 */
import React from "react";

export function createFallbackIcon(iconName: string) {
  const FallbackIcon = React.forwardRef<
    SVGSVGElement,
    React.SVGProps<SVGSVGElement> & { size?: number | string }
  >(({ size = 24, className, ...props }, ref) => {
    return React.createElement(
      "svg",
      {
        ref,
        xmlns: "http://www.w3.org/2000/svg",
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        className,
        "data-missing-icon": iconName,
        ...props,
      },
      React.createElement("circle", { cx: 12, cy: 12, r: 10 }),
      React.createElement("path", {
        d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3",
      }),
      React.createElement("line", { x1: 12, y1: 17, x2: 12.01, y2: 17 }),
    );
  });
  FallbackIcon.displayName = `MissingIcon(${iconName})`;
  return FallbackIcon;
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
export function collectTopLevelBindingsPlugin(sink: Set<string>) {
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
            }
          },
        },
      },
    };
  };
}

export interface PatchScopeOptions {
  /** Console prefix, e.g. `[AgentApp]` or `[DynamicReact]`. Omit to stay silent. */
  logPrefix?: string;
  /**
   * Identifiers the author declares at the top level of the sandbox source (from
   * `collectTopLevelBindingsPlugin`). We must NOT inject a fallback for any of
   * these — the author's own declaration provides the value, and injecting one
   * would both waste work and emit a misleading "unknown JSX component" warning.
   */
  declaredIdentifiers?: Set<string>;
}

/**
 * Adds fallback components for JSX references not present in the execution scope.
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
          provided = true;
          break;
        }
      }
      if (provided) continue;
    }

    if (options?.logPrefix) {
      console.warn(
        `${options.logPrefix} Unknown JSX component "${identifier}" in sandboxed code. Injecting fallback.`,
      );
    }
    scope[identifier] = createFallbackIcon(identifier);
  }
}
