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
 * HISTORY: a `dataOnly` signal used to ride through here (2026-07-15 through
 * 2026-08-27), first as a hard refusal, then — post-eviction of machine
 * contracts into `content_ir.io_contract` — as an informational "machine-
 * produced" note. It was sourced from the row's own `metadata.data_only`,
 * the manual per-row flag eradicated 2026-08-27 (Arman's ruling: "if it's
 * dead completely, let's drop it completely and forget it existed"). The
 * instance-JSON fallback below never actually needed that signal — it rests
 * on `hasEmittedSchema` alone, which is what it always needed.
 */

import type { ComponentResolution } from "../registry/component-registry";
import type { KindSchema } from "@ai-matrx/content-ir";

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
  hasEmittedSchema = false,
): KindInputPath {
  if (resolution === null) {
    // A REGISTERED SHAPE WITH A CONTRACT IS NEVER A DEAD END. The
    // instance-JSON editor can edit anything that has an `emitted_json_schema`
    // to validate against, so a missing input-component row costs the nicer
    // form, never the bench. The refusal is reserved for a row with nothing
    // to edit at all, which is a genuine registry gap worth screaming about.
    if (hasEmittedSchema) {
      return { mode: "instance-json" };
    }
    return {
      mode: "refused",
      reason: `No input component is registered for kind "${kind}" (resolver returned null for role "input") and the row carries no emitted_json_schema to edit against — a registry gap: add the kind_component row, never a guessed form.`,
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
