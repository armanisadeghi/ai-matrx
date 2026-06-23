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

export interface PatchScopeOptions {
  /** Console prefix, e.g. `[AgentApp]` or `[DynamicReact]`. Omit to stay silent. */
  logPrefix?: string;
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
