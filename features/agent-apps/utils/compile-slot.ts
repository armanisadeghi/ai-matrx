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
  bindImportedIdentifiers,
  buildComponentScope,
  getScopeFunctionParameters,
  patchScopeForMissingIdentifiers,
  type SandboxImportBinding,
} from "./allowed-imports";
import { collectTopLevelBindingsPlugin } from "./patch-scope-identifiers";
import type { Json } from "@/types/database.types";

export interface CompileSlotArgs {
  /** Raw TSX/JSX source authored by the app builder. */
  code: string;
  /** Allowed imports from the app row (or a tier default). */
  allowedImports?: string[] | Json | null;
  /**
   * Host-owned replacements for allowlisted scope entries. This is the seam
   * for runtime-aware primitives (for example, Agent Apps supplies a
   * MarkdownStream that carries the live request identity automatically).
   */
  scopeOverrides?: Readonly<Record<string, unknown>>;
}

export interface CompileSlotResult {
  Component: React.ComponentType<Record<string, unknown>> | null;
  error: string | null;
}

interface ImportDeclarationPathLike {
  node: {
    importKind?: string;
    source: { value: string };
    specifiers: Array<{
      type: string;
      local: { name: string };
      importKind?: string;
      imported?: { name?: string; value?: string };
    }>;
  };
  remove(): void;
}

/**
 * Runtime imports are supplied by the allowlisted scope, not by the module
 * loader. Remove import declarations at the AST boundary so multiline,
 * aliased, type-only, and side-effect imports all follow the same rule — but
 * RECORD every value specifier first: the local name the author writes is not
 * always the canonical scope name, and a local nothing defines is a
 * ReferenceError the moment the factory runs (THE IMPORT-BINDING CONTRACT in
 * allowed-imports.ts). Type-only imports carry no runtime value and are
 * dropped without a binding.
 */
function collectAndStripImportDeclarationsPlugin(
  sink: SandboxImportBinding[],
) {
  return function collectAndStripImportDeclarations() {
    return {
      name: "collect-and-strip-sandbox-import-declarations",
      visitor: {
        ImportDeclaration(path: ImportDeclarationPathLike) {
          const { node } = path;
          if (node.importKind !== "type") {
            const source = node.source?.value ?? "";
            for (const specifier of node.specifiers ?? []) {
              if (specifier.importKind === "type") continue;
              const local = specifier.local?.name;
              if (!local) continue;
              if (specifier.type === "ImportNamespaceSpecifier") {
                sink.push({ local, source, imported: "*" });
              } else if (specifier.type === "ImportDefaultSpecifier") {
                sink.push({ local, source, imported: "default" });
              } else {
                sink.push({
                  local,
                  source,
                  imported:
                    specifier.imported?.name ??
                    specifier.imported?.value ??
                    local,
                });
              }
            }
          }
          path.remove();
        },
      },
    };
  };
}

export function compileSlotComponent({
  code,
  allowedImports,
  scopeOverrides,
}: CompileSlotArgs): CompileSlotResult {
  if (!code || !code.trim()) {
    return { Component: null, error: null };
  }

  try {
    // Collect the author's top-level declarations during the transform so we can
    // keep them OUT of the `new Function` parameter list — a param that collides
    // with a top-level `const`/`let`/`class` of the same name is a hard
    // SyntaxError ("Identifier 'X' has already been declared"). Runs in the same
    // pass, before the export→return rewrite, so the AST is still valid.
    const declaredTopLevel = new Set<string>();
    const componentCandidates: string[] = [];
    const importBindings: SandboxImportBinding[] = [];
    const babelResult = transform(code, {
      presets: ["react", "typescript"],
      plugins: [
        collectAndStripImportDeclarationsPlugin(importBindings),
        collectTopLevelBindingsPlugin(declaredTopLevel, componentCandidates),
      ],
      filename: "slot.tsx",
    });

    let transformed = babelResult.code || "";
    if (/export\s+default\s+/.test(transformed)) {
      transformed = transformed.replace(/export\s+default\s+/g, "return ");
    } else {
      // No default export. The kind-component authoring contract's own
      // documented example is a bare top-level `function Card({ data }) {…}`
      // (matrx-ai `component_source_lint`), and the Workflow Studio's
      // compiler — an explicit PORT of this one — has always accepted it. So
      // do the same: return the LAST top-level PascalCase binding (the
      // studio's rule, kept identical on purpose). Without this the factory
      // returns nothing and the caller reports "compile produced no
      // component": a stored, paid-for component that silently never renders.
      const candidate = componentCandidates[componentCandidates.length - 1];
      if (candidate) transformed = `${transformed}\nreturn ${candidate};`;
    }

    const scope = buildComponentScope(allowedImports ?? []);
    // Bind the author's own local names BEFORE host overrides, so a host-owned
    // replacement (e.g. the runtime-aware MarkdownStream) still wins.
    bindImportedIdentifiers(importBindings, scope, declaredTopLevel);
    Object.assign(scope, scopeOverrides);
    if (transformed)
      patchScopeForMissingIdentifiers(transformed, scope, declaredTopLevel);

    const { paramNames, paramValues } = getScopeFunctionParameters(
      scope,
      declaredTopLevel,
    );
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
