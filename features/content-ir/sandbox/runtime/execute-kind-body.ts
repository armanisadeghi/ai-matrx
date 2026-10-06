/**
 * execute-kind-body — the FRAME half of the sandbox compile.
 *
 * Runs INSIDE the sandbox iframe and never sees Babel: the parent already
 * transformed the body (`transform/transform-kind-body.ts`). This links and
 * evaluates it with `@ai-matrx/code-runtime/execute` against the same stored
 * scope the page uses (`lib/code-runtime/stored-scope.ts`; the frame bundle's
 * esbuild aliases swap in the frame-safe Markdown, copy and Applet parts).
 * `new Function` is what CSP `'unsafe-eval'` exists for, harmless here because
 * the frame's `connect-src` is `'none'`.
 *
 * The dangerous-global stubs are ALWAYS on in the frame — belt to the frame's
 * braces, and the sentence an author sees is the page's, word for word.
 */
import { describeUnresolved, executeGraph, type UnresolvedImport } from "@ai-matrx/code-runtime/execute";
import { provideStoredComponentScopeModules } from "@/lib/code-runtime/stored-scope";
import type { SandboxBodyPayload } from "../transform/transform-kind-body";

export interface ExecuteKindBodyResult {
    Component: React.ComponentType<Record<string, unknown>> | null;
    /** A human sentence. Never null-with-no-component and no reason. */
    error: string | null;
    /** Names the body referenced that the scope could not supply (each renders as a stand-in). */
    unresolvedImports: UnresolvedImport[];
}

/** One sentence naming every unresolved import, for the host's error queue. */
export function describeUnresolvedImports(unresolved: readonly UnresolvedImport[]): string {
    return `This component imports something the sandbox cannot supply, so it shows a marked placeholder there: ${unresolved.map(describeUnresolved).join(", ")}.`;
}

export function executeKindBody(payload: SandboxBodyPayload): ExecuteKindBodyResult {
    if (!payload?.graph || Object.keys(payload.graph.modules ?? {}).length === 0) {
        return {
            Component: null,
            error: "The component body arrived empty, so there is nothing to render.",
            unresolvedImports: [],
        };
    }
    provideStoredComponentScopeModules();
    const result = executeGraph(
        payload.graph,
        { entries: payload.allowedImports ?? [], shadowDangerousGlobals: true },
        // The frame reports through its own channel (the mount's onError).
        { origin: "kind-sandbox", onUnresolved: () => undefined },
    );
    return result.ok
        ? { Component: result.Component, error: null, unresolvedImports: result.unresolvedImports }
        : { Component: null, error: result.error.message, unresolvedImports: [] };
}
