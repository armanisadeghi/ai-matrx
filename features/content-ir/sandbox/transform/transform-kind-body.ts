/**
 * transform-kind-body — the PARENT half of the sandbox compile.
 *
 * THE SPLIT (DD-123 plan §1.4): `@babel/standalone` is pure string → string
 * and executes nothing, so Babel stays in the page and the frame only links
 * and evaluates. Both halves are `@ai-matrx/code-runtime`'s
 * (`/transform` here, `/execute` in the frame), so the sandboxed compile and
 * the in-page compile are the same code and can never drift.
 */
import { transformFiles, type TransformedGraph } from "@ai-matrx/code-runtime/transform";

/** Everything the frame needs to produce a component — plain JSON (S2). */
export interface SandboxBodyPayload {
    graph: TransformedGraph;
    /** Scope entries from the component row (or the kind-component default). */
    allowedImports: string[];
}

export interface TransformKindBodyResult {
    payload: SandboxBodyPayload | null;
    /** A human sentence, never a swallowed failure. */
    error: string | null;
}

const FILE = "kind-component.tsx";

/** Never throws: a syntax error comes back as `error`. */
export function transformKindComponentBody(
    code: string,
    allowedImports: string[],
): TransformKindBodyResult {
    if (!code || !code.trim()) return { payload: null, error: null };
    const result = transformFiles({ [FILE]: code }, FILE);
    return result.ok
        ? { payload: { graph: result.graph, allowedImports }, error: null }
        : { payload: null, error: result.error.message };
}
