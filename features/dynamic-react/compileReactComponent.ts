/**
 * compileReactComponent — turn a string of JSX/TSX into a runnable React
 * component, using the SAME allowlist-scoped execution model as the dynamic
 * tool UI / prompt-app renderers (Babel transform → `new Function` with a
 * curated scope). This is the generic entry point for inline React code blocks
 * in chat / notes.
 *
 * Limitations (intentional, inherited from the allowlist model):
 *  - Only modules in `TOOL_RENDERER_IMPORTS_CONFIG` are importable (React hooks,
 *    lucide icons, `cn`, the curated `@/components/ui/*` set, MarkdownStream).
 *    Imports are stripped; deps come from scope. Unknown PascalCase identifiers
 *    fall back to a placeholder icon instead of crashing.
 *  - Runs IN the app's JS context (not an iframe). Appropriate for trusted /
 *    first-party generated code; do not feed it hostile third-party code.
 *
 * To widen what generated React can use, add an entry to the allowlist in
 * features/tool-call-visualization/dynamic/allowed-imports.ts — that is the one
 * extension point, shared by every consumer.
 */

import type { ComponentType } from "react";
import {
  buildToolRendererScope,
  patchScopeForMissingIdentifiers,
  getScopeFunctionParameters,
  TOOL_RENDERER_IMPORTS_CONFIG,
  detectReactCapabilities,
} from "@/features/tool-call-visualization/dynamic/allowed-imports";
import {
  loadBabelTransform,
  stripImports,
  replaceExportDefault,
  babelTransform,
} from "./compile-core";
import { createMatrxSdk } from "./sdk/matrxSdk";

/**
 * Every allowlisted import — the broadest scope. Prefer `detectReactCapabilities`
 * (demand-loaded) so heavy libs only chunk-in when referenced; this remains for
 * callers that explicitly want the full set.
 */
export function getReactBlockImports(): string[] {
  return TOOL_RENDERER_IMPORTS_CONFIG.map((c) => c.path);
}

/**
 * If the transformed code has no top-level `return` (i.e. the author defined a
 * component but never `export`ed it — common in chat-generated snippets), pick
 * the most likely component declaration and return it so `new Function` yields
 * a component. Prefers conventional names, else the last PascalCase declaration.
 */
function ensureComponentReturn(code: string): string {
  if (/(^|\n)\s*return\s/.test(code)) return code;

  const declRegex = /(?:function|const|let|var|class)\s+([A-Z][A-Za-z0-9_]*)/g;
  let match: RegExpExecArray | null;
  let last: string | null = null;
  let preferred: string | null = null;
  while ((match = declRegex.exec(code)) !== null) {
    last = match[1];
    if (/^(App|Main|Page|Component|Demo|Example|Root)$/.test(match[1])) {
      preferred = match[1];
    }
  }
  const name = preferred ?? last;
  return name ? `${code.trimEnd()}\nreturn ${name};` : code;
}

export interface CompileReactOptions {
  code: string;
  /** "jsx" → React preset only; anything else → React + TypeScript preset. */
  language?: "jsx" | "tsx";
}

export async function compileReactComponent({
  code,
  language = "tsx",
}: CompileReactOptions): Promise<ComponentType<Record<string, unknown>>> {
  await loadBabelTransform();

  // Detect needed capabilities from the ORIGINAL source (before imports are
  // stripped) so heavy libs (recharts/three/xlsx/react-pdf/…) only load — and
  // only chunk-in — when the block actually references them.
  const neededImports = detectReactCapabilities(code);

  let processed = stripImports(code);
  processed = babelTransform(processed, language, `react-block.${language}`);
  processed = replaceExportDefault(processed);
  processed = ensureComponentReturn(processed);

  const scope = await buildToolRendererScope(neededImports);
  // Expose the curated, RLS-safe data SDK to generated code as `matrx`.
  scope.matrx = createMatrxSdk();
  patchScopeForMissingIdentifiers(processed, scope);
  const { paramNames, paramValues } = getScopeFunctionParameters(scope);

  // eslint-disable-next-line no-new-func
  const factory = new Function(...paramNames, processed);
  const component = factory(...paramValues);

  if (typeof component !== "function") {
    throw new Error(
      `React block must resolve to a component function; got ${typeof component}. ` +
        "Define a component (e.g. `export default function App() { … }`).",
    );
  }

  return component as ComponentType<Record<string, unknown>>;
}
