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
 *  - the SHARED in-page allowlist compiler (`compileSlotComponent` over
 *    `buildComponentScope`) — the same machinery Agent Apps and the DB tool
 *    renderer run; no third compiler exists;
 *  - the full registered allowlist (`getDefaultImportsForKindComponents`);
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

import { compileSlotComponent } from "@/features/agent-apps/utils/compile-slot";
import { getDefaultImportsForKindComponents } from "@/features/agent-apps/utils/allowed-imports";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import {
  INVALIDATION_KEYS,
  registerInvalidationCallback,
} from "@/lib/invalidation/invalidation-registry";
import { reportKindComponentIncident } from "./kindComponentIncident";

export {
  isDbKindComponentBodyPending,
  type CompiledDbKindComponent,
  type DbKindCompileResult,
  type DbKindComponentRenderProps,
  type KindComponentUiOptions,
  type ResolveKindValue,
};

const cache = createDbKindComponentCache({
  compile: compileSlotComponent,
  defaultAllowedImports: getDefaultImportsForKindComponents,
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
  return cache.getOrCompile(kind, resolution, platform, role);
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
