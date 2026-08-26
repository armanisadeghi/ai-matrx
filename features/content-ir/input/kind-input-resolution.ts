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
 * DATA-ONLY IS A NOTE, NOT A QUARANTINE (post-eviction, 2026-08-24).
 * The hard refusal here dated from 2026-07-15, when 986 machine-minted
 * contracts lived in this registry and `data_only` was their marker.
 * Since the contract-artifact eviction, machine contracts reside in
 * `content_ir.io_contract` and NEVER reach this resolver — every kind that
 * gets here is a real shape. The surviving `data_only: true` rows are
 * hand-seeded, machine-PRODUCED data kinds (SEO/research agent outputs):
 * humans don't author them in production flows, but a human on the shapes
 * TEST BENCH absolutely may construct an instance to exercise the
 * component. So `dataOnly` now annotates the resolved path instead of
 * refusing it; the refusal that guarded against contract rows is enforced
 * upstream by residence, not here.
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
  | { mode: "bridged-form"; note?: string }
  | { mode: "instance-json"; note?: string }
  | { mode: "refused"; reason: string };

/** Shown beside the form for machine-produced kinds — informative, never blocking. */
export function dataOnlyNote(kind: string): string {
  return `"${kind}" is a machine-produced kind — in production flows an agent or pipeline fills it, not a person. This form exists so you can construct a test instance and exercise the component.`;
}

export function decideKindInputPath(
  kind: string,
  resolution: ComponentResolution | null,
  schema: KindSchema | null,
  dataOnly = false,
): KindInputPath {
  if (resolution === null) {
    // A data-only kind with no input row still gets the honest fallback: the
    // instance-JSON editor (schema permitting), annotated — the test bench
    // must never dead-end on a real shape.
    if (dataOnly) {
      return { mode: "instance-json", note: dataOnlyNote(kind) };
    }
    return {
      mode: "refused",
      reason: `No input component is registered for kind "${kind}" (resolver returned null for role "input") — a registry gap: add the kind_component row, never a guessed form.`,
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
  const note = dataOnly ? dataOnlyNote(kind) : undefined;
  return hasFields ? { mode: "bridged-form", note } : { mode: "instance-json", note };
}
