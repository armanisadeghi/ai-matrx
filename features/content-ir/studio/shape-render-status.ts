/**
 * Shape render status — the FIRST-SCREEN, plain-language answer to "what
 * renders this shape right now, and why". Every viewer of `/shapes/[kind]`
 * sees this (owner or not); it is the fix for the 2026-08-26 incident where a
 * kind rendered live in the app while its studio page told the owner — mid
 * customer call — that "this is hardcoded into the frontend" and hid the
 * build-component affordance behind a lying `data_only` flag.
 *
 * Pure derivation only. No fetching, no React — the strip component and any
 * future consumer (agent surface scope, admin honesty panel) call this with
 * data they already have, so the story can never drift between surfaces.
 */

import { GENERIC_STRUCTURED_COMPONENT_KEY } from "@/features/content-ir/registry/schema-source-kind-components";

export type ShapeRenderSourceKind = "custom" | "builtin" | "generic";

export interface ShapeRenderResolutionInput {
  componentKey: string;
  /** `kind_component.source` — "db" (custom) or "bundled" (built-in). */
  source: string;
  /** The resolved row's own `is_active`. */
  isActive: boolean;
  /** True when this row is the `is_default` row among its (kind, platform, role) siblings. */
  isDefault?: boolean;
}

export interface ShapeRenderStatusInput {
  /** `kind_definition.is_active` — the dual-gate verdict, not the component's own flag. */
  kindIsActive: boolean;
  /** `metadata.data_only === true` — the flag that hides component tooling. */
  dataOnly: boolean;
  /** What the resolver currently answers for (kind, "web", "output"); null = no answer at all. */
  resolution: ShapeRenderResolutionInput | null;
  /** How many output-role `kind_component` rows exist for this shape (any source). */
  candidateCount: number;
  /**
   * For a `source: "bundled"` resolution only: does its `component_key`
   * actually resolve in the app's block dispatch table? null = not checked
   * yet (the check is lazy-loaded to avoid pulling the render tree into every
   * page's bundle) — callers should treat null as "unknown", not "broken".
   */
  dispatchResolves: boolean | null;
}

export interface ShapeRenderStatus {
  source: ShapeRenderSourceKind;
  /** The resolved component's key, or null when nothing renders this shape as itself. */
  componentKey: string | null;
  /** User-facing label for WHAT renders it. No "bundled"/"render leg" jargon. */
  sourceLabel: string;
  /** User-facing sentence for WHY this is the one that renders. */
  why: string;
  /** Plain-language problems, empty when nothing is wrong. */
  problems: string[];
}

function isGenericResolution(resolution: ShapeRenderResolutionInput | null): boolean {
  return (
    resolution === null || resolution.componentKey === GENERIC_STRUCTURED_COMPONENT_KEY
  );
}

export function deriveShapeRenderStatus(
  input: ShapeRenderStatusInput,
): ShapeRenderStatus {
  const { kindIsActive, dataOnly, resolution, candidateCount, dispatchResolves } = input;
  const problems: string[] = [];

  if (!kindIsActive) {
    problems.push(
      "This shape is not live, so it can't be bound to an agent's output yet.",
    );
  }

  if (isGenericResolution(resolution)) {
    const why =
      candidateCount > 0
        ? "no registered component for this shape is turned on"
        : "no component has been created for this shape yet";
    if (dataOnly) {
      // Generic + data_only is the ONE consistent combination — a contract
      // kind genuinely has no render leg. Not a problem.
    }
    return {
      source: "generic",
      componentKey: null,
      sourceLabel: "generic viewer — no component yet",
      why,
      problems,
    };
  }

  // Below this point `resolution` is non-null and non-generic.
  const row = resolution as ShapeRenderResolutionInput;

  if (dataOnly) {
    problems.push(
      "This shape is marked \"data only\", which hides its component tools and monitoring — but it has an active component and renders as itself. That flag looks wrong.",
    );
  }

  if (!row.isActive) {
    problems.push(
      "The component registered for this shape is turned off, so it currently falls back to the generic viewer.",
    );
  }

  const isDb = row.source === "db";
  const dangling = !isDb && dispatchResolves === false;
  if (dangling) {
    problems.push(
      "This shape points at a built-in component key the app build doesn't actually have — nothing renders through it until the reference is fixed or the app is redeployed with that key.",
    );
  }

  const why = row.isDefault
    ? "it's the default component for this shape"
    : candidateCount <= 1
      ? "it's the only component registered for this shape"
      : "it's the component the resolver currently picks for this shape";

  return {
    source: isDb ? "custom" : "builtin",
    componentKey: row.componentKey,
    sourceLabel: isDb
      ? "custom component (stored in the database)"
      : dangling
        ? "built-in component (broken reference)"
        : "built-in component (compiled into the app)",
    why,
    problems,
  };
}
