/**
 * transform-kind-body — the PARENT half of the sandbox compile.
 *
 * THE SPLIT, and why it exists (DD-123 plan §1.4): `@babel/standalone` is
 * ~3 MB and its `transform` is pure string → string; it executes nothing. So
 * Babel stays in the page, the frame only gets `new Function`. One compiler,
 * one Babel, and 3 MB that never crosses into the frame bundle.
 *
 * This module reuses the EXACT plugins `compile-slot.ts` uses — it does not
 * fork them — so the sandboxed transform and the in-page transform can never
 * drift. What it does not do is build the scope or evaluate anything: that is
 * `runtime/execute-kind-body.ts`, inside the frame.
 *
 * Nothing here changes the app path. `compileSlotComponent` is untouched.
 */
import { transform } from "@babel/standalone";
import { collectAndStripImportDeclarationsPlugin } from "@/features/agent-apps/utils/compile-slot";
import { collectTopLevelBindingsPlugin } from "@/features/agent-apps/utils/patch-scope-identifiers";
import type { SandboxImportBinding } from "@/features/agent-apps/utils/allowed-imports";

/**
 * Everything the frame needs to produce a component, and nothing else. It is
 * all plain JSON — a structured clone crosses `postMessage` unchanged (S2).
 */
export interface SandboxBodyPayload {
    /** Babel output with `export default X` already rewritten to `return X`. */
    transformed: string;
    /** THE IMPORT-BINDING CONTRACT's specifiers (allowed-imports.ts). */
    importBindings: SandboxImportBinding[];
    /** Author top-level bindings — kept out of the `new Function` params. */
    declaredTopLevel: string[];
    /** Allowlist paths from the component row (or the kind-component default). */
    allowedImports: string[];
}

export interface TransformKindBodyResult {
    payload: SandboxBodyPayload | null;
    /** A human sentence, never a swallowed failure. */
    error: string | null;
}

/**
 * Transform an organization-authored component body for the sandbox frame.
 * Never throws: a syntax error comes back as `error` so the host can render a
 * named failure instead of an empty box.
 */
export function transformKindComponentBody(
    code: string,
    allowedImports: string[],
): TransformKindBodyResult {
    if (!code || !code.trim()) {
        return { payload: null, error: null };
    }

    try {
        const declaredTopLevel = new Set<string>();
        const componentCandidates: string[] = [];
        const importBindings: SandboxImportBinding[] = [];

        const babelResult = transform(code, {
            presets: [["react", { runtime: "classic" }], "typescript"],
            plugins: [
                collectAndStripImportDeclarationsPlugin(importBindings),
                collectTopLevelBindingsPlugin(
                    declaredTopLevel,
                    componentCandidates,
                ),
            ],
            filename: "kind-component.tsx",
        });

        let transformed = babelResult.code || "";
        if (/export\s+default\s+/.test(transformed)) {
            transformed = transformed.replace(/export\s+default\s+/g, "return ");
        } else {
            // Same rule as compile-slot and the Workflow Studio compiler: a
            // bare top-level `function Card({ data })` is the documented
            // authoring shape, so return the LAST top-level PascalCase binding.
            const candidate =
                componentCandidates[componentCandidates.length - 1];
            if (candidate) transformed = `${transformed}\nreturn ${candidate};`;
        }

        return {
            payload: {
                transformed,
                importBindings,
                declaredTopLevel: Array.from(declaredTopLevel),
                allowedImports,
            },
            error: null,
        };
    } catch (err) {
        return {
            payload: null,
            error:
                err instanceof Error
                    ? err.message
                    : "Unknown compile error while preparing the component for the sandbox.",
        };
    }
}
