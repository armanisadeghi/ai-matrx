/**
 * lib/sync/components/SyncBootScript.tsx
 *
 * Server Component rendered in <head>. Emits a single inline script that, for
 * each `boot-critical` policy with a `prePaint` descriptor:
 *   1. Reads localStorage[storageKey].
 *   2. JSON.parses the envelope body.
 *   3. Applies DOM mutations declaratively — the script NEVER invokes policy
 *      functions (functions don't serialize into a <script> string).
 *
 * Evaluation order per descriptor (G-3):
 *   1. If storage body has fromKey matching allowed shape → apply it.
 *   2. Else if systemFallback is present → evaluate matchMedia(mediaQuery).
 *   3. Else → classToggle: remove class; attribute: set default.
 *
 * Replaces: the inline `<script>` block in `app/layout.tsx` +
 * `features/shell/components/ThemeScript.tsx` (manifest items 2, 3).
 */

// MATRX-EXCEPTION: `Policy<any>` — same invariant-TState reason as
// lib/sync/registry.ts (partialize: readonly (keyof TState)[] makes TState
// invariant, so `Policy<unknown>` cannot accept the registry's heterogeneous
// `readonly Policy<any>[]`). Only non-generic fields are read here
// (config.preset, storageKey, prePaintDescriptors).
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Policy, PrePaintDescriptor } from "../types";
import { getPreset } from "../policies/presets";
import { syncPolicies } from "../registry";

/**
 * Build the inline script body from a set of policies. Pure string assembly,
 * exported for unit tests (pre-paint.test.ts).
 *
 * The emitted script is idempotent: re-running it produces the same DOM state.
 */
export function buildPrePaintScript(policies: readonly Policy<any>[]): string {
    const entries: string[] = [];
    for (const p of policies) {
        const caps = getPreset(p.config.preset);
        if (!caps.allowsPrePaint) continue;
        if (p.prePaintDescriptors.length === 0) continue;
        entries.push(
            JSON.stringify({
                storageKey: p.storageKey,
                descriptors: p.prePaintDescriptors,
            }),
        );
    }
    if (entries.length === 0) return "";

    // The runtime function is intentionally small and dependency-free. It runs
    // before React hydration and must not throw under any input.
    return `(function(){try{var E=[${entries.join(",")}];for(var i=0;i<E.length;i++){var e=E[i];var raw=null;try{raw=window.localStorage.getItem(e.storageKey);}catch(_){raw=null;}var body=null;if(raw){try{var env=JSON.parse(raw);if(env&&typeof env==='object'&&'body'in env){body=env.body;}}catch(_){body=null;}}for(var j=0;j<e.descriptors.length;j++){var d=e.descriptors[j];var t=d.target==='body'?document.body:document.documentElement;if(!t)continue;var v=(body&&typeof body==='object')?body[d.fromKey]:undefined;if(d.kind==='attribute'){var allow=d.allowed||[];if(typeof v==='string'&&allow.indexOf(v)>-1){t.setAttribute(d.attribute,v);}else if(d.systemFallback){var mq=false;try{mq=window.matchMedia(d.systemFallback.mediaQuery).matches;}catch(_){mq=false;}if(mq&&d.systemFallback.applyWhenMatches&&d.systemFallback.whenMatchesValue){t.setAttribute(d.attribute,d.systemFallback.whenMatchesValue);}else{t.setAttribute(d.attribute,d.default);}}else{t.setAttribute(d.attribute,d.default);}}else if(d.kind==='classToggle'){var add;if(typeof v==='string'){add=(v===d.whenEquals);}else if(d.systemFallback){var mq2=false;try{mq2=window.matchMedia(d.systemFallback.mediaQuery).matches;}catch(_){mq2=false;}add=mq2?!!d.systemFallback.applyWhenMatches:false;}else{add=false;}if(add){t.classList.add(d.className);}else{t.classList.remove(d.className);}}}}}catch(_){}})();`;
}

interface SyncBootScriptProps {
    /** Override registry for tests. Defaults to the module-level `syncPolicies`. */
    policies?: readonly Policy<any>[];
}

export function SyncBootScript({ policies = syncPolicies }: SyncBootScriptProps = {}) {
    const script = buildPrePaintScript(policies);
    if (!script) return null;
    return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

/** Exported for tests. */
export const __internal = { buildPrePaintScript };
export type { PrePaintDescriptor };
