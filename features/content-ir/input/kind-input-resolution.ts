/**
 * Pure input-path decision for the D1 input contract — the seam
 * `KindInputForm` routes on, extracted so the routing law is unit-testable
 * without mounting the form or mocking Supabase.
 *
 * THE LAW (mirrors the R6 output gate, input role):
 *
 *   resolveComponent(kind, platform, "input") …
 *     · null            → REFUSE loudly — the kind has no registered input
 *                         path (unknown kind, or a known kind deliberately
 *                         left non-interactive). Never render a guessed form.
 *     · isActive=false  → REFUSE loudly — a held binding is KNOWN-inactive,
 *                         not a license to fall back.
 *     · generic_structured →
 *         - schema with ≥1 field  → "bridged-form": kind fields →
 *           `kindFieldsToVariableDefinitions` (R5) → production
 *           `VariableInputComponent`s → `assembleKindInstance`.
 *         - no stored field list  → "instance-json": ONE whole-instance JSON
 *           textarea validated against `emitted_json_schema`. This is the
 *           documented v1 fallback for python-owned / non-object-root kinds
 *           (workflow I/O scalars store `data = null`), the same posture as
 *           the bridge's structured-JSON textarea for nested fields — honest,
 *           not hidden.
 *     · any other componentKey → REFUSE loudly — a dedicated editor was
 *       registered in the DB but this build has no routing for it. Screaming
 *       beats silently substituting the generic form for a binding that
 *       promised something better.
 *
 * NON-INTERACTIVE BY CLASSIFICATION: the generated data-only contract
 * families (`action_io` / `tool_io` / `agent_io` and the generated
 * `workflow_io` contracts) carry NO input rows on purpose — machines fill
 * them, humans never do. They resolve null here, and that null is correct.
 */

import type { ComponentResolution } from "../registry/component-registry";
import type { KindSchema } from "../core/kind-schema.types";

/**
 * MUST equal `GENERIC_STRUCTURED_COMPONENT_KEY` (react/kind-route.ts) — the
 * literal is duplicated to keep this pure module out of the react layer;
 * equality is pinned by `__tests__/kind-input-form.test.ts`.
 */
export const GENERIC_INPUT_COMPONENT_KEY = "generic_structured";

export type KindInputPath =
  | { mode: "bridged-form" }
  | { mode: "instance-json" }
  | { mode: "refused"; reason: string };

export function decideKindInputPath(
  kind: string,
  resolution: ComponentResolution | null,
  schema: KindSchema | null,
): KindInputPath {
  if (resolution === null) {
    return {
      mode: "refused",
      reason: `No input component is registered for kind "${kind}" (resolver returned null for role "input"). Data-only contract kinds are non-interactive by classification; anything else missing here is a registry gap — add the kind_component row, never a guessed form.`,
    };
  }
  if (!resolution.isActive) {
    return {
      mode: "refused",
      reason: `The input component binding for kind "${kind}" ("${resolution.componentKey}") is registered but inactive — held out of production by its kind_component row.`,
    };
  }
  if (resolution.componentKey !== GENERIC_INPUT_COMPONENT_KEY) {
    return {
      mode: "refused",
      reason: `Kind "${kind}" resolves input component "${resolution.componentKey}", which this build has no routing for — KindInputForm routes only "${GENERIC_INPUT_COMPONENT_KEY}" today. Route the dedicated editor before registering it.`,
    };
  }
  const hasFields = schema !== null && Object.keys(schema.fields).length > 0;
  return hasFields ? { mode: "bridged-form" } : { mode: "instance-json" };
}
