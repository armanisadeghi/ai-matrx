/**
 * Shared React compile core — the generic primitive for turning a string of
 * JSX/TSX source into runnable JS, used by every dynamic-React consumer:
 *   - inline React code blocks in chat/notes (features/dynamic-react/ReactCodeBlock)
 *   - the agent-apps applet runtime (features/agent-apps/utils/compile-slot)
 *
 * It owns ONLY the source→source transform (strip imports, Babel JSX/TSX → JS,
 * normalize exports into a `return`) plus the lazy Babel loader. Scope/allowlist
 * construction lives in each consumer's scope module (e.g.
 * features/dynamic-react/toolRendererScope); execution (`new Function`) lives in
 * the consumer so it can inject its own scope.
 *
 * @babel/standalone is ~5.7 MB; it is dynamically imported on first use only.
 */

type BabelTransform = typeof import("@babel/standalone").transform;

let cachedBabelTransform: BabelTransform | null = null;
let inflightBabelLoad: Promise<BabelTransform> | null = null;

/** Lazy-load (and cache) the Babel transform. Always call before babelTransform. */
export async function loadBabelTransform(): Promise<BabelTransform> {
  if (cachedBabelTransform) return cachedBabelTransform;
  if (inflightBabelLoad) return inflightBabelLoad;

  inflightBabelLoad = import("@babel/standalone").then((mod) => {
    cachedBabelTransform = mod.transform;
    inflightBabelLoad = null;
    return mod.transform;
  });
  return inflightBabelLoad;
}

/**
 * Strip all import statements (deps are injected via scope) plus
 * "use client"/"use server" directives, which break `new Function()` script mode.
 */
export function stripImports(code: string): string {
  let result = code.replace(/^\s*["']use (client|server)["'];?\s*$/gm, "");

  // Single-line imports.
  result = result.replace(
    /^import\s[\s\S]*?from\s+['"][^'"]+['"]\s*;?\s*$/gm,
    "",
  );
  // Multiline / all import forms.
  result = result.replace(
    /import\s+(?:type\s+)?(?:\*\s+as\s+\w+|\w+(?:\s*,\s*\{[^}]*\})?|\{[^}]*\})\s+from\s+['"][^'"]+['"];?/gs,
    "",
  );
  // Side-effect imports.
  result = result.replace(/^import\s+['"][^'"]+['"];?\s*$/gm, "");

  return result;
}

/**
 * Strip `export` keywords and inject a trailing `return` so named/default
 * exports resolve inside `new Function()` (script mode, not module mode).
 */
export function replaceExportDefault(code: string): string {
  let result = code;

  if (/^export\s+default\s+/m.test(result)) {
    result = result.replace(/^export\s+default\s+/m, "return ");
    result = result.replace(/^export\s+\{[^}]+\}\s*;?\s*$/gm, "");
    return result;
  }

  let lastExportedName: string | null = null;

  result = result.replace(
    /^export\s+(const|let|var)\s+(\w+)/gm,
    (_match, keyword, name) => {
      lastExportedName = name;
      return `${keyword} ${name}`;
    },
  );
  result = result.replace(/^export\s+function\s+(\w+)/gm, (_match, name) => {
    lastExportedName = name;
    return `function ${name}`;
  });
  result = result.replace(/^export\s+class\s+(\w+)/gm, (_match, name) => {
    lastExportedName = name;
    return `class ${name}`;
  });
  result = result.replace(/^export\s+\{[^}]+\}\s*;?\s*$/gm, "");

  if (lastExportedName) {
    result = result.trimEnd() + `\nreturn ${lastExportedName};`;
  }

  return result;
}

/**
 * Babel transform JSX/TSX → plain JS. Synchronous — the caller must have
 * awaited `loadBabelTransform()` first (asserted here, not silently skipped).
 */
export function babelTransform(
  code: string,
  language: "tsx" | "jsx",
  filename = `dynamic-component.${language}`,
): string {
  if (!cachedBabelTransform) {
    throw new Error(
      "[dynamic-react] babelTransform invoked before loadBabelTransform() resolved. " +
        "Await loadBabelTransform() before any sync transform.",
    );
  }

  const presets: string[] = ["react"];
  if (language === "tsx") presets.push("typescript");

  const result = cachedBabelTransform(code, { presets, filename });
  if (!result.code) {
    throw new Error("Babel transform produced empty output");
  }
  return result.code;
}
