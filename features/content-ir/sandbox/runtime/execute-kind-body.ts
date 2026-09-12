/**
 * execute-kind-body — the FRAME half of the sandbox compile.
 *
 * Runs INSIDE the sandbox iframe. It never sees Babel: the parent already
 * transformed the body (`transform/transform-kind-body.ts`) and hands over a
 * `SandboxBodyPayload`. All this does is build the allowlisted scope and call
 * `new Function` — the step CSP `'unsafe-eval'` exists for, which is harmless
 * here precisely because the frame's `connect-src` is `'none'` (plan §1.3).
 *
 * The scope is built by the SHARED allowlist (`buildComponentScope`) so the
 * frame and the page can never disagree about what a component may import.
 * The one substitution happens at bundle time, not here: every
 * `@/components/MarkdownStream` path is aliased to the frame-safe renderer
 * (chair ruling 1). Nothing in this file knows or cares.
 *
 * The dangerous-global stubs are ALWAYS on in the frame. In the page they were
 * a backstop over bare identifiers; here they are belt to the frame's braces,
 * and they keep the error sentence an author already sees identical.
 */
import {
    bindImportedIdentifiers,
    buildComponentScope,
    getScopeFunctionParameters,
    patchScopeForMissingIdentifiers,
} from "@/features/agent-apps/utils/allowed-imports";
import {
    COMPONENT_BANNED_CALLABLES,
    COMPONENT_BANNED_GLOBALS,
} from "@/features/agent-apps/utils/component-source-gate";
import type { SandboxBodyPayload } from "../transform/transform-kind-body";

/**
 * The same throwing stubs `compile-slot.ts` installs in the page, built from
 * the SAME vocabulary (`component-source-gate`'s banned lists) rather than
 * imported from compile-slot — that module pulls `@babel/standalone`, and
 * 2.3 MB of Babel may never enter the frame (plan §1.4). The sentence is
 * word-for-word the page's, so an author sees one message, not two.
 */
function buildDangerousGlobalStubs(): Record<string, unknown> {
    const stubs: Record<string, unknown> = {};
    for (const name of [
        ...COMPONENT_BANNED_GLOBALS,
        ...COMPONENT_BANNED_CALLABLES,
    ]) {
        stubs[name] = function bannedGlobal(): never {
            throw new Error(
                `This component tried to use "${name}". Components stored in the ` +
                    "database run inside the signed-in page and may not reach the " +
                    "network, browser storage, or the JavaScript evaluator. Render what " +
                    "the Shape hands you in props.data, and use a Shape action for " +
                    "anything you need from the server.",
            );
        };
    }
    return stubs;
}

export interface ExecuteKindBodyResult {
    Component: React.ComponentType<Record<string, unknown>> | null;
    /** A human sentence. Never null-with-no-component and no reason. */
    error: string | null;
}

export function executeKindBody(
    payload: SandboxBodyPayload,
): ExecuteKindBodyResult {
    const { transformed, importBindings, declaredTopLevel, allowedImports } =
        payload;

    if (!transformed || !transformed.trim()) {
        return {
            Component: null,
            error: "The component body arrived empty, so there is nothing to render.",
        };
    }

    try {
        const declared = new Set(declaredTopLevel ?? []);
        const scope = buildComponentScope(allowedImports ?? []);
        bindImportedIdentifiers(importBindings ?? [], scope, declared);
        Object.assign(scope, buildDangerousGlobalStubs());
        patchScopeForMissingIdentifiers(transformed, scope, declared);

        const { paramNames, paramValues } = getScopeFunctionParameters(
            scope,
            declared,
        );
        // eslint-disable-next-line no-new-func
        const factory = new Function(...paramNames, transformed);
        const Component = factory(...paramValues) as
            | React.ComponentType<Record<string, unknown>>
            | null;

        if (typeof Component !== "function") {
            return {
                Component: null,
                error: "This component compiled but returned nothing to render. A kind component must export a React component as its default export.",
            };
        }

        return { Component, error: null };
    } catch (err) {
        return {
            Component: null,
            error:
                err instanceof Error
                    ? err.message
                    : "Unknown error while evaluating the component inside the sandbox.",
        };
    }
}
