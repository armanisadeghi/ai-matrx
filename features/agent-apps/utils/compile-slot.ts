/**
 * compile-slot — Babel-sandbox compilation for Tier-2 slot overrides and
 * Tier-3 fully-custom apps.
 *
 * Extracted from the original logic in AgentAppPublicRendererImpl so the
 * renderer, the slot system, and the code-tab live preview can share a
 * single compile path. Compiled components run inside the same allowed-
 * imports scope (`buildComponentScope`); identifiers we never registered
 * fall back to the safe-icon proxy via `patchScopeForMissingIdentifiers`.
 *
 * Returns a stable shape: either `{ Component }` on success or
 * `{ error }` on failure. The renderer is responsible for surfacing the
 * error inline; throwing here would cascade up through React's error
 * boundary on every keystroke in the editor.
 */
import { transform } from "@babel/standalone";
import {
  buildComponentScope,
  getScopeFunctionParameters,
  patchScopeForMissingIdentifiers,
} from "./allowed-imports";
import type { Json } from "@/types/database.types";

export interface CompileSlotArgs {
  /** Raw TSX/JSX source authored by the app builder. */
  code: string;
  /** Allowed imports from the app row (or a tier default). */
  allowedImports?: string[] | Json | null;
}

export interface CompileSlotResult {
  Component: React.ComponentType<Record<string, unknown>> | null;
  error: string | null;
}

export function compileSlotComponent({
  code,
  allowedImports,
}: CompileSlotArgs): CompileSlotResult {
  if (!code || !code.trim()) {
    return { Component: null, error: null };
  }

  try {
    // Strip user-authored `import` lines. Imports come from the allow-listed
    // scope — declaring them in source is a habit but not honoured here.
    const stripped = code.replace(
      /import\s+.*?from\s+['"].*?['"];?\s*/g,
      "",
    );

    const babelResult = transform(stripped, {
      presets: ["react", "typescript"],
      filename: "slot.tsx",
    });

    let transformed = babelResult.code || "";
    transformed = transformed.replace(/export\s+default\s+/g, "return ");

    const scope = buildComponentScope(allowedImports ?? []);
    if (transformed) patchScopeForMissingIdentifiers(transformed, scope);

    const { paramNames, paramValues } = getScopeFunctionParameters(scope);
    const factory = new Function(...paramNames, transformed);
    const Component = factory(...paramValues) as React.ComponentType<
      Record<string, unknown>
    > | null;

    return { Component, error: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown compile error";
    return { Component: null, error: message };
  }
}
