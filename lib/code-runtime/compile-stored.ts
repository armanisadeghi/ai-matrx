/**
 * compileStoredComponent — the web app's one call into
 * `@ai-matrx/code-runtime` for a single stored body (Applets, slots, DB tool
 * renderers, emit renderers, DB kind components). It adds only what is the
 * app's: the app's scope modules, and filing every unresolved name to the
 * Error Inspector under the caller's origin. Never throws: compiles run in
 * render, and an editor recompiles on every keystroke.
 */
import { compileSource, type UnresolvedImport } from "@ai-matrx/code-runtime";
import { captureUnresolvedImports } from "@/lib/diagnostics/captureUnresolvedImports";
import type { Json } from "@/types/database.types";
import { provideAppScopeModules } from "./app-scope";

export interface CompileStoredArgs {
  code: string;
  /** `tool:<name>`, `applet:<id>:slot:<s>`, `emit:<ref>`, `kind:<slug>`… — every gap is filed under it. */
  origin: string;
  /** Scope entries from the stored row (`allowed_imports`). */
  allowedImports?: string[] | Json | null;
  /** Host replacements by scope name (e.g. a runtime-aware MarkdownStream). */
  scopeOverrides?: Readonly<Record<string, unknown>>;
  /** Shadow fetch/eval/storage — ON for organization-authored code. */
  sandboxDangerousGlobals?: boolean;
}

export interface CompileStoredResult {
  Component: React.ComponentType<Record<string, unknown>> | null;
  error: string | null;
  unresolvedImports: UnresolvedImport[];
}

function entriesOf(value: CompileStoredArgs["allowedImports"]): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
}

export function compileStoredComponent({
  code,
  origin,
  allowedImports,
  scopeOverrides,
  sandboxDangerousGlobals,
}: CompileStoredArgs): CompileStoredResult {
  if (!code || !code.trim()) return { Component: null, error: null, unresolvedImports: [] };
  provideAppScopeModules();
  const result = compileSource(
    code,
    {
      entries: entriesOf(allowedImports),
      shadowDangerousGlobals: sandboxDangerousGlobals === true,
      ...(scopeOverrides ? { overrides: { ...scopeOverrides } } : {}),
    },
    { origin, onUnresolved: captureUnresolvedImports },
  );
  return result.ok
    ? { Component: result.Component, error: null, unresolvedImports: result.unresolvedImports }
    : { Component: null, error: result.error.message, unresolvedImports: [] };
}
