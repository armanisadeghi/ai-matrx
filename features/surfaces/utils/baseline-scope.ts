/**
 * Baseline scope floor — the runtime half of the "generic values are always
 * available" guarantee.
 *
 * Every surface declares the generic baseline values (`selection`,
 * `text_before`, `text_after`, `content`, `context`) — injected into every
 * manifest by `features/surfaces/manifests/registry.ts`. This helper is the
 * RUNTIME counterpart: it guarantees those keys are actually PRESENT in the
 * emitted `ApplicationScope` at launch, empty-floored when the surface didn't
 * emit them, so an agent variable bound to a generic value never silently
 * resolves to nothing.
 *
 * The single chokepoint that applies this is `launchAgentExecution`
 * (`features/agents/redux/execution-system/thunks/launch-agent-execution.thunk.ts`),
 * so EVERY agent launch from a surface inherits the floor regardless of how
 * carefully (or carelessly) the surface assembled its scope. The legacy
 * regression this kills: ~14 surfaces dropped `text_before`/`text_after`
 * during the v2 transition, leaving generic bindings blind on those pages.
 *
 * The floor is non-destructive: a key the surface DID emit (even an empty
 * string it deliberately set) is left exactly as-is — only missing keys are
 * filled.
 *
 * Consequence — `required` is a no-op for baseline values, by design. Because
 * the 5 baseline keys are ALWAYS floored to a value at launch, a mapping of
 * `mapType: "surface_value", required: true` that targets a baseline key is
 * effectively always satisfied: the empty floor (`""` / `{}`) counts as a
 * present value, so the "required" check never fails even on a surface that
 * emitted nothing for it. This is intentional — the "generic values are always
 * available" guarantee deliberately wins over per-mapping `required`. Do NOT
 * "fix" this by skipping the floor for required mappings; that would
 * reintroduce the blind-binding regression this floor exists to kill.
 */

import type { ApplicationScope } from "@/features/agents/types/scope.types";
import { BASELINE_VALUE_NAMES } from "../manifests/_baseline.manifest";

/**
 * Return a copy of `scope` with every generic baseline key guaranteed present.
 * Missing string baselines default to `""`; missing `context` defaults to `{}`
 * (it is the one object-typed baseline). Keys the surface already supplied are
 * never overwritten.
 */
export function withBaselineScope(
  scope: ApplicationScope | Record<string, unknown> | null | undefined,
): ApplicationScope {
  const out: ApplicationScope = { ...(scope ?? {}) };
  for (const name of BASELINE_VALUE_NAMES) {
    // Index via a widened `string` key so the `[key: string]: unknown` index
    // signature accepts the assignment — indexing with the narrow `BaselineKey`
    // union resolves to the specific (string & object) property types instead.
    const key: string = name;
    if (out[key] === undefined) {
      out[key] = name === "context" ? {} : "";
    }
  }
  return out;
}
