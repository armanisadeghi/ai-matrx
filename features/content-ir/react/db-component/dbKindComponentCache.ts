/**
 * dbKindComponentCache — THE MATRIX WIRING of the shared DB-component compile
 * cache.
 *
 * The cache itself — per-row-version keys, the scream-once latch,
 * loud-never-fatal `props_transform` recovery, config narrowing, key-family
 * invalidation — lives in `@ai-matrx/content-ir-react`
 * (`db-component/db-kind-component-cache.ts`), absorbed from this module per
 * C22 (this file used to carry all 316 lines of it). Read the semantics
 * there; behavior does not belong here.
 *
 * What stays here is genuinely OURS — injection only:
 *  - THE compiler, `@ai-matrx/code-runtime`'s `kindComponentCompiler` (the
 *    same runtime Applets and the DB tool renderer use; no second one
 *    exists), over the app's scope modules (`lib/code-runtime/app-scope`);
 *  - the default scope (`defaultComponentEntries`, the package's registry);
 *  - the Error Inspector sink (`captureError`);
 *  - the durable incident producer (`reportKindComponentIncident` — files on
 *    the kind's own queue so the component's author learns);
 *  - the invalidation trigger: the package's `invalidateAll` registered under
 *    our `INVALIDATION_KEYS.kindComponents`, fired by name when an agent's
 *    `kindcomp_*` write completes (the D115 inversion — see
 *    `registry/component-registry.ts` for the resolver half).
 *
 * The historical export names are kept so ~all call sites and every doc
 * pointer still read the same.
 */

import {
  createDbKindComponentCache,
  isDbKindComponentBodyPending,
  type CompiledDbKindComponent,
  type DbKindCompileResult,
  type DbKindComponentRenderProps,
  type KindComponentUiOptions,
  type ResolveKindValue,
  type ComponentResolution,
} from "@ai-matrx/content-ir-react";

import { kindComponentCompiler } from "@ai-matrx/code-runtime";
import { defaultComponentEntries } from "@ai-matrx/code-runtime/scope";
import { provideAppScopeModules } from "@/lib/code-runtime/app-scope";
import { captureUnresolvedImports } from "@/lib/diagnostics/captureUnresolvedImports";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import {
  INVALIDATION_KEYS,
  registerInvalidationCallback,
} from "@ai-matrx/kit/invalidation";
import { reportKindComponentIncident } from "./kindComponentIncident";

export {
  isDbKindComponentBodyPending,
  type CompiledDbKindComponent,
  type DbKindCompileResult,
  type DbKindComponentRenderProps,
  type KindComponentUiOptions,
  type ResolveKindValue,
};

/**
 * The row being compiled. The package's compile port passes only
 * `{ code, allowedImports }`, but `cache.getOrCompile` calls it synchronously,
 * so `getOrCompileDbKindComponent` sets this around the call and an
 * unresolved import is filed under the kind row (kind, platform, role) rather
 * than the bare family.
 * Row id: `ComponentResolution` carries no `kind_component.id`; naming it here
 * needs `@ai-matrx/content-ir-react` to add `id` to `ComponentResolution`.
 */
let compilingOrigin: string | null = null;

provideAppScopeModules();

const cache = createDbKindComponentCache({
  // Every body this cache compiles comes out of `content_ir.kind_component`,
  // i.e. it was authored by an organization through the Studio or an agent —
  // never platform code, which ships in the bundle and never reaches a
  // compiler. So the dangerous-global stubs are ON here (Q82 / B-17): a body
  // that reaches for fetch/XHR/WebSocket/eval/storage throws a NAMED error the
  // error boundary shows, instead of quietly reading the reader's session.
  // `kindComponentCompiler` always shadows them.
  compile: kindComponentCompiler({
    origin: () => compilingOrigin ?? "kind-component",
    onUnresolved: captureUnresolvedImports,
  }),
  defaultAllowedImports: defaultComponentEntries,
  reportError: captureError,
  reportIncident: reportKindComponentIncident,
  platform: "web",
  // An agent's kindcomp_* write fires this by NAME (zero import edge from the
  // stream chunk); the resolver refresh registered in component-registry.ts
  // re-keys edited rows via updated_at, and this drop covers force-invalidated
  // families plus re-arming the scream latch.
  registerInvalidation: (invalidateAll) =>
    registerInvalidationCallback(INVALIDATION_KEYS.kindComponents, () =>
      invalidateAll(),
    ),
});

/** Compile (once per resolver key per row version) — package policy, our ports. */
export function getOrCompileDbKindComponent(
  kind: string,
  resolution: ComponentResolution,
  platform = "web",
  role = "output",
): DbKindCompileResult {
  const previous = compilingOrigin;
  compilingOrigin = `kind-component:${kind}:${platform}:${role}`;
  try {
    return cache.getOrCompile(kind, resolution, platform, role);
  } finally {
    compilingOrigin = previous;
  }
}

/** Apply the row's transform — loud on throw, never fatal (package policy). */
export function applyPropsTransform(
  kind: string,
  compiled: CompiledDbKindComponent,
  value: unknown,
): unknown {
  return cache.applyPropsTransform(kind, compiled, value);
}

/** THE CONFIG BOUNDARY — runtime narrowing, never an assertion (package policy). */
export function kindComponentConfig(
  config: unknown,
  kind: string,
): Record<string, unknown> {
  return cache.config(config, kind);
}

/** Drop a key family (authoring surfaces call after editing a row). */
export function invalidateDbKindComponent(
  kind: string,
  platform = "web",
  role = "output",
): void {
  cache.invalidate(kind, platform, role);
}
